import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import SiteShell from "@/components/SiteShell";
import PostHogProvider from "@/components/PostHogProvider";
import VercelAnalytics from "@/components/VercelAnalytics";
import {
  ASCENSO_SITE_NAME,
  ASCENSO_SITE_URL,
  getRequestHostname,
  getSiteContext,
  SITE_URL,
  type SiteContext,
} from "@/lib/site";

async function requestSiteContext(): Promise<SiteContext> {
  return getSiteContext(getRequestHostname(await headers()));
}

export async function generateMetadata(): Promise<Metadata> {
  const siteContext = await requestSiteContext();

  if (siteContext === "ascenso") {
    return {
      metadataBase: new URL(ASCENSO_SITE_URL ?? SITE_URL),
      title: ASCENSO_SITE_NAME,
      description:
        "Ascenso is LMSA Northeast's longitudinal mentorship initiative, powered by AP MED.",
    };
  }

  return {
    metadataBase: new URL(SITE_URL),
    title: "AP MED",
    description:
      "Free mentorship for underrepresented pre-med students. Find a mentor matched to your identity, specialty, and goals.",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteContext = await requestSiteContext();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">
        <PostHogProvider>
          <SiteShell siteContext={siteContext}>{children}</SiteShell>
          <VercelAnalytics />
        </PostHogProvider>
      </body>
    </html>
  );
}
