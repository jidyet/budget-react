import { describe, expect, it } from "vitest";
import {
  MATCH_CLASSIFICATIONS,
  buildImportFingerprint,
  buildReconciliationDiff,
  enrichImportCandidatesWithDebtMatches,
  matchImportCandidateToDebts,
  normalizeCreditorForMatch,
  normalizeSafeAccountReference,
} from "./debtReconciliation";

const debt = (overrides = {}) => ({
  id: "d1",
  workspaceId: "w1",
  name: "Firstmark Student Loan",
  accountReferenceSafe: "last4:1234",
  debtType: "student_loan",
  status: "active",
  currentBalance: 12000,
  aprStatus: "known",
  apr: 0.0725,
  minimumRequiredPayment: 180,
  ownerType: "member",
  ownerId: "owner-a",
  ownerLabel: "Ada",
  includedInCorePayoffPlan: true,
  ...overrides,
});

const candidate = (overrides = {}) => ({
  candidateId: "c1",
  source: "pdf",
  creditorName: "Firstmark Services",
  accountName: "Firstmark Loan ending in 1234",
  accountReferenceSafe: "••••1234",
  debtType: "student_loan",
  currentBalance: 11880,
  statementDate: "2026-08-10",
  aprStatus: "known",
  apr: 7.25,
  minimumPayment: 180,
  dueDate: "2026-08-21",
  ownerType: "member",
  ownerId: "owner-a",
  ownerSuggestion: "Ada",
  includedInCorePayoffPlan: true,
  decision: "pending_review",
  duplicateStatus: "new",
  warnings: [],
  ...overrides,
});

