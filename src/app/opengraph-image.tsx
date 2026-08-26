import { ImageResponse } from "next/og";

export const alt = "AP MED Mentors — mentorship infrastructure for professional pipelines";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        padding: "76px",
        background: "#f7f3ec",
        color: "#1a1a2e",
        fontFamily: "Georgia, serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", border: "2px solid #d9cfbf", borderRadius: "28px", padding: "56px", background: "#fffdf9" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "Arial, sans-serif", fontSize: "24px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#8a6d3b" }}>
          <span>AP MED Mentors</span>
          <span>Editorial guides</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "flex", maxWidth: "900px", fontSize: "72px", lineHeight: 1.02 }}>Mentorship infrastructure for professional pipelines.</div>
          <div style={{ display: "flex", fontFamily: "Arial, sans-serif", fontSize: "24px", color: "#625d56" }}>Healthcare · Education · Associations · Structured cohorts</div>
        </div>
      </div>
    </div>,
    size,
  );
}
