import { describe, expect, it } from "vitest";
import { parseStatement } from "./statementTextExtraction.js";
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
