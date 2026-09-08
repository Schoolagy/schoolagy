/**
 * Loading-state placeholders shown while LegacyPage is still "checking"
 * (session + bundle fetch in flight) — see LegacyPage.tsx.
 *
 * Before 2026-09-09, that phase rendered nothing at all: a deliberate choice
 * to avoid a spinner flashing against each page's own background. The
 * tradeoff was a beat of pure blank space on every navigation. This keeps
 * the same "nothing jarring" property (no spinner, no layout shift once the
 * real content mounts — these shapes approximate where it'll land, they
 * don't reserve exact pixels) while giving the wait something to look at:
 * a page-shaped skeleton, one per route, built from a handful of shared
 * shimmering primitives below.
 *
 * These are deliberately NOT pixel-perfect replicas of each page's real
 * markup — they're hand-authored approximations of its rough shape (a
 * table here, a two-pane layout there, a calendar grid on this one). That
 * keeps this file independent of each page's actual CSS classes, which
 * change freely; a skeleton that had to track exact class names would
 * silently drift out of sync with no build-time check to catch it, the way
 * port-pages.mjs's `assertReplaced` catches drift in the real transforms.
 *
 * Pages not listed in SKELETONS below (currently: login, onboarding) fall
 * back to the pre-2026-09-09 blank behavior — a login/wizard screen isn't
 * "loading data" in the same sense the app pages are, so there's nothing
 * useful to sketch the shape of.
 */

const SHIMMER_CSS = `
  @keyframes schoolagySkeletonShimmer {
    0% { background-position: -320px 0; }
    100% { background-position: 320px 0; }
  }
  .skel-shimmer {
    background-color: rgba(120, 120, 135, 0.14);
    background-image: linear-gradient(
      90deg,
      rgba(120, 120, 135, 0.14) 0px,
      rgba(120, 120, 135, 0.14) 140px,
      rgba(120, 120, 135, 0.28) 200px,
      rgba(120, 120, 135, 0.14) 260px,
      rgba(120, 120, 135, 0.14) 400px
    );
    background-size: 640px 100%;
    animation: schoolagySkeletonShimmer 1.6s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .skel-shimmer { animation: none; }
  }
`;

function Bar({
  width = "100%",
  height = 14,
  radius = 8,
  style,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="skel-shimmer"
      style={{ width, height, borderRadius: radius, flexShrink: 0, ...style }}
    />
  );
}

function Circle({ size = 36, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <div
      className="skel-shimmer"
      style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, ...style }}
    />
  );
}

/** The top app-nav bar, shared by every real app page. */
function NavSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        maxWidth: 1100,
        margin: "0 auto",
        padding: "20px 24px 0",
        boxSizing: "border-box",
      }}
    >
      <Bar width={110} height={22} radius={6} />
      <div style={{ display: "flex", gap: 22 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Bar key={i} width={54} height={14} />
        ))}
      </div>
      <Circle size={34} />
    </div>
  );
}

function Page({ children, maxWidth = 1100 }: { children: React.ReactNode; maxWidth?: number }) {
  return (
    <div style={{ maxWidth, margin: "0 auto", padding: "28px 24px 40px", boxSizing: "border-box" }}>
      {children}
    </div>
  );
}

function Card({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "rgba(120,120,135,0.05)",
        border: "1px solid rgba(120,120,135,0.12)",
        borderRadius: 20,
        padding: 24,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Row({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, ...style }}>{children}</div>
  );
}

// ---------------------------------------------------------------- per-page

function HomeSkel() {
  return (
    <Page>
      <Bar width={220} height={30} radius={8} style={{ marginBottom: 24 }} />
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <Card style={{ flex: "1 1 380px" }}>
          <Bar width={140} height={16} style={{ marginBottom: 18 }} />
          {[0, 1, 2, 3].map((i) => (
            <Row key={i} style={{ marginBottom: 16 }}>
              <Circle size={10} />
              <Bar width="70%" />
              <Bar width={40} height={12} style={{ marginLeft: "auto" }} />
            </Row>
          ))}
        </Card>
        <Card style={{ flex: "1 1 380px" }}>
          <Bar width={160} height={16} style={{ marginBottom: 18 }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <Row key={i} style={{ marginBottom: 16 }}>
              <Circle size={18} />
              <div style={{ flex: 1 }}>
                <Bar width="80%" height={12} style={{ marginBottom: 6 }} />
                <Bar width="40%" height={10} />
              </div>
            </Row>
          ))}
        </Card>
      </div>
    </Page>
  );
}

function CoursesSkel() {
  return (
    <Page>
      <Bar width={140} height={30} radius={8} style={{ marginBottom: 24 }} />
      <Card>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Row
            key={i}
            style={{
              padding: "16px 0",
              borderBottom: i < 5 ? "1px solid rgba(120,120,135,0.12)" : "none",
            }}
          >
            <Circle size={10} />
            <div style={{ flex: 1 }}>
              <Bar width="45%" height={14} style={{ marginBottom: 6 }} />
              <Bar width="25%" height={10} />
            </div>
            <Bar width={54} height={22} radius={11} />
          </Row>
        ))}
      </Card>
    </Page>
  );
}

