import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import Navigation from "@/components/Navigation";
import PostHogProvider from "@/components/PostHogProvider";

export const metadata: Metadata = {
  title: "AP MED",
  description: "Free mentorship for underrepresented pre-med students. Find a mentor matched to your identity, specialty, and goals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
          <Navigation />
          <main className="max-w-4xl mx-auto px-4 py-12 lg:py-16">
            {children}
          </main>
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
            <p style={{ fontSize: "0.8rem", marginTop: "0.4rem", margin: "0.4rem 0 0" }}>
              <a href="mailto:apmedpodcast@gmail.com" style={{ color: "#6b6b6b" }}>
                apmedpodcast@gmail.com
              </a>
            </p>
          </footer>
          <Analytics />
        </PostHogProvider>
      </body>
    </html>
  );
}
