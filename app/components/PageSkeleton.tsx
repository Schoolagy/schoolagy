/**
 * Loading placeholders, injected INTO the real page rather than replacing it.
 *
 * ── Why this was rewritten (2026-09-16) ──────────────────────────────────
 * The previous version rendered a hand-drawn stand-in for each whole page:
 * grey boxes where the header goes, grey boxes where the nav goes, grey boxes
 * where the table goes. It was explicitly "not a pixel-perfect replica … a
 * hand-authored approximation of its rough shape," which is exactly the
 * problem — the approximations drifted from the real pages and, in Martin's
 * words, were "not accurate at all."
 *
 * This version follows the pattern Martin sent (the Cloudflare dashboard):
 * the page's real chrome — sidebar, headers, column titles, nav, footer —
 * appears immediately and for real, and only the slots where DATA will land
 * get a shimmer. Nothing is redrawn, so nothing can drift out of shape.
 *
 * The thing that makes this safe: every data container in pages-src ships
 * EMPTY and is filled by the page's own script (`#gradesBody`, `#threadList`,
 * `#assignListBody`, …). So rendering the markup early shows real structure
 * with genuine holes in it — never somebody else's sample grades.
 *
 * ── How the specs work ───────────────────────────────────────────────────
 * Each row template reuses the page's OWN class names. That is deliberate,
 * and the opposite of the old file's reasoning. Borrowing the real classes
 * means the skeleton inherits the real padding, borders and row heights, so
 * the shimmer sits exactly where the content will and nothing jumps when the
 * data arrives. The old worry — that class names change and the skeleton
 * drifts silently — is handled two ways now: the failure mode is benign (an
 * unstyled bar, not a mis-drawn page), and `scripts/verify-pages.mjs` fails
 * the build if a selector below no longer exists in its page.
 */

export const SKELETON_CSS = `
  @keyframes schoolagySkeletonShimmer {
    0%   { background-position: -340px 0; }
    100% { background-position:  340px 0; }
  }
  .skel-bar {
    display: inline-block;
    border-radius: 999px;
    background-color: rgba(120, 120, 135, 0.16);
    background-image: linear-gradient(
      90deg,
      rgba(120, 120, 135, 0.16) 0px,
      rgba(120, 120, 135, 0.16) 150px,
      rgba(120, 120, 135, 0.30) 210px,
      rgba(120, 120, 135, 0.16) 270px,
      rgba(120, 120, 135, 0.16) 420px
    );
    background-size: 680px 100%;
    background-repeat: no-repeat;
    animation: schoolagySkeletonShimmer 1.25s ease-in-out infinite;
  }
  .skel-dot { border-radius: 50%; }
  /* Respect the OS setting: a constant sweep is a problem for some people.
     The bar still reads as a placeholder without moving. */
  @media (prefers-reduced-motion: reduce) {
    .skel-bar { animation: none; }
  }
  /* Nothing inside a skeleton row should be clickable or focusable. */
  [data-skel] { pointer-events: none; user-select: none; }
`;

/** A shimmer bar. `w` accepts any CSS width so rows can vary believably. */
function bar(w: string, h = 10): string {
  return `<span class="skel-bar" style="width:${w};height:${h}px"></span>`;
}

function dot(size = 8): string {
  return `<span class="skel-bar skel-dot" style="width:${size}px;height:${size}px"></span>`;
}

/**
 * Widths cycle rather than sitting uniform, because real rows are ragged —
 * a column of identical bars reads as a loading graphic, a ragged one reads
 * as content that hasn't arrived.
 */
const W = ["68%", "52%", "80%", "44%", "72%", "58%"];
const w = (i: number) => W[i % W.length];

/**
 * Pixel widths, for bars inside shrink-to-fit parents (table cells, flex
 * items). A percentage there resolves against a parent whose width comes from
 * the text that hasn't loaded yet, so it computes to zero and the bar simply
 * doesn't appear.
 */
const PX = ["142px", "104px", "168px", "88px", "150px", "120px"];

export interface SkeletonSpec {
  /** CSS selector for the container the page's script will fill. */
  sel: string;
  /** How many placeholder rows to put in it. */
  count: number;
  /** Row markup, given its index. Reuses the page's real class names. */
  row: (i: number) => string;
}