function CourseHomeSkel() {
  return (
    <Page>
      <Bar width={90} height={12} style={{ marginBottom: 20 }} />
      <Card style={{ height: 90, marginBottom: 24 }} />
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <Card style={{ flex: "1 1 320px" }}>
          <Bar width={150} height={16} style={{ marginBottom: 18 }} />
          {[0, 1, 2].map((i) => (
            <Row key={i} style={{ marginBottom: 16, alignItems: "flex-start" }}>
              <Circle size={30} />
              <div style={{ flex: 1 }}>
                <Bar width="90%" height={12} style={{ marginBottom: 6 }} />
                <Bar width="60%" height={12} />
              </div>
            </Row>
          ))}
        </Card>
        <Card style={{ flex: "1 1 320px" }}>
          <Bar width={130} height={16} style={{ marginBottom: 18 }} />
          {[0, 1, 2, 3].map((i) => (
            <Row key={i} style={{ marginBottom: 16 }}>
              <Circle size={16} />
              <Bar width="75%" />
            </Row>
          ))}
        </Card>
      </div>
    </Page>
  );
}

function CourseMaterialsSkel() {
  return (
    <Page>
      <Bar width={90} height={12} style={{ marginBottom: 20 }} />
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: 14,
            borderBottom: "1px solid rgba(120,120,135,0.12)",
          }}
        >
          <Circle size={12} />
          <Circle size={12} />
          <Circle size={12} />
          <Bar width={160} height={12} style={{ marginLeft: 16 }} />
        </div>
        <div style={{ display: "flex", minHeight: 320 }}>
          <div
            style={{
              width: 160,
              borderRight: "1px solid rgba(120,120,135,0.12)",
              padding: 16,
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <Bar key={i} width="85%" height={12} style={{ marginBottom: 18 }} />
            ))}
          </div>
          <div
            style={{
              flex: 1,
              padding: 20,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
              gap: 20,
              alignContent: "start",
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <Bar width={54} height={54} radius={10} />
                <Bar width="80%" height={9} />
              </div>
            ))}
          </div>
        </div>
      </Card>
    </Page>
  );
}

function GradebookSkel() {
  return (
    <Page>
      <Bar width={90} height={12} style={{ marginBottom: 20 }} />
      <Card>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <Bar width={160} height={160} radius={80} />
        </div>
        {[0, 1, 2].map((cat) => (
          <div key={cat} style={{ marginBottom: 22 }}>
            <Row style={{ marginBottom: 10 }}>
              <Bar width={130} height={13} />
              <Bar width={44} height={11} style={{ marginLeft: "auto" }} />
            </Row>
            {[0, 1].map((row) => (
              <Row key={row} style={{ marginBottom: 8, paddingLeft: 8 }}>
                <Bar width="55%" height={11} />
                <Bar width={40} height={11} style={{ marginLeft: "auto" }} />
              </Row>
            ))}
          </div>
        ))}
      </Card>
    </Page>
  );
}

function GradesSkel() {
  return (
    <Page>
      <Bar width={100} height={30} radius={8} style={{ marginBottom: 24 }} />
      <Card style={{ marginBottom: 24 }}>
        {[0, 1, 2, 3].map((i) => (
          <Row
            key={i}
            style={{
              padding: "14px 0",
              borderBottom: i < 3 ? "1px solid rgba(120,120,135,0.12)" : "none",
            }}
          >
            <Circle size={9} />
            <Bar width="40%" height={13} />
            <Bar width={50} height={20} radius={10} style={{ marginLeft: "auto" }} />
          </Row>
        ))}
      </Card>
      <Card style={{ height: 180 }} />
    </Page>
  );
}

function AssignmentsSkel() {
  return (
    <Page>
      <Bar width={160} height={30} radius={8} style={{ marginBottom: 20 }} />
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        {[0, 1, 2, 3].map((i) => (
          <Bar key={i} width={78} height={30} radius={15} />
        ))}
      </div>
      <Card>
        <Bar width={100} height={13} style={{ marginBottom: 16 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <Row key={i} style={{ marginBottom: 18 }}>
            <Circle size={16} />
            <div style={{ flex: 1 }}>
              <Bar width="65%" height={13} style={{ marginBottom: 6 }} />
              <Bar width="30%" height={10} />
            </div>
            <Bar width={70} height={10} />
          </Row>
        ))}
      </Card>
    </Page>
  );
}

