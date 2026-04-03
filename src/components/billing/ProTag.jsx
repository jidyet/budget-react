/**
 * ProTag — compact "✦ Pro" badge shown inline next to locked features.
 * Only renders when billing is enabled and user doesn't have premium.
 */
export default function ProTag({ subscription, palette }) {
  const c = palette;
  if (!subscription?.billingEnabled) return null;
  if (subscription?.premium || subscription?.testerMode) return null;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 3,
      padding: "2px 7px",
      borderRadius: 999,
      background: `${c.wa}18`,
      border: `1px solid ${c.wa}44`,
      color: c.wa,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: "0.04em",
      verticalAlign: "middle",
      marginLeft: 6,
      whiteSpace: "nowrap",
    }}>
      ✦ Pro
    </span>
  );
}
