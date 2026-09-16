"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getSession, loadBundle, signOut, type Mode } from "../lib/schoolagy";
import { installNsfwGlobal, preloadNsfwModel } from "../lib/nsfw";
import { SKELETON_CSS, skeletonHtml, revealContent } from "./PageSkeleton";

/**
 * Re-applies the saved theme when ANOTHER tab changes it.
 *
 * The theme itself is applied by the inline boot script in app/layout.tsx
 * (see app/lib/theme-boot.ts), which runs before the first paint — far
 * earlier than any React code can. This file used to carry a second copy of
 * that logic in a layout effect; that copy is gone, and this just calls the
 * one the boot script left on `window`.
 */
function reapplyStoredTheme(): void {
  (window as unknown as { __schoolagyApplyTheme?: () => void }).__schoolagyApplyTheme?.();
}

/**
 * Renders one of Schoolagy's self-contained HTML/CSS/JS pages inside a real
 * Next.js route, and wires it to auth, real data and image screening.
 *
 * Why the pages aren't rewritten as React components: each one is already
 * built, tested and documented in detail, with its own globals, element ids
 * and inline script. Rewriting them idiomatically would risk regressing a lot
 * of tuned behavior for nothing the user would notice. So each page's original
 * style/markup/script is extracted at build time and injected here as-is.
 *
 * Two ordering rules make that work:
 *
 *   1. NO DATA renders until the API has confirmed this visitor may see it.
 *      The empty structure does paint first — that is the whole point of the
 *      skeleton — but every container it contains ships empty in pages-src and
 *      is filled by the page's own script, which only runs once `getSession()`
 *      has come back. A signed-out visitor who types a URL gets a shimmering
 *      shell and an immediate redirect, never a row of anybody's grades.
 *      (An earlier version of this comment claimed the markup didn't paint at
 *      all. It hasn't been true since the markup started mounting immediately,
 *      and it was worth correcting rather than trusting.)
 *   2. `window.__SCHOOLAGY__` (real data) and `window.__schoolagyScanImage`
 *      (the NSFW check) exist BEFORE the page's script runs, since it reads
 *      them synchronously at top level.
 */
