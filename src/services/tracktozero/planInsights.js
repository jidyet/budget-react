// GATE-10B.1D: pure, React-free derivation helpers shared by every Plan
// page's new charts/metrics - one canonical implementation of "safe
// percentage delta," "allocation segments," "who's better and by how much,"
// etc. so no two of the 7 pages can independently compute a different
// answer for the same inputs. No financial simulation happens here - every
// function only reshapes numbers a `buildPlanPreviewFromDebts`/
// `payoffSimulateDetailed` call already produced.
import { debtCategoryGroupFor } from "../../domain/tracktozero/financialItemTaxonomy.js";

// Never Infinity%/NaN%/a fake 0% - a zero-denominator ("from" is 0) can
// still honestly report a direction (something appeared where there was
// nothing) but never a numeric percentage, since "increased by X%" from a
// $0 baseline is not a real number.
export function safePercentDelta(from, to) {
  const f = Number(from) || 0;
  const t = Number(to) || 0;
  const diff = t - f;
  if (Math.abs(diff) < 1e-9) return { value: 0, direction: "same" };
  if (f === 0) return { value: null, direction: diff > 0 ? "increase" : "decrease" };
  const pct = Math.abs((diff / f) * 100);
  return { value: Number.isFinite(pct) ? pct : null, direction: diff > 0 ? "increase" : "decrease" };
}

// Exactly two segments - minimums and extra-to-target - never a fabricated
// "buffer" (no such concept exists anywhere in this product's payment
// model). Unknown minimums are excluded from the sum (never coerced to $0)
// and surfaced via unknownMinimumCount instead, so a donut never silently
// understates what's actually owed.
export function deriveAllocationSegments(payoffQueue = [], extraMonthlyPayment = 0) {
  const knownMinimumDebts = payoffQueue.filter((debt) => debt.minimumRequiredPayment != null);
  const minimumsTotal = knownMinimumDebts.reduce((sum, debt) => sum + Number(debt.minimumRequiredPayment || 0), 0);
  const extra = Math.max(0, Number(extraMonthlyPayment) || 0);
  const segments = [
    { id: "minimums", label: "Minimums", value: minimumsTotal, colorToken: "info" },
    { id: "extra", label: "Extra to target", value: extra, colorToken: "go" },
  ].filter((segment) => segment.value > 0);
  return { segments, total: minimumsTotal + extra, unknownMinimumCount: payoffQueue.length - knownMinimumDebts.length };
}

// Returns raw category groups (DEBT_CATEGORY_GROUPS enum values), NOT
// display labels - this module is UI-free by design, so the caller (a real
// Plan page component, which already imports debtCategoryConfig.js for the
// Debts page's own category tiles) maps `group` to a label/icon itself
// rather than this services-layer file importing UI configuration.
export function deriveDebtCompositionSegments(debts = []) {
  const byGroup = new Map();
  for (const debt of debts) {
    const group = debtCategoryGroupFor(debt.debtType);
    const balance = Number(debt.currentBalance || 0);
    if (!byGroup.has(group)) byGroup.set(group, { group, balance: 0, count: 0 });
    const entry = byGroup.get(group);
    entry.balance += balance;
    entry.count += 1;
  }
  return [...byGroup.values()].sort((a, b) => b.balance - a.balance);
}

