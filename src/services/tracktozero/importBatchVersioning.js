import { WORKBOOK_DISCOVERY_VERSION } from "../adapters/workbookDebtDiscovery.js";

export const IMPORT_BATCH_SCHEMA_VERSION = "1";
export const IMPORT_BATCH_CLASSIFIER_VERSION = "review-2";
export const IMPORT_BATCH_PARSER_VERSION = WORKBOOK_DISCOVERY_VERSION;

export const createImportBatchMetadata = ({
  parserVersion = IMPORT_BATCH_PARSER_VERSION,
  classifierVersion = IMPORT_BATCH_CLASSIFIER_VERSION,
  schemaVersion = IMPORT_BATCH_SCHEMA_VERSION,
  sourceHash = "",
  nonDebtItems = [],
  scanSummary = {},
} = {}) => ({
  parserVersion,
  classifierVersion,
  schemaVersion,
  sourceHash: String(sourceHash || "").trim(),
  nonDebtItems: Array.isArray(nonDebtItems) ? nonDebtItems : [],
  scanSummary: scanSummary && typeof scanSummary === "object" ? scanSummary : {},
});

const isExcelLikeBatch = (batch = {}) => {
  const sourceType = String(batch?.sourceType || "").toLowerCase();
  return sourceType === "excel" || sourceType === "csv";
};

export const getImportBatchVersionState = (batch = {}) => {
  const metadata = batch?.metadata && typeof batch.metadata === "object" ? batch.metadata : {};
  const parserVersion = String(metadata.parserVersion || "").trim();
  const classifierVersion = String(metadata.classifierVersion || "").trim();
  const schemaVersion = String(metadata.schemaVersion || "").trim();
  return {
    parserVersion,
    classifierVersion,
    schemaVersion,
    isExcelLike: isExcelLikeBatch(batch),
    isCurrentParser: parserVersion === IMPORT_BATCH_PARSER_VERSION,
    isCurrentClassifier: classifierVersion === IMPORT_BATCH_CLASSIFIER_VERSION,
    isCurrentSchema: schemaVersion === IMPORT_BATCH_SCHEMA_VERSION,
  };
};

export const isStaleImportBatch = (batch = {}) => {
  const version = getImportBatchVersionState(batch);
  if (!version.isExcelLike) return false;
  return !version.isCurrentParser || !version.isCurrentClassifier || !version.isCurrentSchema;
};

export const summarizeStaleImportBatch = (batch = {}) => {
  const candidates = Array.isArray(batch?.candidates) ? batch.candidates : [];
  const version = getImportBatchVersionState(batch);
  return {
    id: batch?.id || "",
    sourceType: batch?.sourceType || "",
    sourceFilename: batch?.sourceFilename || "",
    createdAt: batch?.createdAt || "",
    updatedAt: batch?.updatedAt || "",
    candidateCount: Number(batch?.candidateCount || candidates.length || 0),
    parserVersion: version.parserVersion,
    classifierVersion: version.classifierVersion,
    schemaVersion: version.schemaVersion,
  };
};
