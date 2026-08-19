import { describe, expect, it } from "vitest";
import { parseStatement, detectProviderName, detectDocumentType, dateStringToIso, resolveTwoDigitYear } from "./statementTextExtraction.js";
import { CAPITAL_ONE_STATEMENT_TEXT } from "./__fixtures__/capitalOneStatement.fixture.js";
import { US_BANK_CASH_PLUS_STATEMENT_TEXT } from "./__fixtures__/usBankCashPlusStatement.fixture.js";
import { US_BANK_PERSONAL_LINE_STATEMENT_TEXT } from "./__fixtures__/usBankPersonalLineStatement.fixture.js";

describe("DATA-2: Capital One statement fixture", () => {
  const parsed = parseStatement(CAPITAL_ONE_STATEMENT_TEXT);

  it("distinguishes previous balance from current/new balance", () => {
    expect(parsed.previous_balance).toBe(2046.12);
    expect(parsed.balance).toBe(1991.99);
  });

  it("distinguishes the creditor minimum due from the amount actually paid", () => {
    expect(parsed.min_due).toBe(65);
    expect(parsed.amount_paid).toBe(100);
  });

  it("extracts the due date as a full date, not a stray day number", () => {
    expect(parsed.due_date).toBe("2026-02-03");
  });

  it("normalizes APR to 26.40, never 2640", () => {
    expect(parsed.apr_percent).toBe(26.4);
  });

  it("extracts credit limit and available credit", () => {
    expect(parsed.credit_limit).toBe(5100);
    expect(parsed.available_credit).toBe(3108.01);
  });

  it("extracts interest charged this period", () => {
    expect(parsed.interest_charged).toBe(45.87);
  });

  it("preserves multiple APR rate components, not just the selected winner", () => {
    const purchase = parsed.rate_components.find((c) => c.balanceType === "purchase");
    const cashAdvance = parsed.rate_components.find((c) => c.balanceType === "cash_advance");
    expect(purchase).toMatchObject({ apr: 26.4, activeBalance: true });
    expect(cashAdvance).toMatchObject({ apr: 28.4, activeBalance: false });
    // The active/primary rate also matches an earlier, plainer label
    // ("Purchases ... 26.40%" via APR_CONTEXT_PATTERNS) before the richer
    // interest-charge-table row is found - the merge must fill in
    // balanceSubjectToRate/interestCharged rather than let the first,
    // field-less match win and leave them null.
    expect(purchase).toMatchObject({ balanceSubjectToRate: 2045.73, interestCharged: 45.87 });
  });

  it("does not fabricate a false 0.00% APR candidate from the $0/$0 cash advance row", () => {
    expect(parsed.apr_candidates).not.toContain(0);
  });

  it("detects product name and document type", () => {
    expect(parsed.product_name).toBe("Quicksilver");
    expect(parsed.document_type).toBe("CREDIT_CARD_STATEMENT");
  });

  it("extracts the creditor payoff illustration as reference-only data, never as min_due", () => {
    expect(parsed.creditor_payoff_illustration).toMatchObject({
      yearsToPayoff: 17,
      totalPaid: 5847,
      alternatePaymentAmount: 81,
      alternateYearsToPayoff: 3,
      estimatedSavings: 2942,
    });
    // The $81 alternate-payment figure must never leak into min_due.
    expect(parsed.min_due).toBe(65);
  });

  it("carries source evidence (matched label + source line) for key fields", () => {
    expect(parsed.balance_provenance).toMatchObject({ value: 1991.99, matchedLabel: expect.stringMatching(/new balance/i) });
    expect(parsed.min_due_provenance).toMatchObject({ value: 65, matchedLabel: expect.stringMatching(/minimum payment due/i) });
    expect(parsed.due_date_provenance.matchedText).toMatch(/Payment Due Date/i);
  });
});

describe("DATA-2: U.S. Bank Cash+ statement fixture", () => {
  const parsed = parseStatement(US_BANK_CASH_PLUS_STATEMENT_TEXT);

  it("distinguishes previous balance from current/new balance", () => {
    expect(parsed.previous_balance).toBe(4507.06);
    expect(parsed.balance).toBe(5119.1);
  });

  it("distinguishes the creditor minimum due from the amount actually paid", () => {
    expect(parsed.min_due).toBe(144);
    expect(parsed.amount_paid).toBe(172);
  });

  it("extracts the due date as a full date", () => {
    expect(parsed.due_date).toBe("2026-03-10");
  });

  it("selects the active purchase APR (24.49%) and preserves the other rate components", () => {
    expect(parsed.apr_percent).toBe(24.49);
    const purchase = parsed.rate_components.find((c) => c.balanceType === "purchase");
    const balanceTransfer = parsed.rate_components.find((c) => c.balanceType === "balance_transfer");
    const cashAdvance = parsed.rate_components.find((c) => c.balanceType === "cash_advance");
    expect(purchase).toMatchObject({ apr: 24.49, activeBalance: true });
    expect(balanceTransfer).toMatchObject({ apr: 19.49, activeBalance: false });
    expect(cashAdvance).toMatchObject({ apr: 27.49, activeBalance: false });
  });

  it("extracts credit line and available credit", () => {
    expect(parsed.credit_limit).toBe(12100);
    expect(parsed.available_credit).toBe(6980.9);
  });

  it("detects product name and classifies as a credit card statement", () => {
    expect(parsed.product_name).toBe("Cash+ Visa Signature");
    expect(parsed.document_type).toBe("CREDIT_CARD_STATEMENT");
  });

  it("payoff illustration's $202 alternate-payment figure never becomes the current minimum", () => {
    expect(parsed.creditor_payoff_illustration).toMatchObject({ yearsToPayoff: 13, totalPaid: 12396, alternatePaymentAmount: 202 });
    expect(parsed.min_due).toBe(144);
  });
});

