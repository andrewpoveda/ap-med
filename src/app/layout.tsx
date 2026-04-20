import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import Navigation from "@/components/Navigation";

export const metadata: Metadata = {
  title: "Andrew Poveda | Portfolio",
  description: "Montclair State University freshman studying Molecular Biology."
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen">
        <Navigation />
        <main className="max-w-4xl mx-auto px-4 py-12 lg:py-16">
          {children}
        </main>
        <Analytics />
      </body>
    </html>
  );
}
