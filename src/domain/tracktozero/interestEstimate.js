// GATE-10B.1A: a single, standard, textbook monthly-periodic-interest
// approximation (APR / 12 * balance), used ONLY as one input inside a
// minimum-payment rule the user has explicitly confirmed includes an
// interest component (see minimumPaymentRules.js's computeFromRule) - never
// used on its own to produce a "minimum payment." This is a well-known,
// generic interest-accrual approximation (not a lender-specific formula,
// not a guessed minimum-payment rule) - real issuers typically compute
// interest from an average daily balance over the statement cycle, which
// TrackToZero does not track; this simplified figure is intentionally
// labeled as an estimate wherever it surfaces, never as lender-confirmed
// interest.
export function estimateMonthlyInterest({ balance, apr }) {
  if (balance == null || apr == null) return 0;
  return (Number(apr) / 12) * Number(balance);
}