export default function LegacyPage({
  title,
  styleCss,
  bodyHtml,
  scriptJs,
  requiresAuth = true,
  hasUploads = false,
  externalScripts = [],
  pageId,
}: {
  title: string;
  styleCss: string;
  bodyHtml: string;
  scriptJs: string;
  /** Login is the one page reachable while signed out. */
  requiresAuth?: boolean;
  /**
   * Whether this page can upload images (onboarding and settings can).
   * Only those pages warm the NSFW model — TensorFlow.js plus the weights is
   * several megabytes, and pulling that onto a page with no file input would
   * be waste on every navigation.
   */
  hasUploads?: boolean;
  /**
   * CDN <script src="…"> URLs this specific page's own script depends on
   * (e.g. JSZip for course-materials' folder download). A source page's
   * <head> can list one, but the port step only ever extracts <title>,
   * <style> and inline <script> — an external tag like this would otherwise
   * silently never load in the real app, with no error, just a feature that
   * always falls back to its "can't do this without a real connection"
   * branch. See scripts/port-pages.mjs's EXTERNAL_SCRIPTS map.
   */
  externalScripts?: string[];
  /**
   * This page's key in scripts/port-pages.mjs's ROUTES (e.g. "home",
   * "gradebook") — passed through so the "checking" phase below can show a
   * matching skeleton instead of blank space. See PageSkeleton.tsx.
   */
  pageId?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * "checking" until the API answers. The page's markup only mounts once this
   * is "ready", so a signed-out visitor never gets a paint of a protected page
   * — which is also why there's no half-rendered flash on a slow connection.
   */
  const [phase, setPhase] = useState<"checking" | "ready">("checking");
  const [mode, setMode] = useState<Mode>("out");
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // The theme is already on screen by now — layout.tsx's boot script applied
  // it before the first paint. This only keeps it in step when the setting is
  // changed in ANOTHER tab. Login manages its own fixed look and isn't
  // included.
  useEffect(() => {
    if (!requiresAuth) return;
    function onStorage(e: StorageEvent) {
      if (e.key === "schoolagy_dark_mode" || e.key === "schoolagy_appearance") reapplyStoredTheme();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [requiresAuth]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  // Start loading any page-specific CDN dependency as early as possible —
  // well before the user could reach whatever feature needs it (e.g.
  // Download Folder on course-materials, which needs JSZip). Dedupe by src
  // so this is a no-op on re-renders and never double-loads.
  useEffect(() => {
    for (const src of externalScripts) {
      if (document.querySelector(`script[src="${src}"]`)) continue;
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
  }, [externalScripts]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // The server is the authority on who this is — not localStorage, which
      // anyone could edit.
      const session = await getSession();
      if (cancelled) return;

      if (requiresAuth && session.mode === "out") {
        window.location.href = "/";
        return;
      }

      installNsfwGlobal();

      // Live mode returns the student's real data mapped into the shapes the
      // page renders; demo mode returns an empty bundle so each page falls
      // through to its own sample data.
      const bundle = requiresAuth ? await loadBundle() : null;
      if (cancelled) return;

      (window as any).__SCHOOLAGY__ = {
        mode: session.mode,
        data: bundle ?? {},
      };
      // Separate from __SCHOOLAGY__ above on purpose: settings.html only
      // needs to know demo-vs-live to gate the sync toggles, not consume real
      // student data, and scripts/verify-pages.mjs's "Live-data hooks" check
      // treats any embedded page script that references the combined global
      // as a page that renders live data — settings and onboarding aren't
      // supposed to be on that list. Set for every page (not just
      // requiresAuth ones) so a page can check it without special-casing.
      (window as any).__SCHOOLAGY_MODE__ = session.mode;

      setMode(session.mode);
      setPhase("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [requiresAuth]);

  /**
   * Sign-out, wired once for the whole app.
   *
   * Home and Settings both already render `[data-action="signout"]` buttons
   * that were never connected to anything. One delegated listener covers both
   * (and any future page with the same button) without editing page markup.
   */
  useEffect(() => {
    let running = false;
    async function runSignOut() {
      // A page's own script may call this directly (window.__schoolagySignOut)
      // as well as the delegated listener below reaching it through a click —
      // guard against both firing at once.
      if (running) return;
      running = true;
      try {
        await signOut();
      } finally {
        window.location.href = "/";
      }
    }

    (window as any).__schoolagySignOut = runSignOut;

    async function onClick(event: MouseEvent) {
      const target = (event.target as HTMLElement | null)?.closest?.(
        '[data-action="signout"]'
      );
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      await runSignOut();
    }
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if ((window as any).__schoolagySignOut === runSignOut) {
        delete (window as any).__schoolagySignOut;
      }
    };
  }, []);

  /**
   * A layout effect, not a plain one, and that matters.
   *
   * When `phase` flips to "ready" React swaps the mounted HTML from the
   * skeleton version to the real one (see `mountedHtml` below), which leaves
   * every data container momentarily EMPTY — the page's script is what fills
   * them. A passive effect is not guaranteed to run before the next paint, so
   * on a slow frame the user would see the skeleton blink out and the page sit
   * hollow before the rows appeared. React runs layout effects synchronously
   * after the DOM update and before the browser paints, which closes that gap
   * by construction rather than by luck.
   */
  useLayoutEffect(() => {
    if (phase !== "ready" || !containerRef.current) return;

    const script = document.createElement("script");
    script.text = scriptJs;
    document.body.appendChild(script);

    /**
     * Hand-off from skeleton to content (2026-09-16).
     *
     * Appending the script above runs it synchronously, so by this line every
     * container the skeleton was holding is already full of real rows — they
     * just haven't been painted yet. Tagging them here, in the same frame,
     * means the browser paints them already mid-animation; a frame later and
     * you'd see them pop in at full opacity first and then fade, which is
     * worse than no animation at all.
     */
    revealContent(containerRef.current, pageId);

    // Warm the model only where an upload is possible, and only after the page
    // is interactive, so a multi-megabyte download never competes with paint.
    if (hasUploads) {
      const warm = window.setTimeout(preloadNsfwModel, 1200);
      return () => {
        window.clearTimeout(warm);
        script.remove();
      };
    }

    return () => {
      script.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, scriptJs, hasUploads, pageId]);

  /**
   * Loading state, reworked 2026-09-16.
   *
   * Two earlier versions, and why neither was right:
   *
   *   1. A hand-drawn stand-in for the whole page, mounted instead of the real
   *      markup. Every heading, column title and nav item was a grey box, and
   *      the drawings drifted from the pages they were imitating.
   *   2. The real markup mounted immediately with shimmer rows pushed into its
   *      data containers by a layout effect. Right shape, wrong timing: a
   *      layout effect only runs once React hydrates, and the server-rendered
   *      HTML is on screen before that — so the first frame was the real card
   *      with real column headings and nothing at all inside it.
   *
   * Now the skeleton is part of the HTML itself. `skeletonHtml` puts the
   * shimmer rows into the markup as a string, so what the server sends already
   * contains them and the very first painted frame is structure-plus-
   * placeholders, with no JavaScript needed to get there. When the fetch
   * resolves this flips to the untouched markup and the page's own script
   * fills it in the same frame (the layout effect above).
   *
   * Nothing moves across that swap: the placeholders sit in the real
   * containers using the real class names, so they already occupy the size and
   * position the data will.
   *
   * Safe because every data container in pages-src ships empty — so this shows
   * genuine structure with holes, never a stranger's sample grades.
   */
  const mountedHtml = useMemo(
    () => (phase === "ready" ? bodyHtml : skeletonHtml(bodyHtml, pageId)),
    [phase, bodyHtml, pageId]
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styleCss }} />
      <style dangerouslySetInnerHTML={{ __html: SKELETON_CSS }} />
      {mode === "demo" && !bannerDismissed && (
        <div
          role="status"
          style={{
            position: "fixed",
            top: 10,
            left: 10,
            zIndex: 2147483000,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 8px 5px 11px",
            borderRadius: 999,
            background: "rgba(17, 17, 24, 0.82)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            color: "#fff",
            font: "600 11px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            letterSpacing: "0.02em",
            boxShadow: "0 4px 14px rgba(0,0,0,0.28)",
          }}
        >
          <span>Demo · sample data</span>
          {/*
            Closing the demo badge signs you out and returns to login, rather
            than just hiding the label. Hiding it would leave someone in demo
            mode with no visible indication they were in it.
          */}
          <button
            type="button"
            onClick={async () => {
              setBannerDismissed(true);
              await signOut();
              window.location.href = "/";
            }}
            aria-label="Leave demo and return to sign in"
            style={{
              all: "unset",
              cursor: "pointer",
              lineHeight: 1,
              padding: "2px 4px",
              borderRadius: 999,
              opacity: 0.65,
            }}
          >
            ✕
          </button>
        </div>
      )}
      {/*
        display:contents is load-bearing. Every ported page styles `body` as its
        layout container and expects its own top-level element to be body's
        direct child. A plain <div> here became the flex item instead and
        collapsed every page's widths; this removes the wrapper's box from the
        layout tree entirely. The element still exists, so the ref works.
      */}
      <div
        ref={containerRef}
        id="legacy-root"
        style={{ display: "contents" }}
        dangerouslySetInnerHTML={{ __html: mountedHtml }}
      />
    </>
  );
}
