import { describe, it, expect } from "vitest";
import { parseStatement } from "./statementTextExtraction.js";
import { statementResultToCandidate } from "./statementCandidateAdapter.js";

// Exercises the existing, already-deployed parseStatement() extraction engine
// directly with synthetic statement TEXT (never real user statements) - this is
// the same text shape pdfjs/OCR would hand it, so it covers the PDF-import
// fixture matrix (multi-page, missing APR, multiple APRs, no balance) without
// needing binary PDF fixtures at all.

// Note: the reused legacy extractor searches a small window of lines around each
// label match, so two labeled amounts placed on immediately adjacent lines can
// cross-contaminate (a real, pre-existing characteristic of that engine, not
// something this change alters - see the known-limitations note in the final
// report). Realistic statements have some separation, as reflected here.
const creditCardStatementText = `
Chase
Account Statement

New Balance: $2,345.67

Account Summary
Minimum Payment Due: $75.00
Payment Due Date: 09/15/2026

Interest Charge Calculation
Purchases 24.99% APR
`.trim();

const studentLoanStatementText = `
MOHELA
Loan Statement

Current Balance: $18,204.55
Minimum Amount Due: $210.00
Subsidized
`.trim();

const promoAprStatementText = `
Discover
Account Statement

New Balance: $980.12
Minimum Payment Due: $25.00
Interest Charge Calculation
Purchases (Promo) 0.00% APR
Balance Transfers 26.24% APR
`.trim();

// Simulates a two-page PDF by concatenating page text (extractPdfText joins
// pages with newlines exactly this way before calling parseStatement).
const multiPageStatementText = `${creditCardStatementText}\n\nPage 2 of 2\nThank you for being a valued customer.`;

describe("statementCandidateAdapter: reuses the existing parseStatement engine", () => {
  it("extracts balance, minimum payment, and a single APR from a typical credit card statement", () => {
    const parsed = parseStatement(creditCardStatementText);
    expect(parsed).toBeTruthy();
    expect(parsed.balance).toBe(2345.67);
    expect(parsed.min_due).toBe(75);
    expect(parsed.apr_percent).toBeCloseTo(24.99, 2);
    expect(parsed.bank).toBe("Chase");
  });

  it("handles a multi-page statement (concatenated page text) the same as a single page", () => {
    const parsed = parseStatement(multiPageStatementText);
    expect(parsed.balance).toBe(2345.67);
    expect(parsed.bank).toBe("Chase");
  });

  it("extracts multiple APR candidates and flags ambiguity for a statement with a promotional rate", () => {
    const parsed = parseStatement(promoAprStatementText);
    expect(parsed.apr_candidates.length).toBeGreaterThan(1);
    const candidate = statementResultToCandidate(parsed, { source: "pdf", importBatchId: "b1", fileName: "discover.pdf" });
    expect(candidate.warnings.join(" ")).toMatch(/different apr values/i);
  });

  it("leaves APR unknown (never silently 0%) when no APR appears on the statement", () => {
    const parsed = parseStatement(studentLoanStatementText);
    expect(parsed.apr_percent).toBeNull();
    const candidate = statementResultToCandidate(parsed, { source: "pdf", importBatchId: "b2", fileName: "mohela.pdf" });
    expect(candidate.aprStatus).toBe("unknown");
    expect(candidate.apr).toBeNull();
    expect(candidate.warnings.join(" ")).toMatch(/apr was not found/i);
  });

  it("returns null from parseStatement when neither balance nor minimum due can be found, never inventing values", () => {
    const parsed = parseStatement("Thank you for your business.\nNo account details here.");
    expect(parsed).toBeNull();
  });

  it("marks a candidate needs_information when no balance could be determined, forcing manual entry before it can be confirmed", () => {
    const candidate = statementResultToCandidate(
      { balance: null, min_due: null, due_day: null, apr_percent: null, apr_candidates: [], bank: "", account_hint: "", holder_name: "" },
      { source: "pdf", importBatchId: "b3", fileName: "unreadable.pdf" }
    );
    expect(candidate.decision).toBe("needs_information");
    expect(candidate.currentBalance).toBe(0);
    expect(candidate.warnings.join(" ")).toMatch(/no balance could be found/i);
  });

  it("pulls the full due date when the statement explicitly labels one (real information, not invented)", () => {
    const parsed = parseStatement(creditCardStatementText);
    const candidate = statementResultToCandidate(parsed, { source: "pdf", importBatchId: "b4", fileName: "chase.pdf" });
    expect(candidate.dueDate).toBe("2026-09-15");
    expect(candidate.warnings.join(" ")).not.toMatch(/due day detected/i);
  });

  it("infers debt type from loan-type context for student loan statements", () => {
    const parsed = parseStatement(studentLoanStatementText);
    const candidate = statementResultToCandidate(parsed, { source: "pdf", importBatchId: "b5", fileName: "mohela.pdf" });
    expect(candidate.debtType).toBe("student_loan");
  });

  it("produces a deterministic candidateId for the same importBatchId + statement identity (needed for idempotent commit)", () => {
    const parsed = parseStatement(creditCardStatementText);
    const first = statementResultToCandidate(parsed, { source: "pdf", importBatchId: "same-batch", fileName: "chase.pdf" });
    const second = statementResultToCandidate(parsed, { source: "pdf", importBatchId: "same-batch", fileName: "chase.pdf" });
    expect(first.candidateId).toBe(second.candidateId);
  });
});

