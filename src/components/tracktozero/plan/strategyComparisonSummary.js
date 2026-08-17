import { formatMoney as money } from "../formatting.js";

const INTEREST_TOLERANCE = 0.01;

const normalizeMonths = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const normalizeInterest = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export const describeStrategyComparison = ({ snowball = {}, avalanche = {} } = {}) => {
  const snowballMonths = normalizeMonths(snowball.monthsToZero);
  const avalancheMonths = normalizeMonths(avalanche.monthsToZero);
  const snowballInterest = normalizeInterest(snowball.estimatedInterest);
  const avalancheInterest = normalizeInterest(avalanche.estimatedInterest);
  const interestDiff = snowballInterest - avalancheInterest;
  const sameInterest = Math.abs(interestDiff) <= INTEREST_TOLERANCE;
  const sameMonths = snowballMonths === avalancheMonths;

  if (sameMonths && sameInterest) {
    return "Snowball and Avalanche currently produce the same projected payoff date and estimated interest. Choose the payoff order you prefer.";
  }

  if (sameMonths && !sameInterest) {
    return interestDiff > 0
      ? `Avalanche is projected to save about ${money(Math.abs(interestDiff))} in interest while finishing in the same payoff month.`
      : `Snowball is projected to save about ${money(Math.abs(interestDiff))} in interest while finishing in the same payoff month.`;
  }

  if (sameInterest && !sameMonths) {
    return snowballMonths != null && avalancheMonths != null && snowballMonths < avalancheMonths
      ? `Snowball reaches $0 sooner while estimated interest stays effectively the same.`
      : `Avalanche reaches $0 sooner while estimated interest stays effectively the same.`;
  }

  if (snowballMonths != null && avalancheMonths != null && snowballMonths < avalancheMonths) {
    return `Snowball is projected to reach $0 in ${snowballMonths} months, while Avalanche is ${avalancheMonths}. This tradeoff is about momentum vs interest savings.`;
  }

  return `Avalanche is projected to save about ${money(Math.abs(interestDiff))} in interest and finish in ${avalancheMonths} months.`;
};
