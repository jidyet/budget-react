export const fx = (v) =>
  v == null
    ? "-"
    : `$${Number(v).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

export const pct = (v) => (v ? `${(v * 100).toFixed(2)}%` : null);

export const TODAY = new Date();

export const daysLeft = (dueDay, month, year) => {
  if (!dueDay) return null;
  const daysInMonth = new Date(year, month, 0).getDate();
  const d = Math.min(dueDay, daysInMonth);
  const target = new Date(year, month - 1, d);
  if (isNaN(target.getTime())) return null;
  if (
    target < TODAY &&
    year === TODAY.getFullYear() &&
    month === TODAY.getMonth() + 1
  ) {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    const nd = Math.min(dueDay, new Date(ny, nm, 0).getDate());
    const next = new Date(ny, nm - 1, nd);
    if (isNaN(next.getTime())) return null;
    return Math.round((next - TODAY) / (1000 * 60 * 60 * 24));
  }
  const result = Math.round((target - TODAY) / (1000 * 60 * 60 * 24));
  return isNaN(result) ? null : result;
};

export function accountViewModel(a) {
  const org = String(a.bank || a.name || "Account").trim();
  const typeMatch = String(a.name || "").match(/\(([^)]+)\)/);
  const type = (typeMatch?.[1] || a.category || "Account").replace(/\s+/g, " ").trim();
  const owner = String(a.owner || "").trim();
  const title = org;
  const subtitle = owner ? `${type} - ${owner}` : type;
  const compact = `${org} (${type})${owner ? ` (${owner})` : ""}`;
  return { org, type, owner, title, subtitle, compact };
}

export const defaultRecord = (a) => {
  if (a == null) {
    return { paid_v: 0, min_due_v: 0, base_bal_v: 0, cur_bal: 0, is_paid: false, purch_v: 0, apr_v: 0 };
  }
  return {
    paid_v: 0,
    min_due_v: a.budgeted_min,
    base_bal_v: a.starting_bal,
    cur_bal: a.starting_bal,
    is_paid: false,
    purch_v: 0,
    apr_v: a.apr,
  };
};
