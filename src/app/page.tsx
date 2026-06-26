import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "AP MED | Free Mentorship for Underrepresented Pre-Med Students",
  description:
    "AP MED connects first-gen and underrepresented pre-med students with identity-matched physicians, residents, and medical students. Free forever.",
};

const GOLD = "#c8a96e";
const SPOTIFY_GREEN = "#1DB954";
const SPOTIFY_SHOW_URL = "https://open.spotify.com/show/2CsWyH724wl7qHG1E6M3DB";

const STATS = [
  { value: "7+", label: "Active Mentors" },
  { value: "5+", label: "Specialties" },
  { value: "100%", label: "Free" },
  { value: "LMSA-NE", label: "Partner" },
];

const goldButton: React.CSSProperties = {
  background: GOLD,
  color: "#111827",
  padding: "0.8rem 1.75rem",
  borderRadius: "8px",
  fontWeight: 600,
  fontSize: "0.95rem",
  textDecoration: "none",
  display: "inline-block",
};

const ghostButton: React.CSSProperties = {
  background: "transparent",
  color: "#ffffff",
  padding: "0.8rem 1.75rem",
  borderRadius: "8px",
  fontWeight: 600,
  fontSize: "0.95rem",
  textDecoration: "none",
  display: "inline-block",
  border: "1px solid rgba(255,255,255,0.4)",
};

const eyebrowStyle: React.CSSProperties = {
  color: GOLD,
  fontSize: "0.75rem",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  fontWeight: 600,
};

export default function Home() {
  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="text-center">
        <p style={{ ...eyebrowStyle, marginBottom: "1.5rem" }}>
          Free · Identity-Matched · Podcast-Vetted
        </p>
        <h1
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontWeight: 400,
            fontSize: "clamp(2.5rem, 6vw, 3.5rem)",
            lineHeight: 1.1,
            color: "#ffffff",
            maxWidth: "16ch",
            margin: "0 auto",
          }}
        >
          Find a mentor who{" "}
          <em style={{ fontStyle: "italic", color: GOLD }}>actually gets</em> your
          story
        </h1>
        <p
          style={{
            color: "#cbd5e1",
            maxWidth: "620px",
            margin: "1.5rem auto 0",
            fontSize: "1.1rem",
            lineHeight: 1.6,
          }}
        >
          AP MED connects underrepresented pre-med students with physicians,
          residents, and medical students matched by identity, specialty, and goal
          — for free, always.
        </p>

        <div
          style={{
            display: "flex",
            gap: "1rem",
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: "2rem",
          }}
        >
          <Link href="/mentee-onboarding" style={goldButton}>
            Get Matched
          </Link>
          <Link href="/mentors" style={ghostButton}>
            Browse Mentors
          </Link>
        </div>

        <div
          style={{
            display: "flex",
            gap: "2.5rem",
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: "3rem",
          }}
        >
          {STATS.map((stat) => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <div
                style={{
                  color: GOLD,
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  lineHeight: 1.1,
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  color: "#94a3b8",
                  fontSize: "0.8rem",
                  marginTop: "0.25rem",
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
        <div>
          <h2
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontWeight: 400,
              fontSize: "2rem",
              lineHeight: 1.15,
              color: "#ffffff",
              marginBottom: "1rem",
            }}
          >
            Built from the inside of medicine.
          </h2>
          <p
            style={{
              color: "#cbd5e1",
              fontSize: "1rem",
              lineHeight: 1.7,
              marginBottom: "1.25rem",
            }}
          >
            AP MED is a free mentorship and storytelling platform for
            underrepresented pre-med students. I started it as a first-year BS/MD
            student who didn&apos;t see enough stories that reflected my background.
            Every mentor on this platform has been podcast-vetted — you can hear
            their story before you ever reach out.
          </p>
          <Link
            href="/about"
            style={{ color: GOLD, fontWeight: 600, textDecoration: "none" }}
          >
            Read more about AP MED →
          </Link>
        </div>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "320px",
            borderRadius: "12px",
            overflow: "hidden",
            border: "1px solid rgba(240,237,230,0.12)",
          }}
        >
          <Image
            src="/headshot.jpg"
            alt="Andrew Poveda, founder of AP MED"
            fill
            className="object-cover"
          />
        </div>
      </section>

      {/* Podcast CTA */}
      <section className="text-center">
        <p style={{ ...eyebrowStyle, marginBottom: "1rem" }}>The AP MED Podcast</p>
        <a
          href={SPOTIFY_SHOW_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: SPOTIFY_GREEN,
            color: "#0a0f1e",
            padding: "0.8rem 1.75rem",
            borderRadius: "9999px",
            fontWeight: 600,
            fontSize: "0.95rem",
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Listen on Spotify
        </a>
      </section>
    </div>
  );
}
