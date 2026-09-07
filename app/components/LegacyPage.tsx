"use client";

import { useEffect, useRef, useState } from "react";
import { getMode, loadBundle, signOut, type Mode } from "../lib/schoolagy";
import { installNsfwGlobal, preloadNsfwModel } from "../lib/nsfw";

/**
 * Renders one of Schoolagy's self-contained HTML/CSS/JS pages inside a real
 * Next.js route, and wires it to real data, image screening and auth.
 *
 * Why the pages aren't rewritten as React components: each one (login,
 * onboarding, home, messages, settings, ...) is an already-built, already-
 * tested document with its own globals, element ids and inline script, and the
 * behavior in them is documented in detail in architecture-decisions.md.
 * Rewriting them idiomatically would risk regressing months of tuned behavior
 * for no functional gain. So each page's original style/markup/script is
 * extracted at build time and injected here as-is:
 *
 *   - markup goes in via dangerouslySetInnerHTML
 *   - the original script is re-run through a real <script> element, because
 *     scripts inserted via innerHTML never execute (per the HTML spec)
 *
 * The important ordering rule: everything the legacy script depends on —
 * `window.__SCHOOLAGY__` (real data) and `window.__schoolagyScanImage` (the
 * NSFW check) — must exist BEFORE that script runs, since it reads them
 * synchronously at top level. That's why the script injection waits on the
 * data fetch instead of racing it.
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
   * be pure waste on every navigation.
   */
  hasUploads?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("signed-out");
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const currentMode = getMode();

      if (requiresAuth && currentMode === "signed-out") {
        // Nothing to render for a signed-out visitor on an app page — send
        // them to sign in rather than flashing an empty shell first.
        window.location.href = "/";
        return;
      }

      // Cheap: just puts the scan function on window for the legacy upload
      // gate to call. The heavy model load happens on first actual use.
      installNsfwGlobal();

      // In live mode this returns the student's real data mapped into the
      // exact shapes the page already renders; in mock mode it returns null
      // and the page falls back to its own built-in sample data.
      const bundle = await loadBundle();
      if (cancelled) return;

      (window as any).__SCHOOLAGY__ = {
        mode: currentMode,
        data: bundle ?? {},
      };

      setMode(currentMode);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [requiresAuth]);

  /**
   * Sign-out, wired once for the whole app.
   *
   * Home and Settings both already render `[data-action="signout"]` buttons
   * that were never connected to anything — clicking one just closed the menu.
   * A single delegated listener covers both (and any future page that adds the
   * same button) without editing page markup, and it's what lets a beta tester
   * leave demo mode: without it, pressing Escape once would strand them in it.
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
    if (!ready || !containerRef.current) return;

    const script = document.createElement("script");
    script.text = scriptJs;
    document.body.appendChild(script);

    // Warm the model in the background, but only where an upload is actually
    // possible — and after the page itself is interactive, so a multi-megabyte
    // model download never competes with first paint.
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
    // Re-runs only when the page's own script changes (i.e. on navigation to a
    // different route), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, scriptJs, hasUploads]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styleCss }} />
      {mode === "mock" && !bannerDismissed && (
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
            pointerEvents: "auto",
          }}
        >
          <span>Beta · demo data</span>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            aria-label="Hide demo data notice"
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
      <div
        ref={containerRef}
        id="legacy-root"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </>
  );
}
