import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Instrument_Serif, Newsreader, Source_Sans_3 } from "next/font/google";

const display = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-enterprise-display",
});

const sans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-enterprise-sans",
});

const brand = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-enterprise-brand",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-enterprise-mono",
});

export const metadata: Metadata = {
  title: "AP MED — Mentorship infrastructure for structured programs",
  description:
    "AP MED is infrastructure organizations use to recruit, match, engage, and measure structured mentorship programs — instead of forms, spreadsheets, calendars, and inboxes.",
};

export default function InstitutionsLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`enterprise ${display.variable} ${sans.variable} ${brand.variable} ${mono.variable}`}
    >
      {children}
    </div>
  );
}
