import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Schoolagy",
  description: "Because schoolwork should be simple.",
};

/**
 * Deliberately minimal: every route under app/ is a ported legacy page
 * (see components/LegacyPage.tsx) that already brings its own full-page
 * CSS reset and layout. This shell exists only because Next.js requires
 * exactly one root <html>/<body> — it must not add any styling of its own
 * that could leak into pages that don't expect it.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