describe("statementCandidateAdapter: minimum-payment / balance field contamination (regression)", () => {
  const boaStatementText = "Bank of America Statement\nNew Balance: $1,845.20\nMinimum Payment Due: $45.00\nInterest Rate 22.49 % APR\nPayment Due Date: 09/12/2026";

  it("REPRODUCTION: does not let 'New Balance' bleed into 'Minimum Payment Due' when the two labels are on adjacent lines", () => {
    const parsed = parseStatement(boaStatementText);
    expect(parsed.balance).toBe(1845.2);
    expect(parsed.min_due).toBe(45);
  });

  it("CASE A: New Balance then Minimum Payment Due, inline", () => {
    const parsed = parseStatement("New Balance: $1,845.20\nMinimum Payment Due: $45.00");
    expect(parsed.balance).toBe(1845.2);
    expect(parsed.min_due).toBe(45);
  });

  it("CASE B: Minimum Payment Due then New Balance, inline (reversed order)", () => {
    const parsed = parseStatement("Minimum Payment Due: $45.00\nNew Balance: $1,845.20");
    expect(parsed.balance).toBe(1845.2);
    expect(parsed.min_due).toBe(45);
  });

  it("CASE C: New Balance then Minimum Payment Due, label and value on separate lines", () => {
    const parsed = parseStatement("New Balance\n$1,845.20\nMinimum Payment Due\n$45.00");
    expect(parsed.balance).toBe(1845.2);
    expect(parsed.min_due).toBe(45);
  });

  it("CASE D: Minimum Payment Due then New Balance, label and value on separate lines (reversed order)", () => {
    const parsed = parseStatement("Minimum Payment Due\n$45.00\nNew Balance\n$1,845.20");
    expect(parsed.balance).toBe(1845.2);
    expect(parsed.min_due).toBe(45);
  });

  it("CASE E: a 'Previous Payment' amount before the real minimum must not be mistaken for it", () => {
    const parsed = parseStatement("Previous Payment: $300.00\nMinimum Payment Due: $45.00\nNew Balance: $1,845.20");
    expect(parsed.min_due).toBe(45);
    expect(parsed.balance).toBe(1845.2);
  });

  it("CASE F: a Credit Limit amount before the real balance must not be mistaken for it", () => {
    const parsed = parseStatement("Credit Limit: $10,000.00\nNew Balance: $1,845.20\nMinimum Payment Due: $45.00");
    expect(parsed.balance).toBe(1845.2);
    expect(parsed.min_due).toBe(45);
  });

  it("CASE G: balance present with no minimum-payment label anywhere leaves minimum unresolved, never substituting the balance", () => {
    const parsed = parseStatement("New Balance: $1,845.20");
    expect(parsed.balance).toBe(1845.2);
    expect(parsed.min_due).toBeNull();
  });

  it("CASE H: minimum payment present with no balance label anywhere leaves balance unresolved", () => {
    const parsed = parseStatement("Minimum Payment Due: $45.00");
    expect(parsed.min_due).toBe(45);
    expect(parsed.balance).toBeNull();
  });

  it("CASE I: APR extraction is unaffected by the currency-field fix, including with multiple nearby percentages", () => {
    const parsed = parseStatement("New Balance: $1,845.20\nMinimum Payment Due: $45.00\nInterest Charge Calculation\nPurchases (Promo) 0.00% APR\nBalance Transfers 26.24% APR");
    expect(parsed.balance).toBe(1845.2);
    expect(parsed.min_due).toBe(45);
    expect(parsed.apr_candidates.length).toBeGreaterThan(1);
  });
});

