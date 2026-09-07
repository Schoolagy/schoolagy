/**
 * Session + data layer shared by every page.
 *
 * Schoolagy runs in one of three states:
 *
 *   "live"       — signed in with a real Schoology personal API key. Pages
 *                  render the student's actual courses, grades and assignments,
 *                  fetched through api.schoolagy.io (which does the OAuth
 *                  signing; the secret never reaches this code).
 *   "mock"       — beta/demo mode, entered by pressing Escape on the login
 *                  screen. Every page runs on its own built-in sample data, so
 *                  a tester with no Schoology account can use the whole app.
 *   "signed-out" — neither. Pages other than login bounce back to login.
 *
 * Mock mode is deliberately not a stripped-down preview: it's the same pages,
 * the same components, the same interactions — only the data source differs.
 */

export type Mode = "live" | "mock" | "signed-out";

const MOCK_FLAG = "schoolagy_mock_mode";
const SIGNED_IN_FLAG = "schoolagy_signed_in";
const BUNDLE_CACHE = "schoolagy_bundle_cache";

/**
 * The session cookie itself is httpOnly (deliberately — it holds the sealed
 * Schoology credentials and must be unreadable to JS, including ours). So this
 * flag is only a hint that we *believe* we're signed in; the API is the
 * authority, and a 401 from it clears the hint.
 */
export const API_BASE =
  typeof window !== "undefined" &&
  window.location.hostname.endsWith("schoolagy.io")
    ? "https://api.schoolagy.io"
    : "http://localhost:8787";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private browsing / blocked storage — treat as absent rather than throwing
    // and taking the whole page down with it.
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* non-fatal */
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* non-fatal */
  }
}

export function getMode(): Mode {
  if (typeof window === "undefined") return "signed-out";
  if (safeGet(SIGNED_IN_FLAG) === "1") return "live";
  if (safeGet(MOCK_FLAG) === "1") return "mock";
  return "signed-out";
}

export function enterMockMode(): void {
  safeSet(MOCK_FLAG, "1");
  safeRemove(SIGNED_IN_FLAG);
}

export function markSignedIn(): void {
  safeSet(SIGNED_IN_FLAG, "1");
  safeRemove(MOCK_FLAG);
}

export async function signOut(): Promise<void> {
  safeRemove(SIGNED_IN_FLAG);
  safeRemove(MOCK_FLAG);
  safeRemove(BUNDLE_CACHE);
  try {
    await fetch(`${API_BASE}/auth/session`, {
      method: "DELETE",
      credentials: "include",
    });
  } catch {
    // Network failure on sign-out still signs you out locally — the local
    // flags are already cleared above, and the cookie expires on its own.
  }
}

export interface SignInResult {
  ok: boolean;
  /** Machine-readable reason, present when ok is false. */
  error?: string;
  user?: {
    uid: string;
    name: string;
    firstName: string;
    email: string;
    pictureUrl: string;
  };
}

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
    markSignedIn();
    return { ok: true, user: data.user };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export interface Bundle {
  generatedAt?: string;
  COURSES?: unknown[];
  HISTORY?: Record<string, unknown>;
  OVERDUE?: unknown[];
  UPCOMING?: unknown[];
  TODAY?: unknown[];
  MESSAGES?: unknown[];
}

/**
 * Fetches the adapted data bundle for live mode.
 *
 * Returns null in mock/signed-out mode, which is the signal for pages to fall
 * back to their own built-in sample data. A cached copy is served immediately
 * on repeat navigations so moving between pages doesn't re-hit Schoology every
 * time, then refreshed in the background.
 */
export async function loadBundle(): Promise<Bundle | null> {
  if (getMode() !== "live") return null;

  const cached = safeGet(BUNDLE_CACHE);
  let cachedBundle: Bundle | null = null;
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      // Five minutes: fresh enough that a newly-posted grade shows up quickly,
      // long enough that clicking through four pages is one fetch, not four.
      if (Date.now() - parsed.__at < 5 * 60 * 1000) {
        cachedBundle = parsed.bundle as Bundle;
      }
    } catch {
      safeRemove(BUNDLE_CACHE);
    }
  }
  if (cachedBundle) return cachedBundle;

  try {
    const response = await fetch(`${API_BASE}/data/bundle`, {
      credentials: "include",
    });
    if (response.status === 401) {
      // Session expired or revoked — drop the hint so the guard sends the user
      // back to sign in rather than rendering an empty app.
      safeRemove(SIGNED_IN_FLAG);
      return null;
    }
    if (!response.ok) return null;
    const bundle = (await response.json()) as Bundle;
    safeSet(BUNDLE_CACHE, JSON.stringify({ __at: Date.now(), bundle }));
    return bundle;
  } catch {
    return null;
  }
}

/** Wipes the cached bundle so the next load refetches. */
export function invalidateBundle(): void {
  safeRemove(BUNDLE_CACHE);
}
