"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{ background: "#faf8f4", color: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "inherit" }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Something went wrong</h2>
          <button onClick={reset} style={{ background: "#c8a96e", color: "#1a1a2e", border: "none", borderRadius: "8px", padding: "0.6rem 1.5rem", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