describe("DATA-2: U.S. Bank Personal Line (line of credit) statement fixture", () => {
  const parsed = parseStatement(US_BANK_PERSONAL_LINE_STATEMENT_TEXT);

  it("classifies as a line-of-credit statement, not a credit card", () => {
    expect(parsed.document_type).toBe("LOC_STATEMENT");
  });

  it("distinguishes previous balance from current/new balance", () => {
    expect(parsed.previous_balance).toBe(4502.13);
    expect(parsed.balance).toBe(4553.22);
  });

  it("distinguishes the creditor minimum due from the amount actually paid", () => {
    expect(parsed.min_due).toBe(102);
    expect(parsed.amount_paid).toBe(100);
  });

  it("extracts the due date as a full date", () => {
    expect(parsed.due_date).toBe("2026-03-15");
  });

  it("extracts the 12.75% APR as the active rate component", () => {
    expect(parsed.apr_percent).toBe(12.75);
    expect(parsed.rate_components.some((c) => c.apr === 12.75 && c.activeBalance)).toBe(true);
  });

  it("extracts credit line and available credit", () => {
    expect(parsed.credit_limit).toBe(9600);
    expect(parsed.available_credit).toBe(5046.78);
  });

  it("payoff illustration's $152 alternate-payment figure never becomes the current minimum", () => {
    expect(parsed.creditor_payoff_illustration).toMatchObject({ yearsToPayoff: 8, totalPaid: 6732, alternatePaymentAmount: 152 });
    expect(parsed.min_due).toBe(102);
  });
});

// BETA-3.2: real-world bugs found by running the owner's actual PDF
// statement corpus (21 real credit-card/LOC statements across 7 lenders)
// through this parser. Every value below is fabricated - no real
// creditor/account/name/balance from that corpus appears here.
describe("BETA-3.2: parseStatement does not silently discard evidence when the initial cheap balance scan finds nothing", () => {
  it("still returns lender/APR/due-date evidence even when balance and minimum due are both unresolvable", () => {
    // Mirrors a real statement whose key balance/payment figures were
    // rendered in a way the initial narrow currency scan couldn't match,
    // but whose lender name, due date, and APR were still plainly present
    // in normal text.
    const text = [
      "Navy Federal Credit Union",
      "Payment Due Date 02/16/2026",
      "your APRs may be increased up to the Penalty APR of 18.00%.",
      "Purchases 21.50% Annual Percentage Rate (APR)",
    ].join("\n");
    const parsed = parseStatement(text);
    expect(parsed).not.toBeNull();
    expect(parsed.bank).toBe("Navy Federal");
    expect(parsed.due_date).toBe("2026-02-16");
    // Penalty APR must never win over a genuine purchase-labeled rate.
    expect(parsed.apr_percent).toBe(21.5);
  });

  it("still returns null for genuinely non-financial text with no real evidence of any kind", () => {
    const parsed = parseStatement("Thank you for your business.\nNo account information here.");
    expect(parsed).toBeNull();
  });
});

describe("BETA-3.2: lender detection ignores a parent-company footer mention", () => {
  it("prefers the statement's own brand over a 'a division of X' disclosure naming a different, already-recognized institution", () => {
    const text = "TEST HOLDER | Acct Ending 1234\n© 2025 TestCard, a division of Capital One, N.A., Member FDIC.";
    // TestCard itself isn't a recognized brand, so this proves the negative
    // side: Capital One must NOT win just because it's named as the parent.
    expect(detectProviderName(text)).not.toBe("Capital One");
  });

  it("still matches a provider normally when it is not introduced as anyone's parent company", () => {
    const text = "Capital One\nAccount Summary";
    expect(detectProviderName(text)).toBe("Capital One");
  });
});

