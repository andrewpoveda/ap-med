import Link from "next/link";

export default function NotFound() {
  return (
    <section className="text-center py-20">
      <p
        style={{
          color: "#c8a96e",
          fontSize: "0.75rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: "1.5rem",
        }}
      >
        404 · Page not found
      </p>
      <h1
        className="text-[#1a1a2e]"
        style={{ fontSize: "clamp(2rem, 5vw, 2.75rem)", fontWeight: 400 }}
      >
        This page doesn&apos;t exist
      </h1>
      <p className="mt-4 text-[#4a4a5a] max-w-md mx-auto leading-relaxed">
        The page you&apos;re looking for may have moved or been retired. Head
        back home, or browse the mentor directory.
      </p>
      <div className="mt-8 flex items-center justify-center gap-4">
        <Link
          href="/"
          style={{
            background: "#c8a96e",
            color: "#1a1a2e",
            padding: "0.8rem 1.75rem",
            borderRadius: "8px",
            fontWeight: 600,
            fontSize: "0.95rem",
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Back to Home
        </Link>
        <Link
          href="/mentors"
          style={{
            background: "transparent",
            color: "#1a1a2e",
            padding: "0.8rem 1.75rem",
            borderRadius: "8px",
            fontWeight: 600,
            fontSize: "0.95rem",
            textDecoration: "none",
            display: "inline-block",
            border: "1px solid rgba(26,26,46,0.25)",
          }}
        >
          Browse Mentors
        </Link>
      </div>
    </section>
  );
}
