"use client";

import type { SiteContext } from "@/lib/site";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import { usePathname } from "next/navigation";

export default function SiteShell({
  children,
  siteContext,
}: {
  children: React.ReactNode;
  siteContext: SiteContext;
}) {
  const pathname = usePathname();
  const isInstitutions =
    pathname === "/institutions" || pathname.startsWith("/institutions/");

  if (isInstitutions) {
    return <>{children}</>;
  }

  return (
    <>
      <Navigation siteContext={siteContext} />
      <main className="max-w-4xl mx-auto px-4 py-12 lg:py-16">{children}</main>
      <footer
        style={{
          borderTop: "1px solid #e8e4dc",
          marginTop: "6rem",
          padding: "3rem 1rem",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: "0.8rem", color: "#6b6b6b", margin: 0 }}>
          {siteContext === "ascenso"
            ? "© 2026 Ascenso · LMSA Northeast · Powered by AP MED."
            : "© 2026 AP MED · All rights reserved."}
        </p>
        <p
          style={{
            fontSize: "0.8rem",
            marginTop: "0.4rem",
            margin: "0.4rem 0 0",
          }}
        >
          <a href="mailto:apmedpodcast@gmail.com" style={{ color: "#6b6b6b" }}>
            apmedpodcast@gmail.com
          </a>
        </p>
        <nav aria-label="Legal pages" className="mt-3 flex justify-center gap-5 text-sm text-stone-600">
          <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link>
          <Link href="/terms" className="underline underline-offset-4">Terms of Service</Link>
        </nav>
      </footer>
    </>
  );
}