// Only possible once perDebt[id].rows[].interest exists (payoffSimulateDetailed) -
// a genuinely new capability, not a re-derivation of something the aggregate
// engine already produced.
export function deriveInterestBreakdownSegments(perDebt = {}, debts = []) {
  const nameById = new Map(debts.map((debt) => [debt.id, debt.name]));
  return Object.values(perDebt)
    .map((entry) => ({
      id: entry.id,
      label: nameById.get(entry.id) || entry.name || "Debt",
      value: entry.rows.reduce((sum, row) => sum + Number(row.interest || 0), 0),
    }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function deriveNextMove({ targetDebt, activeVersion, perDebt = {} } = {}) {
  if (!targetDebt || !activeVersion) return null;
  return {
    targetDebtId: targetDebt.id,
    targetDebtName: targetDebt.name,
    extraMonthlyPayment: Number(activeVersion.extraMonthlyPayment || 0),
    payoffMonth: perDebt[targetDebt.id]?.payoffMonth || null,
    body: `Pay required minimums across all included debts, and direct extra payoff money to ${targetDebt.name}.`,
  };
}

// The "speed this up" suggestion (Snowball/Avalanche) - the OUTCOME
// (months/interest saved) is always genuinely computed against the real
// engine via the injected previewTrendFn, never hardcoded. suggestedIncrement
// itself defaults to a round $100 (matching the brief's own example) as a
// reasonable one-tap suggestion amount - only the dollar figure users would
// actually type is a UI default, never the SAVINGS that figure produces.
export async function computeSpeedUpSuggestion({ strategy, currentExtra = 0, suggestedIncrement = 100 } = {}, previewTrendFn) {
  if (typeof previewTrendFn !== "function") return null;
  const [baseline, withMore] = await Promise.all([
    previewTrendFn({ strategy, extraMonthlyPayment: currentExtra, detailed: false }),
    previewTrendFn({ strategy, extraMonthlyPayment: currentExtra + suggestedIncrement, detailed: false }),
  ]);
  if (!baseline?.monthsToZero || !withMore?.monthsToZero) return null;
  const monthsSaved = baseline.monthsToZero - withMore.monthsToZero;
  const interestSaved = Number(baseline.estimatedInterest || 0) - Number(withMore.estimatedInterest || 0);
  if (monthsSaved <= 0 && interestSaved <= 0) return null;
  return { additionalMonthly: suggestedIncrement, monthsSaved: Math.max(0, monthsSaved), interestSaved: Math.max(0, interestSaved) };
}

const INTEREST_TIE_TOLERANCE = 0.01;

// Explicit tie/tradeoff states - never a fake "$0 better." `detail` is a
// plain-English sentence generated here (not reused from
// strategyComparisonSummary.js's describeStrategyComparison, which lives in
// the components/ layer - this file stays React/UI-free by not importing
// across that boundary) but follows the same tolerance-based tie logic.
export function deriveStrategyRecommendation({ snowball = {}, avalanche = {} } = {}) {
  const snowballMonths = Number.isFinite(Number(snowball.monthsToZero)) ? Number(snowball.monthsToZero) : null;
  const avalancheMonths = Number.isFinite(Number(avalanche.monthsToZero)) ? Number(avalanche.monthsToZero) : null;
  const snowballInterest = Number(snowball.estimatedInterest || 0);
  const avalancheInterest = Number(avalanche.estimatedInterest || 0);
  const interestDiff = snowballInterest - avalancheInterest; // positive => avalanche cheaper
  const sameInterest = Math.abs(interestDiff) <= INTEREST_TIE_TOLERANCE;
  const sameMonths = snowballMonths === avalancheMonths;
  const monthsDelta = snowballMonths != null && avalancheMonths != null ? Math.abs(snowballMonths - avalancheMonths) : null;
  const interestDelta = Math.abs(interestDiff);

  if (sameMonths && sameInterest) {
    return { code: "tie", headline: "Snowball and Avalanche are effectively tied right now.", detail: "Same projected payoff date and estimated interest - choose the payoff order you prefer.", monthsDelta: 0, interestDelta: 0 };
  }
  if (sameMonths && !sameInterest) {
    const winner = interestDiff > 0 ? "avalanche" : "snowball";
    return {
      code: `${winner}_better`,
      headline: `${winner === "avalanche" ? "Avalanche" : "Snowball"} saves more, with no change to your payoff date.`,
      detail: `Same projected payoff month - ${winner === "avalanche" ? "Avalanche" : "Snowball"} is projected to save about ${interestDelta.toFixed(2)} in interest.`,
      monthsDelta: 0,
      interestDelta,
    };
  }
  if (sameInterest && !sameMonths) {
    const winner = snowballMonths < avalancheMonths ? "snowball" : "avalanche";
    return {
      code: `${winner}_better`,
      headline: `${winner === "snowball" ? "Snowball" : "Avalanche"} finishes sooner, for about the same interest.`,
      detail: `Estimated interest is effectively the same - ${winner === "snowball" ? "Snowball" : "Avalanche"} reaches $0 ${monthsDelta} month${monthsDelta === 1 ? "" : "s"} sooner.`,
      monthsDelta,
      interestDelta: 0,
    };
  }
  const snowballFaster = snowballMonths != null && avalancheMonths != null && snowballMonths < avalancheMonths;
  const avalancheCheaper = interestDiff > 0;
  if (snowballFaster && avalancheCheaper) {
    return {
      code: "tradeoff",
      headline: "This is a genuine tradeoff: faster with Snowball, cheaper with Avalanche.",
      detail: `Snowball reaches $0 ${monthsDelta} month${monthsDelta === 1 ? "" : "s"} sooner; Avalanche saves about ${interestDelta.toFixed(2)} more in interest.`,
      monthsDelta,
      interestDelta,
    };
  }
  // One strategy wins on both fronts (or one side's months are unknown).
  const winner = avalancheCheaper ? "avalanche" : "snowball";
  return {
    code: `${winner}_better`,
    headline: `${winner === "avalanche" ? "Avalanche" : "Snowball"} is your best path to saving money and time.`,
    detail: monthsDelta != null
      ? `${winner === "avalanche" ? "Avalanche" : "Snowball"} is projected to finish ${monthsDelta} month${monthsDelta === 1 ? "" : "s"} sooner and save about ${interestDelta.toFixed(2)} in interest.`
      : `${winner === "avalanche" ? "Avalanche" : "Snowball"} is projected to save about ${interestDelta.toFixed(2)} in interest.`,
    monthsDelta,
    interestDelta,
  };
}

// GATE-10B.1D: a disclosed, plan-internal heuristic (never certified
// financial advice - this domain has no income/budget-capacity field to
// base a real affordability judgment on). Buckets by how large the required
// increase is RELATIVE to the user's own current extra payment (the only
// financial-capacity signal this product actually has) - $50 floor avoids a
// tiny/zero current extra making any absolute increase look extreme.
//   additionalNeeded <= 0                          -> "comfortable" (already on track)
//   0 < ratio <= 0.5 (increase is at most +50% of current extra) -> "achievable"
//   ratio > 0.5                                     -> "tight"
//   not feasible at all within the search           -> "infeasible"
export function classifyGoalDateFeasibility(result) {
  if (!result?.valid || !result.feasible) return "infeasible";
  const additional = Number(result.additionalNeeded || 0);
  if (additional <= 0) return "comfortable";
  const currentBase = Math.max(Number(result.currentMonthlyExtra || 0), 50);
  const ratio = additional / currentBase;
  return ratio <= 0.5 ? "achievable" : "tight";
}

// Compares two perDebt maps (e.g. a baseline vs a What-If scenario) and
// reports each debt's payoff-timing change - resolves a gap the pre-existing
// UI explicitly documented as impossible ("the engine only tracks aggregate
// balance/interest per month, never a per-account zero-crossing"), now
// possible via payoffSimulateDetailed's perDebt output.
export function derivePerDebtImpactRows(baselinePerDebt = {}, scenarioPerDebt = {}, debts = []) {
  const nameById = new Map(debts.map((debt) => [debt.id, debt.name]));
  const ids = new Set([...Object.keys(baselinePerDebt), ...Object.keys(scenarioPerDebt)]);
  const rows = [...ids].map((id) => {
    const base = baselinePerDebt[id];
    const scenario = scenarioPerDebt[id];
    const baseIndex = base?.payoffMonthIndex ?? null;
    const scenarioIndex = scenario?.payoffMonthIndex ?? null;
    let change = "no_change";
    let monthsDelta = 0;
    if (baseIndex == null && scenarioIndex != null) {
      change = "now_paid_off";
    } else if (baseIndex != null && scenarioIndex == null) {
      change = "no_longer_reached";
    } else if (baseIndex != null && scenarioIndex != null) {
      monthsDelta = baseIndex - scenarioIndex; // positive => earlier (improvement)
      change = monthsDelta > 0 ? "earlier" : monthsDelta < 0 ? "later" : "no_change";
    }
    return {
      debtId: id,
      debtName: nameById.get(id) || base?.name || scenario?.name || "Debt",
      baselinePayoffMonth: base?.payoffMonth || null,
      scenarioPayoffMonth: scenario?.payoffMonth || null,
      change,
      monthsDelta: Math.abs(monthsDelta),
    };
  });
  return rows.sort((a, b) => b.monthsDelta - a.monthsDelta);
}

const parseMonthLabelToTime = (label) => {
  const date = new Date(`1 ${label}`);
  return Number.isNaN(date.getTime()) ? Infinity : date.getTime();
};

// GATE-10B.1D: "best option right now" is computed ONLY over scenarios
// already previewed this session (entries: [{scenario, preview}]) - never a
// background N-scenario preview burst on page load (a disclosed scope
// limit, not an oversight). Earliest projected $0 date wins; ties broken by
// lower estimated interest. Returns null (never a fabricated "best") when
// nothing has been previewed yet.
export function pickBestByZeroDate(entries = []) {
  const valid = entries.filter((entry) => entry?.preview?.projectedZeroDate);
  if (!valid.length) return null;
  const sorted = [...valid].sort((a, b) => {
    const dateDiff = parseMonthLabelToTime(a.preview.projectedZeroDate) - parseMonthLabelToTime(b.preview.projectedZeroDate);
    return dateDiff !== 0 ? dateDiff : Number(a.preview.estimatedInterest || 0) - Number(b.preview.estimatedInterest || 0);
  });
  return sorted[0];
}
