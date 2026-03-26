const getInitials = (value = "") => {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "?";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
};

export default function MemberAvatar({ member = {}, size = 36, fontSize = 13, palette }) {
  const c = palette;
  const label = member.displayName || member.label || member.email || member.uid || "Member";
  const photoURL = String(member.photoURL || "").trim();
  const bg = member.avatarColor || c.ac;

  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={label}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          background: c.surf2,
          border: `1px solid ${c.border}`,
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      aria-label={label}
      title={label}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: "#ffffff",
        display: "grid",
        placeItems: "center",
        fontSize,
        fontWeight: 900,
        letterSpacing: "0.02em",
        flexShrink: 0,
      }}
    >
      {getInitials(label)}
    </div>
  );
}