const SPECS: Record<string, SkeletonSpec[]> = {
  home: [
    // Ships as the literal text "Hey, Martin" and is rewritten from the saved
    // profile once the script runs — so without this it greets every user by
    // the sample name for the length of the fetch.
    { sel: "#greetingTitle", count: 1, row: () => `<span data-skel>${bar("190px", 26)}</span>` },
    {
      sel: "#gradesBody",
      count: 6,
      row: (i) => `<tr data-skel>
        <td><div class="course-cell">${dot()}<span class="course-name">${bar(PX[i % PX.length], 11)}</span></div></td>
        <td>${bar("34px")}</td>
        <td>${bar("72px", 18)}</td>
        <td class="updated">${bar("46px")}</td>
      </tr>`,
    },
    {
      sel: "#overdueList",
      count: 3,
      row: (i) => `<div class="assign-item" data-skel>
        <span class="assign-tick"></span>
        <div class="assign-text"><p class="assign-title">${bar(PX[i % PX.length], 11)}</p>
        <p class="assign-meta">${bar("120px", 8)}</p></div>
        <span class="assign-due">${bar("52px", 9)}</span>
      </div>`,
    },
    {
      sel: "#upcomingList",
      count: 3,
      row: (i) => `<div class="assign-item" data-skel>
        <span class="assign-tick"></span>
        <div class="assign-text"><p class="assign-title">${bar(PX[(i + 2) % PX.length], 11)}</p>
        <p class="assign-meta">${bar("104px", 8)}</p></div>
        <span class="assign-due">${bar("52px", 9)}</span>
      </div>`,
    },
    {
      sel: "#todayList",
      count: 1,
      row: () => `<div class="today-item" data-skel>
        <span class="today-tick"></span>
        <div class="today-item-text"><p class="today-item-title">${bar("132px", 11)}</p>
        <p class="today-item-class">${bar("78px", 8)}</p></div>
      </div>`,
    },
    {
      sel: "#messagesList",
      count: 3,
      row: (i) => `<div class="message-item" data-skel>
        <span class="message-tick"></span>
        <div class="message-item-text">
          <div class="message-item-top"><p class="message-item-from">${bar("96px", 10)}</p>
          <p class="message-item-time">${bar("40px", 9)}</p></div>
          <p class="message-item-preview">${bar(PX[i % PX.length], 9)}</p>
        </div>
      </div>`,
    },
  ],

  /*
   * grades.html renders four cells per row (Class / Grade / Predicted Grade /
   * Grade Calculator) — see renderGradesTable(). The `style="flex:1"` pair on
   * the Class cell is the one thing here that isn't copied from the page: the
   * real name and meta text give `.course-row-text` its width, and an empty
   * placeholder gives an auto-layout table nothing to size the column from, so
   * the min-width stands in for the text that hasn't arrived and stops the
   * Class column snapping wider when it does.
   */
  grades: [
    {
      sel: "#gradesBody",
      count: 6,
      row: (i) => `<tr data-skel>
        <td>
          <div class="course-row">
            <span class="course-tick skel-bar"></span>
            <div class="course-row-text" style="flex:1;min-width:190px">
              <div class="course-row-top">
                <span class="course-row-name" style="flex:1">${bar(w(i), 11)}</span>
                <span class="course-row-code">${bar("42px", 8)}</span>
              </div>
              <div class="course-row-meta">${bar(w(i + 3), 8)}</div>
            </div>
          </div>
        </td>
        <td><span class="grade-val">${bar("20px", 13)}<span class="grade-pct">${bar("30px", 8)}</span></span></td>
        <td><span class="trend flat"><span class="arrow">${dot(7)}</span>${bar("18px", 11)}<span class="grade-pct">${bar("32px", 8)}</span></span></td>
        <td class="calc-cell">${bar("104px", 28)}</td>
      </tr>`,
    },
  ],

  /*
   * courses.html shares the whole `.course-row` / `.grade-val` / `.trend`
   * family with grades.html and adds two columns of its own: the assignment
   * summary (`.assign-cell`, which carries the expand chevron) and Updated.
   * The `upcoming` modifier is kept on `.assign-status` because that is what
   * makes `.assign-status-due` a second line — without it the cell is a line
   * shorter than the rows that replace it.
   */
  courses: [
    {
      sel: "#coursesBody",
      count: 6,
      row: (i) => `<tr data-skel>
        <td>
          <div class="course-row">
            <span class="course-tick skel-bar"></span>
            <div class="course-row-text" style="flex:1;min-width:190px">
              <div class="course-row-top">
                <span class="course-row-name" style="flex:1">${bar(w(i), 11)}</span>
                <span class="course-row-code">${bar("42px", 8)}</span>
              </div>
              <div class="course-row-meta">${bar(w(i + 3), 8)}</div>
            </div>
          </div>
        </td>
        <td><span class="grade-val">${bar("20px", 13)}<span class="grade-pct">${bar("30px", 8)}</span></span></td>
        <td><span class="trend flat"><span class="arrow">${dot(7)}</span>${bar("18px", 11)}<span class="grade-pct">${bar("32px", 8)}</span></span></td>
        <td>
          <div class="assign-cell">
            <span class="assign-status upcoming">${bar("92px", 10)}<span class="assign-status-due">${bar("64px", 8)}</span></span>
            <span class="assign-expand-btn">${bar("13px", 13)}</span>
          </div>
        </td>
        <td class="updated">${bar("52px", 9)}</td>
      </tr>`,
    },
  ],

  /*
   * `#curVal` / `#predVal` are themselves the `.grade-hero-val` spans, so these
   * rows are their *contents*: a letter grade and a `.grade-hero-pct` beside it
   * (and, for the prediction, the `.grade-hero-trend` pill that wraps the
   * arrow). `#gbCategories` mirrors renderCategories(): a `.gb-category` per
   * weighting category, each a head, its `.gb-bar` average meter, and its
   * `.gb-assign-row` list.
   */
  gradebook: [
    {
      sel: "#curVal",
      count: 1,
      row: () => `<span data-skel>${bar("30px", 26)}</span><span class="grade-hero-pct" data-skel>${bar("34px", 10)}</span>`,
    },
    {
      sel: "#predVal",
      count: 1,
      row: () => `<span class="grade-hero-trend flat" data-skel><span class="arrow">${dot(9)}</span>${bar("30px", 26)}</span><span class="grade-hero-pct" data-skel>${bar("34px", 10)}</span>`,
    },
    {
      sel: "#gbCategories",
      count: 3,
      row: (i) => `<div class="gb-category" data-skel>
        <div class="gb-category-head">
          <span class="gb-category-name">${bar("110px", 11)}</span>
          <span class="gb-category-weight">${bar("86px", 9)}</span>
        </div>
        <div class="gb-bar"><div class="gb-bar-fill skel-bar" style="width:${w(i)}"></div></div>
        ${[0, 1, 2]
          .map(
            (j) => `<div class="gb-assign-row">
          <span class="gb-assign-title" style="flex:1">${bar(w(i + j), 10)}</span>
          <span class="gb-assign-score">${bar("54px", 9)}</span>
        </div>`
          )
          .join("")}
      </div>`,
    },
  ],

  /*
   * assignments.html builds its list in assignRowHTML() and groups it under
   * `.assign-group-label` headings on the default "All" tab, so two of the
   * seven placeholders carry a label above them. The status modifier
   * (`overdue`/`upcoming`/…) is deliberately left off: it only recolors the
   * tick, and a grey tick is the honest thing to show before the data says
   * whether anything is late.
   */
  assignments: [
    {
      sel: "#assignListBody",
      count: 7,
      row: (i) => `${
        i === 0 || i === 3 ? `<p class="assign-group-label" data-skel>${bar("68px", 8)}</p>` : ""
      }<div class="assign-row" data-skel>
        <span class="assign-tick"></span>
        <div class="assign-text">
          <p class="assign-course">${bar(w(i), 11)}</p>
          <p class="assign-title">${bar(w(i + 2), 10)}</p>
          <p class="assign-meta">${bar("72px", 8)}</p>
        </div>
        <span class="assign-due">${bar("64px", 9)}</span>
      </div>`,
    },
  ],

  assignment: [
    // `#assignTitle` is a plain <h1 class="title"> the page fills with
    // textContent, so one bar standing in for the line is the whole of it.
    { sel: "#assignTitle", count: 1, row: () => `<span data-skel>${bar("62%", 22)}</span>` },
    {
      // materialRowHTML(m, true) in assignment.html: the file-type badge,
      // the name, and the Download button in its `.material-actions` box.
      sel: "#materialsList",
      count: 3,
      row: (i) => `<div class="material-row" data-skel>
        <span class="material-badge">${bar("30px", 30)}</span>
        <span class="material-name">${bar(w(i), 10)}</span>
        <div class="material-actions">${dot(28)}</div>
      </div>`,
    },
  ],

  messages: [
    {
      // renderThreadList() in messages.html. The name/time line is a flex
      // row, so those two bars are sized in px — a percentage width inside
      // a shrink-to-fit flex item resolves against nothing and collapses.
      sel: "#threadList",
      count: 7,
      row: (i) => `<div class="msgs-thread-row" data-skel>
        <span class="msgs-avatar">${dot(44)}</span>
        <div class="msgs-thread-row-text">
          <div class="msgs-thread-row-top">
            <span class="msgs-thread-row-name">${bar(`${96 + (i % 3) * 22}px`, 11)}</span>
            <span class="msgs-thread-row-time">${bar("34px", 8)}</span>
          </div>
          <div class="msgs-thread-row-subject">${bar(w(i), 9)}</div>
          <div class="msgs-thread-row-preview">${bar(w(i + 2), 9)}</div>
        </div>
      </div>`,
    },
  ],

  contacts: [
    {
      // contactRowHTML() in contacts.html. The row's Email quick-action is
      // a real <a>; a span keeps the same 30px box without being a link.
      sel: "#contactsListBody",
      count: 8,
      row: (i) => `<div class="contact-row" data-skel>
        <span class="contact-avatar">${dot(38)}</span>
        <div class="contact-text">
          <p class="contact-name">${bar(w(i))}</p>
          <p class="contact-role">${bar(w(i + 3), 9)}</p>
          <p class="contact-meta">${bar("52%", 8)}</p>
        </div>
        <span class="contact-email-btn">${dot(14)}</span>
      </div>`,
    },
  ],

  /* calendar: deliberately has no spec.
     #calBody isn't a list of data rows — renderMonthView() replaces it
     wholesale with a .cal-grid-wrap > .cal-dow-row + .cal-month-grid, and
     week/year/search views swap in three further shapes. The grid itself
     is computed locally from focusDate, not fetched: the weekday header
     and every .cal-day-num appear the instant the script runs, so
     shimmering them would claim they're loading. The only real data is the
     .cal-event-chip set, which lands on an unpredictable subset of days —
     any placement we picked would be invented, and the row count (5 vs 6
     week rows) depends on a month we can't know yet. Better nothing than a
     grid that rearranges itself the moment the real one arrives. */

  /*
   * `#curVal` / `#predVal` are the `.grade-hero-val` spans themselves, filled
   * with a letter grade plus a `.grade-hero-pct` (and, for the prediction, the
   * `.grade-hero-trend` pill around the arrow) — same shape as gradebook's.
   * The band class (`good`/`mid`/`bad`) is left off: it only colors the letter,
   * and guessing a color before the grade loads would be a claim, not a shape.
   */
  "course-home": [
    {
      sel: "#curVal",
      count: 1,
      row: () => `<span data-skel>${bar("30px", 26)}</span><span class="grade-hero-pct" data-skel>${bar("34px", 10)}</span>`,
    },
    {
      sel: "#predVal",
      count: 1,
      row: () => `<span class="grade-hero-trend" data-skel><span class="arrow">${dot(9)}</span>${bar("30px", 26)}</span><span class="grade-hero-pct" data-skel>${bar("34px", 10)}</span>`,
    },
    {
      // announceRowHTML(): each post is a <button class="announce-item">.
      // tabindex="-1" keeps the placeholders out of the tab order — the
      // [data-skel] rule handles the pointer, not the keyboard.
      sel: "#announceList",
      count: 3,
      row: (i) => `<button type="button" class="announce-item" tabindex="-1" data-skel>
        <div class="announce-item-head">
          <span class="announce-avatar">${dot(24)}</span>
          <span class="announce-author">${bar("96px", 9)}</span>
          <span class="announce-time">${bar("38px", 8)}</span>
        </div>
        <p class="announce-text">${bar(w(i), 10)}</p>
      </button>`,
    },
    {
      // assignRowHTML(). The status modifier is left off for the same reason
      // as assignments.html's: it only recolors `.hub-assign-tick`, which
      // already has a neutral background of its own.
      sel: "#assignListBody",
      count: 4,
      row: (i) => `<div class="hub-assign-item" data-skel>
        <span class="hub-assign-tick"></span>
        <div class="hub-assign-text">
          <p class="hub-assign-title">${bar(w(i), 10)}</p>
          <p class="hub-assign-meta">${bar("42%", 8)}</p>
        </div>
        <span class="hub-assign-due">${bar("56px", 9)}</span>
      </div>`,
    },
  ],

  /*
   * Only the grid is specced. course-materials.html renders `#itemGrid` or
   * the `#itemList` table depending on `view`, which starts at 'grid', and
   * the table shows up `hidden` in the markup — placeholders in its tbody
   * would be invisible. The star badge is omitted: it's per-file state, so
   * reserving room for one on every tile would invent starred files.
   */
  "course-materials": [
    {
      sel: "#itemGrid",
      count: 10,
      row: (i) => `<div class="item-tile" data-skel>
        <span class="item-icon">${bar("34px", 40)}</span>
        <span class="item-name">${bar(`${44 + (i % 3) * 16}px`, 9)}</span>
      </div>`,
    },
  ],
};

