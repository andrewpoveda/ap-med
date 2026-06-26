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
    <nav className="sticky top-0 z-50 border-b border-gray-700 bg-[#111827]">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-16 gap-4">
          <Link
            href="/"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
            className="text-2xl text-white tracking-wide hover:opacity-80 transition-opacity whitespace-nowrap shrink-0"
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
                  className="text-sm font-medium transition-colors whitespace-nowrap text-neutral-400 hover:text-[var(--global-theme-color)]"
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
                      : "text-neutral-400 hover:text-[var(--global-theme-color)]"
                  }`}
                >
                  {item.label}
                </Link>
              )
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