function AssignmentSkel() {
  return (
    <Page>
      <Bar width={90} height={12} style={{ marginBottom: 20 }} />
      <Card style={{ marginBottom: 22 }}>
        <Bar width="70%" height={22} style={{ marginBottom: 10 }} />
        <Bar width="35%" height={12} style={{ marginBottom: 20 }} />
        <Bar width="100%" height={10} style={{ marginBottom: 8 }} />
        <Bar width="95%" height={10} style={{ marginBottom: 8 }} />
        <Bar width="60%" height={10} />
      </Card>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <Card style={{ flex: "1 1 260px" }}>
          <Bar width={110} height={14} style={{ marginBottom: 16 }} />
          {[0, 1].map((i) => (
            <Row key={i} style={{ marginBottom: 14 }}>
              <Bar width={26} height={26} radius={6} />
              <Bar width="60%" height={11} />
            </Row>
          ))}
        </Card>
        <Card style={{ flex: "1 1 260px", height: 110 }} />
      </div>
    </Page>
  );
}

function CalendarSkel() {
  return (
    <Page maxWidth={1160}>
      <Bar width={160} height={30} radius={8} style={{ marginBottom: 20 }} />
      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ width: 220, flexShrink: 0 }}>
          <Card style={{ marginBottom: 20 }}>
            <Bar width={100} height={12} style={{ marginBottom: 14 }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
              {Array.from({ length: 28 }).map((_, i) => (
                <Bar key={i} width="100%" height={16} radius={4} />
              ))}
            </div>
          </Card>
          <Card style={{ height: 140 }} />
        </div>
        <Card style={{ flex: 1, padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
            {Array.from({ length: 35 }).map((_, i) => (
              <Bar key={i} width="100%" height={64} radius={8} />
            ))}
          </div>
        </Card>
      </div>
    </Page>
  );
}

function MessagesSkel() {
  return (
    <Page maxWidth={1100}>
      <Bar width={150} height={30} radius={8} style={{ marginBottom: 20 }} />
      <Card style={{ padding: 0, display: "flex", height: 460, overflow: "hidden" }}>
        <div style={{ width: 280, borderRight: "1px solid rgba(120,120,135,0.12)", padding: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Row key={i} style={{ padding: "10px 6px" }}>
              <Circle size={38} />
              <div style={{ flex: 1 }}>
                <Bar width="70%" height={12} style={{ marginBottom: 6 }} />
                <Bar width="90%" height={10} />
              </div>
            </Row>
          ))}
        </div>
        <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <Bar width={220} height={38} radius={16} style={{ alignSelf: "flex-start" }} />
          <Bar width={160} height={30} radius={16} style={{ alignSelf: "flex-end" }} />
          <Bar width={260} height={44} radius={16} style={{ alignSelf: "flex-start" }} />
          <Bar width={130} height={30} radius={16} style={{ alignSelf: "flex-end" }} />
        </div>
      </Card>
    </Page>
  );
}

function ContactsSkel() {
  return (
    <Page>
      <Bar width={130} height={30} radius={8} style={{ marginBottom: 24 }} />
      <Card>
        {Array.from({ length: 6 }).map((_, i) => (
          <Row
            key={i}
            style={{
              padding: "14px 0",
              borderBottom: i < 5 ? "1px solid rgba(120,120,135,0.12)" : "none",
            }}
          >
            <Circle size={40} />
            <div style={{ flex: 1 }}>
              <Bar width="35%" height={13} style={{ marginBottom: 6 }} />
              <Bar width="50%" height={10} />
            </div>
            <Bar width={70} height={26} radius={13} />
          </Row>
        ))}
      </Card>
    </Page>
  );
}

function SettingsSkel() {
  return (
    <Page>
      <Bar width={110} height={30} radius={8} style={{ marginBottom: 24 }} />
      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ width: 200, flexShrink: 0 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Bar key={i} width="90%" height={16} style={{ marginBottom: 20 }} />
          ))}
        </div>
        <Card style={{ flex: 1 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Row
              key={i}
              style={{
                padding: "16px 0",
                borderBottom: i < 3 ? "1px solid rgba(120,120,135,0.12)" : "none",
              }}
            >
              <div style={{ flex: 1 }}>
                <Bar width="40%" height={13} style={{ marginBottom: 6 }} />
                <Bar width="60%" height={10} />
              </div>
              <Bar width={42} height={24} radius={12} />
            </Row>
          ))}
        </Card>
      </div>
    </Page>
  );
}

const SKELETONS: Record<string, () => React.ReactElement> = {
  home: HomeSkel,
  courses: CoursesSkel,
  "course-home": CourseHomeSkel,
  "course-materials": CourseMaterialsSkel,
  gradebook: GradebookSkel,
  grades: GradesSkel,
  assignments: AssignmentsSkel,
  assignment: AssignmentSkel,
  calendar: CalendarSkel,
  messages: MessagesSkel,
  contacts: ContactsSkel,
  settings: SettingsSkel,
};

export default function PageSkeleton({ id }: { id?: string }) {
  const Body = id ? SKELETONS[id] : undefined;
  // No entry (login, onboarding, or an id we don't recognize) — fall back to
  // the pre-2026-09-09 behavior of rendering nothing.
  if (!Body) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SHIMMER_CSS }} />
      <NavSkeleton />
      <Body />
    </>
  );
}
