import { describe, expect, it } from "vitest";
import {
  createImportBatchMetadata,
  getImportBatchVersionState,
  IMPORT_BATCH_CLASSIFIER_VERSION,
  IMPORT_BATCH_PARSER_VERSION,
  IMPORT_BATCH_SCHEMA_VERSION,
  isStaleImportBatch,
  summarizeStaleImportBatch,
} from "./importBatchVersioning.js";

describe("importBatchVersioning", () => {
  it("builds current metadata by default", () => {
    expect(createImportBatchMetadata()).toEqual({
      parserVersion: IMPORT_BATCH_PARSER_VERSION,
      classifierVersion: IMPORT_BATCH_CLASSIFIER_VERSION,
      schemaVersion: IMPORT_BATCH_SCHEMA_VERSION,
      sourceHash: "",
      nonDebtItems: [],
      scanSummary: {},
    });
  });

  it("treats current excel batches as non-stale", () => {
    expect(isStaleImportBatch({
      sourceType: "excel",
      metadata: createImportBatchMetadata(),
    })).toBe(false);
  });

  it("treats old excel batches as stale", () => {
    expect(isStaleImportBatch({
      sourceType: "excel",
      metadata: { parserVersion: "1", classifierVersion: "", schemaVersion: "" },
    })).toBe(true);
  });

  it("does not mark non-excel batches stale just because metadata is older", () => {
    expect(isStaleImportBatch({
      sourceType: "pdf",
      metadata: { parserVersion: "1" },
    })).toBe(false);
  });

  it("summarizes stale-batch details for UI/reporting", () => {
    const summary = summarizeStaleImportBatch({
      id: "batch-1",
      sourceType: "excel",
      sourceFilename: "debts.xlsx",
      candidateCount: 53,
      metadata: { parserVersion: "1" },
    });
    expect(summary).toMatchObject({
      id: "batch-1",
      sourceType: "excel",
      sourceFilename: "debts.xlsx",
      candidateCount: 53,
      parserVersion: "1",
    });
  });

  it("reports exact current-state booleans", () => {
    const state = getImportBatchVersionState({
      sourceType: "excel",
      metadata: createImportBatchMetadata(),
    });
    expect(state.isExcelLike).toBe(true);
    expect(state.isCurrentParser).toBe(true);
    expect(state.isCurrentClassifier).toBe(true);
    expect(state.isCurrentSchema).toBe(true);
  });
});
