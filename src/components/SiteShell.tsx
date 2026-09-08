"use client";

import Navigation from "@/components/Navigation";
import { usePathname } from "next/navigation";

export default function SiteShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isInstitutions =
    pathname === "/institutions" || pathname.startsWith("/institutions/");

  if (isInstitutions) {
    return <>{children}</>;
  }

  return (
    <>
      <Navigation />
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
          © 2026 AP MED · All rights reserved.
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
      </footer>
    </>
  );
}