/**
 * Drops placeholder rows into `root` for the given page and returns a cleanup
 * that removes them again.
 *
 * Silently skips a selector that isn't present: a page legitimately renders
 * different containers in different states (Course Materials' grid vs list
 * view), and a missing one during loading is not worth throwing over. Real
 * drift is caught at build time instead — see verify-pages.mjs.
 */
/**
 * The placeholder markup for a page, as `[selector, html]` pairs.
 *
 * Split out from injectSkeleton so it can be built and inspected without a
 * DOM — which is what lets verify/skeleton-preview.mjs render every page's
 * loading state to a real browser for review. A skeleton nobody can look at
 * is how the last set drifted into being wrong.
 */
export function skeletonMarkup(pageId?: string): Array<[string, string]> {
  const specs = pageId ? SPECS[pageId] : undefined;
  if (!specs) return [];
  return specs.map((spec) => [
    spec.sel,
    Array.from({ length: spec.count }, (_, i) => spec.row(i)).join(""),
  ]);
}

export function injectSkeleton(root: HTMLElement, pageId?: string): () => void {
  const specs = pageId ? SPECS[pageId] : undefined;
  if (!specs) return () => {};

  // Original contents are saved and put back on cleanup. That matters for the
  // handful of slots that ship with sample text rather than empty — home's
  // "Hey, Martin" greeting, an assignment's placeholder title. Left alone,
  // those would show one student's sample name to a different student for the
  // length of the fetch, which is worse than a shimmer. Restoring (rather
  // than blanking) means that if the page script never runs, the markup is
  // exactly as it shipped.
  const restore: Array<[HTMLElement, string]> = [];
  for (const spec of specs) {
    const host = root.querySelector<HTMLElement>(spec.sel);
    if (!host) continue;
    restore.push([host, host.innerHTML]);
    host.setAttribute("data-skel-host", "");
    host.innerHTML = Array.from({ length: spec.count }, (_, i) => spec.row(i)).join("");
  }

  return () => {
    for (const [host, html] of restore) {
      host.innerHTML = html;
      host.removeAttribute("data-skel-host");
    }
  };
}

/** Page ids that have a spec — used by verify-pages.mjs and by LegacyPage. */
export const SKELETON_PAGES = Object.keys(SPECS);
export const SKELETON_SELECTORS: Record<string, string[]> = Object.fromEntries(
  Object.entries(SPECS).map(([id, specs]) => [id, specs.map((s) => s.sel)])
);