describe("BETA-3.2: document-type classification prioritizes genuine product evidence over generic credit-card boilerplate", () => {
  it("classifies as LOC even when generic 'credit card' dispute-rights boilerplate is also present", () => {
    const text = [
      "Test Bank Personal Line Customer Service",
      "Your Rights If You Are Dissatisfied With Your Credit Card Purchases",
      "you must have used your credit card for the purchase.",
    ].join("\n");
    expect(detectDocumentType(text)).toBe("LOC_STATEMENT");
  });

  it("does not treat a 'Revolving Line of Credit' credit-limit field label as LOC-product evidence", () => {
    const text = [
      "Revolving Line of Credit $12,100.00",
      "Visa Signature",
    ].join("\n");
    expect(detectDocumentType(text)).toBe("CREDIT_CARD_STATEMENT");
  });

  it("still classifies a genuine line-of-credit statement with no credit-card boilerplate at all", () => {
    expect(detectDocumentType("Your personal line of credit draw period ends soon.")).toBe("LOC_STATEMENT");
  });
});

describe("BETA-3.2: multi-APR candidates exclude rewards/fee percentages that are not interest rates", () => {
  it("does not count cashback/rewards/fee percentages as APR candidates", () => {
    const text = [
      "Purchases 24.99% Annual Percentage Rate (APR)",
      "You always earn unlimited 1% cash back on all your purchases.",
      "an additional 4% cash back, for a total of 5% cash back on up to $1,500",
      "There is a foreign transaction fee of 3% of the U.S. dollar amount.",
      "Pay Over Time plans, there is a fixed monthly fee of up to 1.72% of the balance.",
    ].join("\n");
    const parsed = parseStatement(text);
    expect(parsed.apr_percent).toBe(24.99);
    expect(parsed.apr_candidates).not.toContain(1);
    expect(parsed.apr_candidates).not.toContain(3);
    expect(parsed.apr_candidates).not.toContain(4);
    expect(parsed.apr_candidates).not.toContain(5);
    expect(parsed.apr_candidates).not.toContain(1.72);
  });

  it("still counts a genuine second, non-excluded APR as a real candidate", () => {
    // Cash advance/penalty/balance-transfer rows are deliberately excluded
    // from aprCandidates by pre-existing design (they're preserved
    // separately in rateComponents instead) - this proves two ordinary
    // purchase-adjacent rates both still show up as real candidates.
    const text = [
      "Purchases 24.99% Annual Percentage Rate (APR)",
      "Variable APR 19.99% Annual Percentage Rate (APR)",
    ].join("\n");
    const parsed = parseStatement(text);
    expect(parsed.apr_candidates.length).toBeGreaterThan(1);
  });
});

describe("BETA-3.2: 2-digit-year dates are recognized, never silently dropped", () => {
  it("resolveTwoDigitYear pivots 00-79 to 20xx and 80-99 to 19xx", () => {
    expect(resolveTwoDigitYear("25")).toBe(2025);
    expect(resolveTwoDigitYear("79")).toBe(2079);
    expect(resolveTwoDigitYear("80")).toBe(1980);
    expect(resolveTwoDigitYear("99")).toBe(1999);
  });

  it("dateStringToIso converts a 2-digit-year MM/DD/YY date correctly", () => {
    expect(dateStringToIso("12/06/25")).toBe("2025-12-06");
  });

  it("still converts a normal 4-digit-year date unchanged", () => {
    expect(dateStringToIso("12/06/2025")).toBe("2025-12-06");
  });

  it("a statement date printed as MM/DD/YY is extracted end-to-end through parseStatement", () => {
    const text = [
      "Test Bank",
      "New Balance $500.00",
      "Statement Date: 12/06/25",
    ].join("\n");
    expect(parseStatement(text).statement_date).toBe("2025-12-06");
  });
});

describe("BETA-3.2: a combined 'Opening/Closing Date' range picks the closing (later) date, not the opening date", () => {
  it("extracts the second date in an Opening/Closing Date range as the statement date", () => {
    const text = [
      "Test Bank",
      "New Balance $500.00",
      "Opening/Closing Date 11/07/25 - 12/06/25",
    ].join("\n");
    expect(parseStatement(text).statement_date).toBe("2025-12-06");
  });
});

describe("BETA-3.2: owner-suggestion boilerplate false positives are excluded", () => {
  it("does not mistake 'Make/Mail to X Card Services' payment-instruction boilerplate for the account holder", () => {
    const text = [
      "Make/Mail to Test Card Services at the address below:",
      "New Balance $500.00",
      "Page 2 of 2 Statement Date: 12/06/25 JORDAN SMITH",
    ].join("\n");
    // The boilerplate must never become the holder suggestion - whether or
    // not the real name elsewhere on the line is also successfully found.
    expect(String(parseStatement(text).holder_name || "")).not.toMatch(/card services/i);
  });

  it("does not mistake mobile-app marketing text for the account holder", () => {
    const text = [
      "Manage your account online at: Mobile: Download the",
      "Test Bank Mobile app today",
      "New Balance $500.00",
    ].join("\n");
    expect(String(parseStatement(text).holder_name || "")).not.toMatch(/mobile app/i);
  });
});
