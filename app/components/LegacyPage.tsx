"use client";

import { useEffect, useRef, useState } from "react";
import { getSession, loadBundle, signOut, type Mode } from "../lib/schoolagy";
import { installNsfwGlobal, preloadNsfwModel } from "../lib/nsfw";

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

  useEffect(() => {
    document.title = title;
  }, [title]);

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
    async function onClick(event: MouseEvent) {
      const target = (event.target as HTMLElement | null)?.closest?.(
        '[data-action="signout"]'
      );
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      await signOut();
      window.location.href = "/";
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
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

  // Nothing at all until we know who this is. Deliberately blank rather than a
  // spinner: these pages paint their own full-bleed background, and a spinner
  // on a different ground flashes worse than a beat of nothing.
  if (phase !== "ready") {
    return <style dangerouslySetInnerHTML={{ __html: styleCss }} />;
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
