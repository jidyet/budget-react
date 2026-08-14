export const MATCH_CLASSIFICATIONS = Object.freeze({
  noMatch: "no_match",
  possibleMatch: "possible_match",
  strongMatch: "strong_match",
  multipleMatches: "multiple_matches",
  duplicateImport: "duplicate_import",
});

export const RECONCILIATION_DECISIONS = Object.freeze({
  updateExisting: "update_existing",
  newDebt: "new_debt",
  unsure: "unsure",
});

export const REVIEW_STATUSES = Object.freeze({
  open: "open",
  resolved: "resolved",
});

const text = (value) => String(value ?? "").trim();
const lower = (value) => text(value).toLowerCase();
const compact = (value) => lower(value)
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\b(bank|card|credit|loan|loans|student|services?|servicing|na|n a|inc|llc|the)\b/g, " ")
  .replace(/\s+/g, " ")
  .trim();

export const normalizeSafeAccountReference = (value = "") => {
  const source = text(value).replace(/â€¢/g, "•");
  const explicit = source.match(/last\s*4\s*:?\s*(\d{4})/i)?.[1]
    || source.match(/last4\s*:?\s*(\d{4})/i)?.[1]
    || source.match(/(?:\*{2,}|x{2,}|•{2,}|ending\s+in)\s*(\d{4})\b/i)?.[1]
    || source.match(/\b(\d{4})\b(?!.*\b\d{4}\b)/)?.[1]
    || "";
  return explicit ? `last4:${explicit}` : "";
};

export const normalizeCreditorForMatch = (value = "") => {
  const raw = lower(value);
  if (/\bbofa\b|\bbank of america\b/.test(raw)) return "bank america";
  if (/\bjpmorgan\b|\bjp morgan\b/.test(raw)) return "chase";
  const key = compact(value);
  if (!key) return "";
  if (/\bbofa\b|\bbank of america\b/.test(key)) return "bank america";
  if (/\bchase\b|\bjpmorgan\b|\bjp morgan\b/.test(key)) return "chase";
  if (/\bfirstmark\b/.test(key)) return "firstmark";
  if (/\bsofi\b/.test(key)) return "sofi";
  if (/\bcapital one\b|\bcap one\b/.test(key)) return "capital one";
  return key;
};

const sameLoose = (left, right) => {
  const a = normalizeCreditorForMatch(left);
  const b = normalizeCreditorForMatch(right);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
};

const ownerLabelFor = (entity) => lower(entity?.ownerLabel || entity?.ownerSuggestion || "");
const money = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const centsEqual = (a, b) => money(a) !== null && money(b) !== null && Math.abs(money(a) - money(b)) < 0.01;
const dateOnly = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? text(value).slice(0, 10) : parsed.toISOString().slice(0, 10);
};

export const buildImportFingerprint = (candidate = {}) => [
  normalizeCreditorForMatch(candidate.creditorName || candidate.accountName),
  normalizeSafeAccountReference(candidate.accountReferenceSafe),
  dateOnly(candidate.statementDate),
  money(candidate.currentBalance) === null ? "" : money(candidate.currentBalance).toFixed(2),
].join("|");

const candidateFingerprintsFromBatch = (batch = {}) =>
  (batch.candidates || []).map((candidate) => ({
    batchId: batch.id,
    candidateId: candidate.candidateId,
    fingerprint: candidate.evidence?.reconciliation?.fingerprint || buildImportFingerprint(candidate),
    decision: candidate.decision,
    targetDebtId: candidate.targetDebtId || candidate.duplicateOfDebtId || "",
  }));

