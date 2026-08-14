import { normalizeAprDecimal } from "../../utils/budgetUtils.js";
import { normalizeDebtType } from "./importCandidateAdapter.js";
import { stableHash } from "./legacyTrackToZeroAdapter.js";

// Maps the legacy statement-parser's output (StatementUpload.jsx's parseStatement/
// enrichStatement - a mature, already-deployed regex extraction engine covering
// balance/min-due/due-day/APR-with-multiple-candidates/provider/last4/holder-name)
// into ONE V2 ImportCandidate. Deliberately reuses that engine rather than
// reimplementing statement parsing - the same "don't duplicate business logic"
// principle Excel/CSV already follow for normalizeSpreadsheetRowsToCandidates.
//
// A PDF/image statement produces exactly one candidate (one account per
// statement), unlike a spreadsheet row set.
export const statementResultToCandidate = (parsed, { source = "pdf", importBatchId = "", fileName = "" } = {}) => {
  const warnings = [];

  const currentBalance = parsed.remaining_balance ?? parsed.balance ?? parsed.principal_balance ?? parsed.estimated_payoff ?? null;
  if (currentBalance == null) warnings.push("No balance could be found on this statement. Enter it manually before confirming.");

  const aprCandidateCount = Array.isArray(parsed.apr_candidates) ? parsed.apr_candidates.length : 0;
  if (aprCandidateCount > 1) warnings.push(`${aprCandidateCount} different APR values were found on this statement (e.g. promotional vs. standard rate) - the highest-confidence one was selected. Double-check it.`);
  const aprPercent = parsed.apr_selected ?? parsed.apr_percent ?? null;
  let apr = null;
  let aprStatus = "unknown";
  if (aprPercent == null) {
    warnings.push("APR was not found on this statement.");
  } else if (Number(aprPercent) === 0) {
    apr = 0;
    aprStatus = "no_interest";
  } else {
    apr = normalizeAprDecimal(Number(aprPercent));
    aprStatus = "known";
  }

  if (parsed.min_due == null) warnings.push("Minimum payment was not found on this statement.");

  if (parsed.due_day != null && parsed.due_date == null) {
    warnings.push(`Payment due day detected: ${parsed.due_day}. Set the exact due date - only the day-of-month could be read.`);
  }

  const creditorName = String(parsed.bank || "").trim();
  const accountName = String(parsed.account_hint || creditorName || fileName || "Imported statement").trim();
  if (!creditorName) warnings.push("Creditor/bank could not be identified from this statement.");

  const debtType = normalizeDebtType(parsed.loan_type, `${creditorName} ${accountName}`);

  const candidateId = `cand-${stableHash([importBatchId, source, creditorName, accountName, fileName].join("|"))}`;

  return {
    candidateId,
    source,
    creditorName,
    accountName,
    accountReferenceSafe: parsed.account_last4 ? `••••${parsed.account_last4}` : "",
    debtType,
    currentBalance: currentBalance ?? 0,
    // The parser never found a balance for this statement - 0 here is a
    // placeholder for the form, not a claim of "$0 owed". Carried through to
    // the created Debt at commit time (see commitImportBatch) so it can
    // never be mistaken for a confirmed payoff.
    balanceStatus: currentBalance == null ? "unresolved" : "confirmed",
    statementDate: parsed.statement_date ?? null,
    apr,
    aprStatus,
    minimumPayment: parsed.min_due ?? null,
    dueDate: parsed.due_date ?? null,
    ownerSuggestion: String(parsed.holder_name || "").trim(),
    includedInCorePayoffPlan: debtType !== "mortgage",
    warnings,
    duplicateStatus: "new",
    decision: currentBalance == null ? "needs_information" : "pending_review",
    evidence: {
      previousBalance: parsed.previous_balance ?? null,
      newPurchases: parsed.new_purchases ?? null,
      interestCharged: parsed.interest_charged ?? null,
      fees: parsed.fees ?? null,
      loanType: parsed.loan_type || null,
      aprCandidateCount,
      // The actual candidate percentages (not just a count), preserved so a
      // later Import Review UI can show "APR candidates: 6.74%, 24.99%, ..."
      // and let the human confirm, rather than silently discarding the
      // ambiguity once the highest-confidence one is auto-selected above.
      aprCandidates: Array.isArray(parsed.apr_candidates) ? parsed.apr_candidates : [],
    },
  };
};
