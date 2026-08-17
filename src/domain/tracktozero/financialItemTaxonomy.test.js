import { describe, expect, it } from "vitest";
import {
  DEBT_CATEGORY_GROUPS,
  FINANCIAL_ITEM_TYPES,
  debtCategoryGroupFor,
  financialItemTypeForNonDebt,
  matchSectionHeading,
} from "./financialItemTaxonomy.js";

describe("financialItemTaxonomy: debtCategoryGroupFor", () => {
  it("maps existing granular debtType values onto the spec's coarser reporting groups", () => {
    expect(debtCategoryGroupFor("credit_card")).toBe(DEBT_CATEGORY_GROUPS.creditCard);
    expect(debtCategoryGroupFor("student_loan")).toBe(DEBT_CATEGORY_GROUPS.studentLoan);
    expect(debtCategoryGroupFor("personal_loan")).toBe(DEBT_CATEGORY_GROUPS.personalLoan);
    expect(debtCategoryGroupFor("line_of_credit")).toBe(DEBT_CATEGORY_GROUPS.lineOfCredit);
    expect(debtCategoryGroupFor("auto_loan")).toBe(DEBT_CATEGORY_GROUPS.autoLoan);
    expect(debtCategoryGroupFor("mortgage")).toBe(DEBT_CATEGORY_GROUPS.mortgageOrHomeLoan);
    expect(debtCategoryGroupFor("business_debt")).toBe(DEBT_CATEGORY_GROUPS.businessDebt);
    expect(debtCategoryGroupFor("bnpl")).toBe(DEBT_CATEGORY_GROUPS.bnplOrInstallmentFinancing);
  });

  it("groups granular values with no spec equivalent under OTHER_DEBT instead of renaming them", () => {
    expect(debtCategoryGroupFor("medical")).toBe(DEBT_CATEGORY_GROUPS.otherDebt);
    expect(debtCategoryGroupFor("collections")).toBe(DEBT_CATEGORY_GROUPS.otherDebt);
    expect(debtCategoryGroupFor("tax_debt")).toBe(DEBT_CATEGORY_GROUPS.otherDebt);
    expect(debtCategoryGroupFor("personal_debt")).toBe(DEBT_CATEGORY_GROUPS.otherDebt);
    expect(debtCategoryGroupFor("other")).toBe(DEBT_CATEGORY_GROUPS.otherDebt);
    expect(debtCategoryGroupFor("something-unrecognized")).toBe(DEBT_CATEGORY_GROUPS.otherDebt);
  });
});

describe("financialItemTaxonomy: matchSectionHeading", () => {
  it("recognizes debt section headings", () => {
    expect(matchSectionHeading("CREDIT CARDS")).toEqual({ financialItemType: FINANCIAL_ITEM_TYPES.debt, isBusinessSection: false });
    expect(matchSectionHeading("Student Loans")).toEqual({ financialItemType: FINANCIAL_ITEM_TYPES.debt, isBusinessSection: false });
    expect(matchSectionHeading("Line of Credit")).toEqual({ financialItemType: FINANCIAL_ITEM_TYPES.debt, isBusinessSection: false });
  });

  it("recognizes non-debt section headings the old 5-string denylist did not know about", () => {
    expect(matchSectionHeading("INSURANCE")).toEqual({ financialItemType: FINANCIAL_ITEM_TYPES.insurance, isBusinessSection: false });
    expect(matchSectionHeading("SUBSCRIPTIONS")).toEqual({ financialItemType: FINANCIAL_ITEM_TYPES.subscription, isBusinessSection: false });
    expect(matchSectionHeading("HOME EXPENSES")).toEqual({ financialItemType: FINANCIAL_ITEM_TYPES.homeExpense, isBusinessSection: false });
    expect(matchSectionHeading("UTILITIES")).toEqual({ financialItemType: FINANCIAL_ITEM_TYPES.utility, isBusinessSection: false });
    expect(matchSectionHeading("STORAGE")).toEqual({ financialItemType: FINANCIAL_ITEM_TYPES.storageExpense, isBusinessSection: false });
    expect(matchSectionHeading("SAVINGS")).toEqual({ financialItemType: FINANCIAL_ITEM_TYPES.savings, isBusinessSection: false });
    expect(matchSectionHeading("INCOME")).toEqual({ financialItemType: FINANCIAL_ITEM_TYPES.income, isBusinessSection: false });
  });

  it("BUSINESS carries no financialItemType of its own - requires secondary classification", () => {
    expect(matchSectionHeading("BUSINESS")).toEqual({ financialItemType: null, isBusinessSection: true });
  });

  it("recognizes subtotal/total rows distinctly from section headings", () => {
    expect(matchSectionHeading("Subtotal")).toEqual({ financialItemType: FINANCIAL_ITEM_TYPES.subtotalOrSummary, isBusinessSection: false });
    expect(matchSectionHeading("Grand Total")).toEqual({ financialItemType: FINANCIAL_ITEM_TYPES.subtotalOrSummary, isBusinessSection: false });
  });

  it("returns null for an ordinary data row label", () => {
    expect(matchSectionHeading("Capital One")).toBeNull();
    expect(matchSectionHeading("")).toBeNull();
  });
});

describe("financialItemTaxonomy: financialItemTypeForNonDebt", () => {
  it("prefers a strong section hint over row vocabulary", () => {
    expect(financialItemTypeForNonDebt({ accountText: "Gas", sectionHint: FINANCIAL_ITEM_TYPES.utility })).toBe(FINANCIAL_ITEM_TYPES.utility);
  });

  it("falls back to row-level vocabulary when there is no section hint", () => {
    expect(financialItemTypeForNonDebt({ accountText: "Gas" })).toBe(FINANCIAL_ITEM_TYPES.utility);
    expect(financialItemTypeForNonDebt({ accountText: "Netflix" })).toBe(FINANCIAL_ITEM_TYPES.subscription);
    expect(financialItemTypeForNonDebt({ accountText: "Monthly Savings" })).toBe(FINANCIAL_ITEM_TYPES.savings);
    expect(financialItemTypeForNonDebt({ accountText: "EagleView income" })).toBe(FINANCIAL_ITEM_TYPES.income);
    expect(financialItemTypeForNonDebt({ accountText: "Storage bill" })).toBe(FINANCIAL_ITEM_TYPES.storageExpense);
    expect(financialItemTypeForNonDebt({ accountText: "Auto insurance" })).toBe(FINANCIAL_ITEM_TYPES.insurance);
  });

  it("falls back to the generic bill type when only unspecific bill vocabulary is present", () => {
    expect(financialItemTypeForNonDebt({ accountText: "Groceries" })).toBe(FINANCIAL_ITEM_TYPES.billOrRecurringExpense);
  });
});