const fieldValue = (field, entity, latestSnapshot) => {
  if (field === "creditorName") return entity.creditorName || entity.accountName || entity.name || "";
  if (field === "accountReferenceSafe") return normalizeSafeAccountReference(entity.accountReferenceSafe);
  if (field === "debtType") return entity.debtType || "";
  if (field === "owner") return entity.ownerType === "joint" ? "joint" : (entity.ownerId || ownerLabelFor(entity));
  if (field === "balance") return latestSnapshot?.balance ?? entity.currentBalance;
  if (field === "statementDate") return entity.statementDate || latestSnapshot?.observedAt || "";
  if (field === "apr") return entity.apr;
  if (field === "aprStatus") return entity.aprStatus || "";
  if (field === "minimumPayment") return entity.minimumPayment ?? entity.minimumRequiredPayment;
  if (field === "dueDay") return entity.dueDay ?? "";
  if (field === "includedInCorePayoffPlan") return entity.includedInCorePayoffPlan;
  return entity[field];
};

const diffStateFor = (field, candidateValue, debtValue) => {
  const candidateMissing = candidateValue === null || candidateValue === undefined || candidateValue === "";
  const debtMissing = debtValue === null || debtValue === undefined || debtValue === "";
  if (candidateMissing && debtMissing) return "missing_in_new";
  if (candidateMissing) return "missing_in_new";
  if (debtMissing) return "new_information";
  if (field === "creditorName") return sameLoose(candidateValue, debtValue) ? "same" : "changed";
  if (field === "accountReferenceSafe") return normalizeSafeAccountReference(candidateValue) === normalizeSafeAccountReference(debtValue) ? "same" : "conflicting";
  if (field === "balance" || field === "minimumPayment" || field === "apr") return centsEqual(candidateValue, debtValue) ? "same" : "changed";
  if (field === "statementDate") return dateOnly(candidateValue) === dateOnly(debtValue) ? "same" : "changed";
  return String(candidateValue) === String(debtValue) ? "same" : "changed";
};

export const buildReconciliationDiff = ({ candidate = {}, debt = {}, latestSnapshot = null } = {}) => {
  const fields = ["creditorName", "accountReferenceSafe", "debtType", "owner", "balance", "statementDate", "apr", "aprStatus", "minimumPayment", "dueDay", "includedInCorePayoffPlan"];
  return Object.fromEntries(fields.map((field) => {
    const candidateValue = fieldValue(field, candidate, null);
    const existingValue = fieldValue(field, debt, latestSnapshot);
    return [field, {
      existingValue,
      newValue: candidateValue,
      state: diffStateFor(field, candidateValue, existingValue),
    }];
  }));
};

export const scoreCandidateAgainstDebt = ({ candidate = {}, debt = {}, latestSnapshot = null } = {}) => {
  const candidateRef = normalizeSafeAccountReference(candidate.accountReferenceSafe);
  const debtRef = normalizeSafeAccountReference(debt.accountReferenceSafe);
  const creditorSame = sameLoose(candidate.creditorName || candidate.accountName, debt.name);
  const accountSame = !!candidateRef && !!debtRef && candidateRef === debtRef;
  const accountConflict = !!candidateRef && !!debtRef && candidateRef !== debtRef;
  const ownerSame = (candidate.ownerType === "joint" && debt.ownerType === "joint")
    || (!!candidate.ownerId && candidate.ownerId === debt.ownerId)
    || (!!ownerLabelFor(candidate) && ownerLabelFor(candidate) === ownerLabelFor(debt));
  const typeSame = !!candidate.debtType && !!debt.debtType && lower(candidate.debtType) === lower(debt.debtType);
  const balanceClose = money(candidate.currentBalance) !== null
    && money(latestSnapshot?.balance ?? debt.currentBalance) !== null
    && Math.abs(money(candidate.currentBalance) - money(latestSnapshot?.balance ?? debt.currentBalance)) <= Math.max(50, money(latestSnapshot?.balance ?? debt.currentBalance) * 0.03);

  let score = 0;
  const reasons = [];
  const concerns = [];
  if (accountSame) { score += 70; reasons.push("Same safe account reference"); }
  if (creditorSame) { score += 35; reasons.push("Creditor/name appears to match"); }
  if (ownerSame) { score += 10; reasons.push("Owner signal matches"); }
  if (typeSame) { score += 8; reasons.push("Debt type matches"); }
  if (balanceClose) { score += 6; reasons.push("Balance is close to existing latest balance"); }
  if (accountConflict) { score -= 80; concerns.push("Safe account references conflict"); }
  if (candidate.ownerId && debt.ownerId && candidate.ownerId !== debt.ownerId) { score -= 12; concerns.push("Owner differs"); }
  if (!accountSame && creditorSame) concerns.push("Creditor match alone is not enough to update automatically");
  const strength = accountConflict
    ? "no_match"
    : (accountSame && creditorSame ? "strong" : (score >= 35 ? "possible" : "none"));
  return {
    debtId: debt.id,
    debtName: debt.name,
    score,
    strength,
    reasons,
    concerns,
    diff: buildReconciliationDiff({ candidate, debt, latestSnapshot }),
  };
};