describe("statementCandidateAdapter: APR-as-minimum-payment contamination (regression)", () => {
  it("REPRODUCTION: a bare APR percentage sharing the minimum-payment label's forward search window must not be mistaken for the payment amount", () => {
    // Realistic layout for a consolidated multi-loan servicer statement
    // (Nelnet/Firstmark-style): the label is on its own line, and the very
    // next line - the only line still inside the minimum-due forward search
    // window - contains both an APR percentage AND the true dollar amount.
    // Before the fix, MONEY_VALUE_RE's optional "$" let it match the bare
    // "6.74" from "6.74%" as if it were a currency amount, and being the
    // first match in the window, it won over the real "$425.00".
    const text = "Firstmark Services (Nelnet)\nTotal Balance: $34,233.67\nMinimum Payment Due\n6.74% APR   $425.00\nPayment Due Date\nDay 21";
    const parsed = parseStatement(text);
    expect(parsed.min_due).toBe(425);
  });

  it("a percentage adjacent to a currency amount elsewhere on the statement does not affect balance extraction either", () => {
    const text = "Total Balance 6.99% $12,000.00\nMinimum Payment Due $150.00";
    const parsed = parseStatement(text);
    expect(parsed.min_due).toBe(150);
  });
});

describe("statementCandidateAdapter: owner suggestion must never be mail-handling boilerplate (regression)", () => {
  it("REPRODUCTION: 'For Undeliverable Mail Only' must not be suggested as the account holder/owner", () => {
    const text = "Chase\nAccount Statement\n\nFor Undeliverable Mail Only\n123 Main St\nAnytown ST 12345\n\nNew Balance: $2,345.67\nMinimum Payment Due: $75.00\nPayment Due Date: 09/15/2026";
    const parsed = parseStatement(text);
    expect(parsed.holder_name || "").not.toMatch(/undeliverable/i);
    const candidate = statementResultToCandidate(parsed, { source: "pdf", importBatchId: "b6", fileName: "chase.pdf" });
    expect(candidate.ownerSuggestion).not.toMatch(/undeliverable/i);
  });

  it("similar mail-handling boilerplate ('Return Service Requested', 'Address Service Requested') must also never be suggested as owner", () => {
    for (const boilerplate of ["Return Service Requested", "Address Service Requested", "Change Service Requested"]) {
      const text = `Chase\nAccount Statement\n\n${boilerplate}\n123 Main St\n\nNew Balance: $2,345.67\nMinimum Payment Due: $75.00`;
      const parsed = parseStatement(text);
      expect(parsed.holder_name || "").not.toMatch(/service requested/i);
    }
  });

  it("a genuine human cardholder name is still correctly detected (no regression from the boilerplate fix)", () => {
    const text = "Chase\nAccount Statement\n\nJohn A Smith\n123 Main St\nAnytown ST 12345\n\nNew Balance: $2,345.67\nMinimum Payment Due: $75.00";
    const parsed = parseStatement(text);
    expect(parsed.holder_name).toMatch(/John A?\.? Smith/i);
  });
});

