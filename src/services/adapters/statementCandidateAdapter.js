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

  // DATA-2: documentType/productName are strong, explicit product-text evidence
  // (task section 45) - a credit-card/LOC statement must never fall through to
  // "Other" just because the creditor/account name text alone doesn't literally
  // say "credit card"/"line of credit" (e.g. "Capital One . . . 2656").
  const documentTypeHint = { CREDIT_CARD_STATEMENT: "credit card", LOC_STATEMENT: "line of credit", LOAN_STATEMENT: "loan" }[parsed.document_type] || "";
  const debtType = normalizeDebtType(parsed.loan_type, `${creditorName} ${accountName} ${parsed.product_name || ""} ${documentTypeHint}`);

  const candidateId = `cand-${stableHash([importBatchId, source, creditorName, accountName, fileName].join("|"))}`;

  // DATA-2: converts the parser's structured (but raw-percent) rate
  // components into the candidate's decimal convention, matching how
  // apr_percent -> apr is normalized above - never mixed units within one
  // candidate.
  const rateComponents = Array.isArray(parsed.rate_components)
    ? parsed.rate_components.map((component) => ({
      balanceType: component.balanceType,
      apr: Number(component.apr) === 0 ? 0 : normalizeAprDecimal(Number(component.apr)),
      balanceSubjectToRate: component.balanceSubjectToRate ?? null,
      interestCharged: component.interestCharged ?? null,
      activeBalance: !!component.activeBalance,
    }))
    : [];

  // DATA-2: this is what lets reviewDomain.js's existing multi-APR
  // review-blocking check (evaluateReviewSignals, which reads
  // evidence.fieldEvidence.apr) fire for a PDF-sourced candidate - before
  // this, only the Excel/workbook pipeline ever populated fieldEvidence, so
  // a statement with several APR candidates never triggered that check even
  // though the parser already knew about the ambiguity internally.
  //
  // Deliberately sourced from rateComponents (every rate the statement
  // shows), NOT parsed.apr_candidates - that list is already filtered down
  // to purchase-eligible candidates only (normalizeAprCandidate excludes
  // cash-advance/penalty/balance-transfer rows so they can never win as the
  // SELECTED purchase APR), so a statement with, say, one purchase APR plus
  // a cash-advance APR would otherwise never look "multiple" here even
  // though the statement plainly shows more than one rate.
  const fieldEvidenceApr = rateComponents.map((component) => ({
    value: component.apr,
    apr: component.apr,
    aprStatus: "known",
    header: `${component.balanceType} APR`,
    provenance: { fileName, matchedText: component.balanceType },
    truth: "observed",
  }));

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
    // DATA-2: this product/document-type detection is definitionally
    // debt-shaped (a credit card/LOC/loan statement) - there is no
    // financial-item-classification ambiguity to resolve for a source that
    // parseStatement() already succeeded on (an unusable file is a separate,
    // earlier "no candidate at all" path in pdfImportReader.js).
    financialItemType: "DEBT",
    productName: parsed.product_name || "",
    documentType: parsed.document_type || "UNKNOWN",
    rateComponents,
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
      amountPaid: parsed.amount_paid ?? null,
      creditLimit: parsed.credit_limit ?? null,
      availableCredit: parsed.available_credit ?? null,
      creditorPayoffIllustration: parsed.creditor_payoff_illustration ?? null,
      fieldEvidence: {
        apr: fieldEvidenceApr,
      },
      // "where did this value come from?" - page number is not tracked in
      // this phase (see extractTextFromPdf in pdfImportReader.js), so it's
      // explicitly null rather than fabricated.
      provenance: {
        balance: parsed.balance_provenance ? { ...parsed.balance_provenance, page: null } : null,
        minimumPayment: parsed.min_due_provenance ? { ...parsed.min_due_provenance, page: null } : null,
        amountPaid: parsed.amount_paid_provenance ? { ...parsed.amount_paid_provenance, page: null } : null,
        creditLimit: parsed.credit_limit_provenance ? { ...parsed.credit_limit_provenance, page: null } : null,
        dueDate: parsed.due_date_provenance ? { ...parsed.due_date_provenance, page: null } : null,
      },
    },
  };
};
