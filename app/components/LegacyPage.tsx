"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getSession, loadBundle, signOut, type Mode } from "../lib/schoolagy";
import { installNsfwGlobal, preloadNsfwModel } from "../lib/nsfw";
import PageSkeleton from "./PageSkeleton";

/**
 * Dark mode + accent/background "theme" tokens, shared by every real app
 * page via the same localStorage records Settings/onboarding already write
 * (`schoolagy_dark_mode`, `schoolagy_appearance`).
 *
 * Added 2026-09-09, fixing two things Martin hit for real:
 *
 *   1. Dark mode was only ever wired up inside settings.html, calendar.html
 *      and onboarding.html — each duplicating its own read+apply logic. The
 *      other 9 real pages (Home, Courses, Course Home, Course Materials,
 *      Gradebook, Grades, Assignments, an assignment's own page, Messages,
 *      Contacts) never read `schoolagy_dark_mode` at all, despite already
 *      defining the exact same --panel-bg/--text-dark/etc. tokens at :root
 *      with the exact same light-mode values — the CSS was ready, nothing
 *      ever applied the dark ones. That's why toggling Dark Mode in
 *      Settings visibly "doesn't do anything but change only the settings
 *      color": Settings (and Calendar) were the only pages listening.
 *   2. Accent/background WERE already applied on every page, but only from
 *      each page's own inline <script> — which LegacyPage only mounts once
 *      the "checking" phase resolves (see the effect below), one paint
 *      after the skeleton/page first appears with its hardcoded default
 *      (`--accent: #d94a2b`, a red-orange). That one-paint gap is what
 *      read as "the red background flashes all the time during page to
 *      page loading."
 *
 * Doing both here instead, once, in a layout effect — which React runs
 * synchronously after the DOM is updated but BEFORE the browser paints,
 * unlike a normal effect — means the very first frame of every route
 * (including the "checking" skeleton) already carries the user's real
 * dark-mode/accent/background choice, and it now covers all 15 routes
 * instead of 3. Each page's own duplicated read-only accent/background IIFE
 * (and settings.html/calendar.html/onboarding.html's own dark-mode logic,
 * which also still WRITES the preference) still runs too, once that page's
 * script mounts — harmless, since it's applying the same values a second
 * time, not worth ripping out of a dozen already-large source pages for a
 * no-op.
 */
function darkenHex(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) * (1 - amount));
  const g = Math.max(0, ((n >> 8) & 255) * (1 - amount));
  const b = Math.max(0, (n & 255) * (1 - amount));
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function applyStoredTheme(): void {
  const root = document.documentElement.style;

  let isDark = false;
  try {
    const v = window.localStorage.getItem("schoolagy_dark_mode");
    if (v === "dark") isDark = true;
    else if (v === "light") isDark = false;
    else isDark = !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  } catch {
    isDark = false;
  }
  if (isDark) {
    root.setProperty("--panel-bg", "#1c1d26");
    root.setProperty("--panel-inner", "#15161e");
    root.setProperty("--text-dark", "#f0f0f5");
    root.setProperty("--text-muted", "#a3a5bd");
    root.setProperty("--text-faint", "#6f7086");
    root.setProperty("--border", "#33344a");
    root.setProperty("--toggle-track-bg", "#3a3c4d");
  } else {
    root.setProperty("--panel-bg", "#eaeaec");
    root.setProperty("--panel-inner", "#dcdce0");
    root.setProperty("--text-dark", "#14151f");
    root.setProperty("--text-muted", "#4b4d63");
    root.setProperty("--text-faint", "#83849a");
    root.setProperty("--border", "#cfcfd6");
    root.setProperty("--toggle-track-bg", "#c7c7cd");
  }
  document.body.classList.toggle("dark-mode", isDark);

  try {
    const raw = window.localStorage.getItem("schoolagy_appearance");
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && saved.accent) {
      root.setProperty("--accent", saved.accent);
      root.setProperty("--accent-dark", saved.accentDark || darkenHex(saved.accent, 0.22));
    }
    if (saved && saved.background) {
      if (saved.background === "white") {
        document.body.style.backgroundImage = "none";
        document.body.style.backgroundColor = "#f4f4f6";
      } else if (saved.background === "black") {
        document.body.style.backgroundImage = "none";
        document.body.style.backgroundColor = "#0c0c0e";
      } else {
        document.body.style.backgroundImage = `url("${saved.background}")`;
        document.body.style.backgroundColor = "";
      }
    }
  } catch {
    // Malformed JSON or private browsing — the page's own default look
    // stands, same as every per-page copy of this same read already does.
  }
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
 *   1. NOTHING renders until the API has confirmed this visitor may see it.
 *      The page's markup is not painted for a signed-out visitor at all — no
 *      flash of content, and no way to see a page by typing its URL.
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

  // Applies the user's saved dark-mode/accent/background before the browser
  // paints (see applyStoredTheme's own comment above) — every route that
  // requires auth, not just the 3 pages that used to duplicate this
  // themselves. Login manages its own fixed look and isn't included.
  useLayoutEffect(() => {
    if (!requiresAuth) return;
    applyStoredTheme();
    function onStorage(e: StorageEvent) {
      if (e.key === "schoolagy_dark_mode" || e.key === "schoolagy_appearance") applyStoredTheme();
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

  useEffect(() => {
    if (phase !== "ready" || !containerRef.current) return;

    const script = document.createElement("script");
    script.text = scriptJs;
    document.body.appendChild(script);

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
  }, [phase, scriptJs, hasUploads]);

  // A page-shaped skeleton until we know who this is — not a spinner (see
  // PageSkeleton.tsx for why: these pages paint their own full-bleed
  // background, and a spinner on a different ground flashes worse than a
  // beat of nothing). The page's own <style> is already injected here so the
  // real background/theme is in place under the skeleton from the first
  // frame; pages with no matching skeleton (login, onboarding) still fall
  // back to the original blank-until-ready behavior.
  if (phase !== "ready") {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: styleCss }} />
        <PageSkeleton id={pageId} />
      </>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styleCss }} />
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
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </>
  );
}