export const matchImportCandidateToDebts = ({
  candidate = {},
  debts = [],
  latestSnapshotsByDebt = {},
  priorImportBatches = [],
} = {}) => {
  const fingerprint = buildImportFingerprint(candidate);
  const priorDuplicate = priorImportBatches
    .flatMap(candidateFingerprintsFromBatch)
    .find((item) => item.fingerprint === fingerprint);
  if (priorDuplicate) {
    return {
      classification: MATCH_CLASSIFICATIONS.duplicateImport,
      fingerprint,
      matches: [],
      duplicate: priorDuplicate,
      reasons: ["This statement/candidate fingerprint was imported before."],
      concerns: ["Review before creating another balance snapshot."],
      reviewStatus: REVIEW_STATUSES.open,
    };
  }
  const matches = debts
    .filter((debt) => debt.status !== "archived")
    .map((debt) => scoreCandidateAgainstDebt({ candidate, debt, latestSnapshot: latestSnapshotsByDebt[debt.id] || null }))
    .filter((match) => match.strength === "strong" || match.strength === "possible")
    .sort((a, b) => b.score - a.score || String(a.debtName).localeCompare(String(b.debtName)));
  const strong = matches.filter((match) => match.strength === "strong");
  const classification = strong.length === 1
    ? MATCH_CLASSIFICATIONS.strongMatch
    : (matches.length > 1 ? MATCH_CLASSIFICATIONS.multipleMatches : (matches.length === 1 ? MATCH_CLASSIFICATIONS.possibleMatch : MATCH_CLASSIFICATIONS.noMatch));
  return {
    classification,
    fingerprint,
    matches,
    duplicate: null,
    reasons: matches[0]?.reasons || ["No existing debt matched strongly."],
    concerns: matches.flatMap((match) => match.concerns),
    reviewStatus: REVIEW_STATUSES.open,
  };
};

export const enrichImportCandidatesWithDebtMatches = ({
  candidates = [],
  debts = [],
  latestSnapshotsByDebt = {},
  priorImportBatches = [],
} = {}) => candidates.map((candidate) => {
  const reconciliation = matchImportCandidateToDebts({
    candidate,
    debts,
    latestSnapshotsByDebt,
    priorImportBatches,
  });
  const bestMatch = reconciliation.matches[0] || null;
  return {
    ...candidate,
    targetDebtId: bestMatch?.debtId || candidate.targetDebtId || "",
    duplicateOfDebtId: reconciliation.duplicate?.targetDebtId || "",
    duplicateStatus: reconciliation.classification === MATCH_CLASSIFICATIONS.duplicateImport
      ? "exact_duplicate"
      : (reconciliation.classification === MATCH_CLASSIFICATIONS.strongMatch ? "likely_duplicate" : "new"),
    evidence: {
      ...(candidate.evidence || {}),
      reconciliation,
    },
  };
});

export const buildResolutionEvidence = ({ decision, targetDebtId = "", metadataUpdates = {}, actorId = "", resolvedAt = "" } = {}) => ({
  decision,
  targetDebtId,
  metadataUpdates: { ...metadataUpdates },
  status: decision === RECONCILIATION_DECISIONS.unsure ? REVIEW_STATUSES.open : REVIEW_STATUSES.resolved,
  resolvedAt,
  resolvedBy: actorId,
});
