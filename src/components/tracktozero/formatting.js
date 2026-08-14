// Presentation-only formatting for financial values already computed
// elsewhere (UX-0's truth derivations) - these functions never calculate or
// alter the underlying value, only how it's displayed. Centralized so every
// screen shows a dollar amount, percentage, or date identically instead of
// re-implementing Intl.NumberFormat/Date parsing per component.

export const formatMoney = (value) =>
  Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

export const formatPercent = (value) =>
  value == null ? "Unknown APR" : `${(Number(value || 0) * 100).toFixed(2)}% APR`;

// Formats an ISO date/month-key ("2026-08-21" or "2026-08") into a short,
// human-scannable label ("Aug 21" or "Aug 2026") - never invents a date
// that wasn't already present in the input string.
export const formatShortDate = (isoValue) => {
  if (!isoValue) return "";
  const raw = String(isoValue);
  const dayMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dayMatch) {
    const date = new Date(`${raw.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  const monthMatch = raw.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const date = new Date(`${raw}-01T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  return raw;
};
