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
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen">
        <PostHogProvider>
          <Navigation />
          <main className="max-w-4xl mx-auto px-4 py-12 lg:py-16">
            {children}
          </main>
          <Analytics />
        </PostHogProvider>
      </body>
    </html>
  );
}