describe("statementCandidateAdapter: full statement/due dates should be pulled when actually present (not just a bare day)", () => {
  it("REPRODUCTION: a real, fully-labeled Payment Due Date and Statement Closing Date are currently discarded (dueDate/statementDate always null)", () => {
    const text = [
      "Bank of America",
      "Visa Signature",
      "Account# 4400 6699 6587 9232",
      "December 15 - January 14, 2026",
      "",
      "Account Summary/Payment Information",
      "Previous Balance $10,399.09",
      "New Balance Total $11,184.44",
      "",
      "Total Minimum Payment Due $357.00",
      "Payment Due Date 02/11/2026",
      "",
      "Statement Closing Date 01/14/2026",
      "Interest Charge Calculation",
      "Purchases 24.49% APR",
    ].join("\n");
    const parsed = parseStatement(text);
    const candidate = statementResultToCandidate(parsed, { source: "pdf", importBatchId: "b7", fileName: "boa.pdf" });
    // These currently fail before the fix - the information is present on
    // the statement but the code throws it away.
    expect(candidate.dueDate).toBe("2026-02-11");
    expect(candidate.statementDate).toBe("2026-01-14");
    // The "only a day was found" warning must not fire when a full date was found.
    expect(candidate.warnings.join(" ")).not.toMatch(/only the day-of-month could be read/i);
  });

  it("still never promotes a low-confidence day (found near 'Minimum Payment Due' but under no explicit due-date label) into a full due date (no regression on the original truth-hardening fix)", () => {
    const text = "New Balance: $500.00\nMinimum Payment Due: $25.00 by 03/21/2026";
    const parsed = parseStatement(text);
    expect(parsed.due_day).toBe(21);
    const candidate = statementResultToCandidate(parsed, { source: "pdf", importBatchId: "b8", fileName: "x.pdf" });
    expect(candidate.dueDate).toBeNull();
    expect(candidate.warnings.join(" ")).toMatch(/due day detected: 21.*only the day-of-month/i);
  });
});

describe("statementCandidateAdapter: card product/network names must never be suggested as owner (regression)", () => {
  it("REPRODUCTION: 'Visa Signature' (a card product name, not a person) must not be suggested as the account holder", () => {
    const text = "Bank of America\nVisa Signature\nAccount# 4400 6699 6587 9232\n\nNew Balance Total $11,184.44\nTotal Minimum Payment Due $357.00";
    const parsed = parseStatement(text);
    expect(parsed.holder_name || "").not.toMatch(/visa signature/i);
  });

  it("similar card product/network names must also never be suggested as owner", () => {
    for (const productName of ["Mastercard World Elite", "Visa Platinum", "World Elite Mastercard"]) {
      const text = `Bank of America\n${productName}\nAccount# 1234\n\nNew Balance Total $500.00\nMinimum Payment Due $25.00`;
      const parsed = parseStatement(text);
      expect(parsed.holder_name || "").not.toMatch(/mastercard|world elite|visa platinum/i);
    }
  });

  it("a genuine human cardholder name is still detected even when a card product name also appears on the statement", () => {
    const text = "Bank of America\nVisa Signature\nJohn A Smith\n123 Main St\n\nNew Balance Total $500.00\nMinimum Payment Due $25.00";
    const parsed = parseStatement(text);
    expect(parsed.holder_name).toMatch(/John A?\.? Smith/i);
  });
});