describe("debt reconciliation", () => {
  it("normalizes account references and creditor variants used by PDFs/workbooks", () => {
    expect(normalizeSafeAccountReference("last4:1234")).toBe("last4:1234");
    expect(normalizeSafeAccountReference("Account ••••1234")).toBe("last4:1234");
    expect(normalizeSafeAccountReference("Account â€¢â€¢â€¢â€¢1234")).toBe("last4:1234");
    expect(normalizeCreditorForMatch("BofA Visa")).toBe("bank america");
    expect(normalizeCreditorForMatch("Bank of America")).toBe("bank america");
  });

  it("classifies a Firstmark workbook/PDF candidate with matching last4 as a strong existing debt match", () => {
    const result = matchImportCandidateToDebts({
      candidate: candidate(),
      debts: [debt()],
      latestSnapshotsByDebt: { d1: { balance: 12000, observedAt: "2026-07-10T00:00:00.000Z" } },
    });
    expect(result.classification).toBe(MATCH_CLASSIFICATIONS.strongMatch);
    expect(result.matches[0].debtId).toBe("d1");
    expect(result.matches[0].diff.balance.state).toBe("changed");
  });

  it("does not treat same creditor with a different safe account reference as the same debt", () => {
    const result = matchImportCandidateToDebts({
      candidate: candidate({ creditorName: "Chase", accountName: "Chase Sapphire", accountReferenceSafe: "last4:5678" }),
      debts: [debt({ name: "Chase Freedom", accountReferenceSafe: "last4:1234", debtType: "credit_card" })],
    });
    expect(result.classification).toBe(MATCH_CLASSIFICATIONS.noMatch);
  });

  it("treats creditor-only matches as possible or multiple, never as silent update authority", () => {
    const result = matchImportCandidateToDebts({
      candidate: candidate({ accountReferenceSafe: "", accountName: "Firstmark Loan" }),
      debts: [
        debt({ id: "loan-a", accountReferenceSafe: "last4:1111" }),
        debt({ id: "loan-b", accountReferenceSafe: "last4:2222" }),
      ],
    });
    expect(result.classification).toBe(MATCH_CLASSIFICATIONS.multipleMatches);
    expect(result.matches).toHaveLength(2);
    expect(result.concerns.join(" ")).toMatch(/not enough/i);
  });

  it("recognizes Bank of America/BofA as the same creditor when last4 also matches", () => {
    const result = matchImportCandidateToDebts({
      candidate: candidate({ creditorName: "BofA", accountName: "BofA Cash Rewards", accountReferenceSafe: "last4:9999", debtType: "credit_card" }),
      debts: [debt({ name: "Bank of America Cash Rewards", accountReferenceSafe: "last4:9999", debtType: "credit_card" })],
    });
    expect(result.classification).toBe(MATCH_CLASSIFICATIONS.strongMatch);
  });

  it("keeps owner conflicts as review evidence instead of changing ownership automatically", () => {
    const result = matchImportCandidateToDebts({
      candidate: candidate({ ownerId: "owner-b", ownerSuggestion: "Ben" }),
      debts: [debt({ ownerId: "owner-a", ownerLabel: "Ada" })],
    });
    expect(result.classification).toBe(MATCH_CLASSIFICATIONS.strongMatch);
    expect(result.matches[0].concerns).toContain("Owner differs");
    expect(result.matches[0].diff.owner.state).toBe("changed");
  });

  it("does not match a credit card candidate against an unrelated mortgage from weak evidence alone (UX-6.1 guardrail)", () => {
    const result = matchImportCandidateToDebts({
      candidate: candidate({
        creditorName: "U.S. Bank Cash+",
        accountName: "Cash+ Visa Signature",
        accountReferenceSafe: "",
        debtType: "credit_card",
        currentBalance: 5119.1,
        ownerType: "unassigned",
        ownerId: "",
      }),
      debts: [debt({ name: "House Mortgage", accountReferenceSafe: "", debtType: "mortgage", currentBalance: 120700, ownerType: "joint", ownerId: "" })],
    });
    expect(result.classification).toBe(MATCH_CLASSIFICATIONS.noMatch);
  });

  it("lets an incompatible debt type sink an otherwise-crossing creditor+owner match below the possible threshold", () => {
    // Pre-fix this scores 45 (creditor +35, owner +10) - comfortably over the
    // 35 "possible" threshold - even though the types are incompatible. This
    // is the scenario that actually exercises the new typeConflict penalty
    // (unlike the test above, where creditorSame is already false).
    const result = matchImportCandidateToDebts({
      candidate: candidate({
        creditorName: "Firstmark Services",
        accountName: "Firstmark account",
        accountReferenceSafe: "",
        debtType: "credit_card",
        ownerId: "owner-a",
      }),
      debts: [debt({ name: "Firstmark Services", accountReferenceSafe: "", debtType: "mortgage", ownerId: "owner-a" })],
    });
    expect(result.classification).toBe(MATCH_CLASSIFICATIONS.noMatch);
  });

  it("still surfaces a debt-type mismatch as a concern (not a veto) when account+creditor already match strongly", () => {
    const result = matchImportCandidateToDebts({
      candidate: candidate({ debtType: "credit_card" }),
      debts: [debt({ debtType: "student_loan" })],
    });
    expect(result.classification).toBe(MATCH_CLASSIFICATIONS.strongMatch);
    expect(result.matches[0].concerns).toContain("Debt type does not match");
  });

  it("detects duplicate imports from prior ImportBatch fingerprints", () => {
    const prior = {
      id: "batch-old",
      candidates: [{ ...candidate(), evidence: { reconciliation: { fingerprint: buildImportFingerprint(candidate()) } }, decision: "confirmed", targetDebtId: "d1" }],
    };
    const result = matchImportCandidateToDebts({ candidate: candidate(), debts: [debt()], priorImportBatches: [prior] });
    expect(result.classification).toBe(MATCH_CLASSIFICATIONS.duplicateImport);
    expect(result.duplicate.batchId).toBe("batch-old");
  });

  it("enriches candidates without mutating the original parser output", () => {
    const source = candidate();
    const enriched = enrichImportCandidatesWithDebtMatches({ candidates: [source], debts: [debt()] });
    expect(enriched[0].evidence.reconciliation.classification).toBe(MATCH_CLASSIFICATIONS.strongMatch);
    expect(enriched[0].targetDebtId).toBe("d1");
    expect(source.evidence).toBeUndefined();
  });

  it("builds field diffs that distinguish same, changed, new information, missing, and conflicting values", () => {
    const diff = buildReconciliationDiff({
      candidate: candidate({ accountReferenceSafe: "last4:5678", minimumPayment: null, dueDate: null }),
      debt: debt({ accountReferenceSafe: "last4:1234", dueDay: null }),
      latestSnapshot: { balance: 12000, observedAt: "2026-07-10T00:00:00.000Z" },
    });
    expect(diff.accountReferenceSafe.state).toBe("conflicting");
    expect(diff.minimumPayment.state).toBe("missing_in_new");
    expect(diff.dueDay.state).toBe("missing_in_new");
    expect(diff.aprStatus.state).toBe("same");
    expect(diff.balance.state).toBe("changed");
  });
});
