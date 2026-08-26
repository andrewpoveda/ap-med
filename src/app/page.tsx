import type { Metadata } from "next";
import HomepageExperience from "@/components/HomepageExperience";
import { isAscensoVisible } from "@/lib/app-settings";

// Dynamic because the Ascenso panel below is gated on a per-request DB read.
// Without this Next prerenders the page and bakes today's flag value in, which
// is exactly the bug the app_settings flag exists to kill.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AP MED | Free Mentorship for Underrepresented Pre-Med Students",
  description:
    "AP MED connects first-gen and underrepresented pre-med students with identity-matched physicians, residents, and medical students. Free forever.",
};

export default async function Home() {
  // Same flag the two /ascenso pages and the sitemap read. This hides the only
  // link into the funnel from anywhere on the site, so the panel and the routes
  // it points at appear and disappear together.
  const ascensoPublic = await isAscensoVisible();

  return <HomepageExperience ascensoVisible={ascensoPublic} />;
}
