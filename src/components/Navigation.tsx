"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SPOTIFY_SHOW_URL = "https://open.spotify.com/show/2CsWyH724wl7qHG1E6M3DB";

type NavItem = {
  href: string;
  label: string;
  external?: boolean;
};

const navItems: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: SPOTIFY_SHOW_URL, label: "Podcast", external: true },
  { href: "/mentors", label: "Mentors" },
  { href: "/mentor-onboarding", label: "Become a Mentor" },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-[#e8e4dc] bg-[#faf8f4]">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-16 gap-4">
          <Link
            href="/"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
            className="text-2xl text-[#1a1a2e] tracking-wide hover:opacity-80 transition-opacity whitespace-nowrap shrink-0"
          >
            AP MED
          </Link>
          <div className="flex items-center gap-4 md:gap-7 overflow-x-auto no-scrollbar min-w-0">
            {navItems.map((item) =>
              item.external ? (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium transition-colors whitespace-nowrap text-[#6b6b6b] hover:text-[var(--global-theme-color)]"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-sm font-medium transition-colors whitespace-nowrap ${
                    pathname === item.href
                      ? "text-[var(--global-theme-color)]"
                      : "text-[#6b6b6b] hover:text-[var(--global-theme-color)]"
                  }`}
                >
                  {item.label}
                </Link>
              )
            )}
          </div>
          {/*
            Sign in sits OUTSIDE the scrolling list, pinned beside the logo, for
            two reasons. Discoverability: until now nothing on the site pointed at
            /login — only the link in a match email — so a mentor who lost that
            email had nowhere to click; a sixth item inside a list that already
            overflows on mobile would have scrolled out of sight and fixed
            nothing. And it isn't a content page like the others, it's the way
            back into an account.

            Labelled for neither role on purpose: /login is one door for mentors
            and Ascenso cohort members alike, so "Mentor Login" would read as
            "not for me" to half the people who need it.
          */}
          <Link
            href="/login"
            className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 rounded-lg border px-3 py-1.5 ${
              pathname === "/login"
                ? "border-[var(--global-theme-color)] text-[var(--global-theme-color)]"
                : "border-[#e8e4dc] text-[#6b6b6b] hover:border-[var(--global-theme-color)] hover:text-[var(--global-theme-color)]"
            }`}
          >
            Sign In
          </Link>
        </div>
      </div>
    </nav>
  );
}
