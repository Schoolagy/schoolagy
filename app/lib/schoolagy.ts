/**
 * Session + data layer shared by every page.
 *
 * Schoolagy runs in one of three states:
 *
 *   "live" — signed in with a real Schoology personal API key. Pages render
 *            the student's actual courses, grades and assignments.
 *   "demo" — signed in with "demo" as both the key and the secret. Every page
 *            runs on its own built-in sample data, so a beta tester with no
 *            Schoology account can use the whole app.
 *   "out"  — not signed in. App pages bounce back to the login screen.
 *
 * IMPORTANT: the server decides which of those you are, not the browser.
 *
 * An earlier version kept the mode in localStorage and let Escape on the login
 * screen set it, which meant anyone could type a URL or edit browser storage
 * and walk straight into any page. Now the only way in is a session cookie
 * issued by api.schoolagy.io after it accepted your credentials — httpOnly, so
 * page JS can't read or forge it — and every page asks the API who you are
 * before it renders anything.
 */

export type Mode = "live" | "demo" | "out";

/** Short-lived cache of the API's answer, so navigating doesn't re-ask every time. */
const SESSION_CACHE = "schoolagy_session_state";
const SESSION_CACHE_MS = 60 * 1000;

const BUNDLE_CACHE = "schoolagy_bundle_cache";

export const API_BASE =
  typeof window !== "undefined" &&
  window.location.hostname.endsWith("schoolagy.io")
    ? "https://api.schoolagy.io"
    : "http://localhost:8787";

function cacheGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function cacheSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* private browsing — we just re-ask the API each time */
  }
}
function cacheClear(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* non-fatal */
  }
}

export interface SessionState {
  mode: Mode;
  name?: string;
}

/**
 * Asks the API who this visitor is.
 *
 * This is the authorization check for the whole app. The cache below is only a
 * latency optimization with a one-minute life — it can make a page render a
 * moment sooner, never let someone in who shouldn't be. Anything that gets a
 * 401 from the API clears it immediately.
 */
export async function getSession(): Promise<SessionState> {
  const cached = cacheGet(SESSION_CACHE);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.at < SESSION_CACHE_MS) {
        return parsed.state as SessionState;
      }
    } catch {
      cacheClear(SESSION_CACHE);
    }
  }

  let state: SessionState = { mode: "out" };
  try {
    const response = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
    if (response.ok) {
      const data = (await response.json()) as any;
      state = { mode: data?.demo ? "demo" : "live", name: data?.name };
    }
  } catch {
    // Network failure is not authorization. Treat it as signed-out rather than
    // letting someone in because the API happened to be unreachable.
    state = { mode: "out" };
  }

  cacheSet(SESSION_CACHE, JSON.stringify({ at: Date.now(), state }));
  return state;
}

export interface SignInResult {
  ok: boolean;
  error?: string;
  demo?: boolean;
}

/**
 * Signs in with a Schoology personal API key — or with "demo"/"demo", which is
 * the one and only way into sample-data mode.
 */
export async function signIn(key: string, secret: string): Promise<SignInResult> {
  try {
    const response = await fetch(`${API_BASE}/auth/session`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, secret }),
    });
    const data = (await response.json().catch(() => ({}))) as any;
    if (!response.ok) {
      return { ok: false, error: data?.error ?? `http_${response.status}` };
    }
    // A fresh sign-in invalidates whatever we thought before.
    cacheClear(SESSION_CACHE);
    cacheClear(BUNDLE_CACHE);
    return { ok: true, demo: !!data?.demo };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function signOut(): Promise<void> {
  cacheClear(SESSION_CACHE);
  cacheClear(BUNDLE_CACHE);
  try {
    const controller = new AbortController();
    // The button must never feel stuck: if the API doesn't answer quickly,
    // give up on the network call and move on — the caches above are already
    // cleared and the cookie will expire on its own either way.
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      await fetch(`${API_BASE}/auth/session`, {
        method: "DELETE",
        credentials: "include",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    /* the cookie expires on its own; local caches are already cleared */
  }
}

export interface Bundle {
  generatedAt?: string;
  demo?: boolean;
  COURSES?: unknown[];
  HISTORY?: Record<string, unknown>;
  OVERDUE?: unknown[];
  UPCOMING?: unknown[];
  TODAY?: unknown[];
  MESSAGES?: unknown[];
}

/**
 * Fetches the adapted data bundle.
 *
 * In demo mode the API returns an empty bundle on purpose, which is the signal
 * for each page to fall through to the sample data in its own markup.
 */
export async function loadBundle(): Promise<Bundle | null> {
  const cached = cacheGet(BUNDLE_CACHE);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.at < 5 * 60 * 1000) return parsed.bundle as Bundle;
    } catch {
      cacheClear(BUNDLE_CACHE);
    }
  }

  try {
    const response = await fetch(`${API_BASE}/data/bundle`, { credentials: "include" });
    if (response.status === 401) {
      // Session died underneath us — drop the cached "you're signed in" answer
      // so the next guard check sends them back to sign in.
      cacheClear(SESSION_CACHE);
      return null;
    }
    if (!response.ok) return null;
    const bundle = (await response.json()) as Bundle;
    cacheSet(BUNDLE_CACHE, JSON.stringify({ at: Date.now(), bundle }));
    return bundle;
  } catch {
    return null;
  }
}

export function invalidateBundle(): void {
  cacheClear(BUNDLE_CACHE);
}
