import { BRAND_NAME, BRAND_TAGLINE, BRAND_WORDMARK, BRAND_COLORS } from "../../config/brand";

export default function BrandLockup({
  size = "md",
  showTagline = false,
  align = "left",
}) {
  const isCompact = size === "sm";
  const wordmarkFontSize = isCompact ? 20 : size === "lg" ? 33 : 24;
  const taglineFontSize = isCompact ? 11 : size === "lg" ? 16 : 13;

  return (
    <div
      style={{
        display: "grid",
        gap: showTagline ? 4 : 0,
        justifyItems: align === "center" ? "center" : "start",
        textAlign: align,
        padding: "2px 3px",
      }}
      aria-label={BRAND_NAME}
    >
      <div
        style={{
          fontFamily: "'Syne',sans-serif",
          fontSize: wordmarkFontSize,
          fontWeight: 700,
          letterSpacing: "-0.05em",
          display: "flex",
          alignItems: "center",
          gap: 0,
          flexWrap: "wrap",
          lineHeight: 1,
        }}
      >
        {BRAND_WORDMARK.map((part) => (
          <span key={part.text} style={{ color: part.color }}>
            {part.text}
          </span>
        ))}
      </div>
      {showTagline && (
        <div
          style={{
            fontSize: taglineFontSize,
            fontWeight: 700,
            color: BRAND_COLORS.tagline,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          {BRAND_TAGLINE}
        </div>
      )}
    </div>
  );
}
