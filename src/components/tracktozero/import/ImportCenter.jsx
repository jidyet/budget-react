import React, { useState } from "react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import WarningCallout from "../ui/WarningCallout.jsx";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { formatMoney as money } from "../formatting.js";
import { getUserSafeTrackToZeroError } from "../../../services/tracktozero/v2AsyncApplicationService.js";
import ImportSummaryHeader from "./ImportSummaryHeader.jsx";
import NonDebtCallout from "./NonDebtCallout.jsx";
import ImportCandidateList from "./ImportCandidateList.jsx";
import ImportCandidateDetail from "./ImportCandidateDetail.jsx";

const formatFileSize = (file) => {
  if (!file || !file.size) return "0 KB";
  const kb = file.size / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

// UX-6.1: master-detail rewrite of the monolith's ImportPanel/
// ImportReviewCandidate. Same state machine (idle/ready/parsing/review/
// saving-decision/committing), same service calls, same resumable-batch
// behavior - only the review-state RENDERING changed, from one full
// editable card per candidate stacked vertically (the "45-form wall") to a
// list pane + a single detail pane. Non-debt items (previously computed by
// workbookDebtDiscovery.js and silently discarded here) now flow through to
// service.createImportBatch's metadata and render via NonDebtCallout.
export default function ImportCenter({ snapshot, service, refresh, refreshReview, canManage, reviewSnapshot, onGoToReview, onClose, onAddAsDebt }) {
  const [importState, setImportState] = useState({ status: "idle", batch: null, error: "" });
  const [selectedFile, setSelectedFile] = useState(null);
  const [dismissedResumeBatchId, setDismissedResumeBatchId] = useState(null);
  const [resuming, setResuming] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [pendingNonDebtItems, setPendingNonDebtItems] = useState([]);
  const [newlyCreatedPeople, setNewlyCreatedPeople] = useState([]);
  const palette = ttzPalette;
  const people = [...(snapshot.people || []), ...newlyCreatedPeople.filter((person) => !(snapshot.people || []).some((existing) => existing.id === person.id))];

  const resumableBatchId = importState.status === "idle" && !!reviewSnapshot?.openItems?.length
    ? reviewSnapshot.openItems.find((item) => item.importBatchId !== dismissedResumeBatchId)?.importBatchId
    : null;
  const resumableCandidateCount = resumableBatchId
    ? reviewSnapshot.openItems.filter((item) => item.importBatchId === resumableBatchId).length
    : 0;
  const resumableSourceName = resumableBatchId
    ? reviewSnapshot.openItems.find((item) => item.importBatchId === resumableBatchId)?.sourceReference
    : "";

  const resumeImport = async () => {
    if (!resumableBatchId || typeof service.getImportBatch !== "function") return;
    setResuming(true);
    try {
      const batch = await service.getImportBatch(snapshot.workspace.id, resumableBatchId);
      if (batch && batch.status === "review_required") {
        setImportState({ status: "review", batch, error: "" });
        setPendingNonDebtItems(batch.metadata?.nonDebtItems || []);
      }
    } catch {
      // Resuming is a convenience, not a requirement - if it fails, the
      // user can still reach these candidates from Review.
    } finally {
      setResuming(false);
    }
  };

  const handleCreatePerson = async (displayName) => {
    const person = await service.createImportedPerson(snapshot.workspace.id, { displayName });
    setNewlyCreatedPeople((state) => (state.some((existing) => existing.id === person.id) ? state : [...state, person]));
    return person;
  };

  const handleFileSelection = (file) => {
    if (!file) return;
    setSelectedFile(file);
    setImportState({ status: "ready", batch: null, error: "" });
  };

  const analyzeSelectedFile = async () => {
    if (!selectedFile) return;
    await handleFile(selectedFile);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setSelectedFile(file);
    setImportState({ status: "parsing", batch: null, error: "" });
    try {
      const name = String(file.name || "").toLowerCase();
      const isCsv = name.endsWith(".csv");
      const isPdf = name.endsWith(".pdf");
      const isImage = /\.(png|jpe?g|webp)$/.test(name);

      if (isPdf || isImage) {
        const result = isPdf
          ? await (await import("../../../services/adapters/pdfImportReader.js")).readPdfFileToCandidate(file, { importBatchId: "upload", source: "pdf" })
          : await (await import("../../../services/adapters/imageImportReader.js")).readImageFileToCandidate(file, { importBatchId: "upload", source: "image" });
        if (result.status !== "parsed" || !result.candidate) {
          setImportState({ status: "ready", batch: null, error: result.message || "This file could not be read." });
          return;
        }
        const batch = await service.createImportBatch(snapshot.workspace.id, {
          sourceType: isPdf ? "pdf" : "image",
          sourceFilename: file.name,
          candidates: [result.candidate],
          warnings: [],
        });
        setImportState({ status: "review", batch, error: "" });
        setPendingNonDebtItems([]);
        await refreshReview?.();
        return;
      }

      const parsed = isCsv
        ? await (await import("../../../services/adapters/csvImportReader.js")).readCsvFileToCandidates(file, { importBatchId: "upload", source: "csv" })
        : await (await import("../../../services/adapters/excelImportReader.js")).readExcelFileToCandidates(file, { importBatchId: "upload", source: "excel" });
      if (!parsed.confident || !parsed.candidates.length) {
        setImportState({ status: "ready", batch: null, error: parsed.batchWarnings.join(" ") || "This file could not be read as a debt list." });
        return;
      }
      const batch = await service.createImportBatch(snapshot.workspace.id, {
        sourceType: isCsv ? "csv" : "excel",
        sourceFilename: file.name,
        candidates: parsed.candidates,
        warnings: parsed.batchWarnings,
        nonDebtItems: parsed.nonDebtItems || [],
        scanSummary: parsed.scanSummary || {},
      });
      setImportState({ status: "review", batch, error: "" });
      setPendingNonDebtItems(parsed.nonDebtItems || []);
      await refreshReview?.();
    } catch (error) {
      setImportState({ status: "ready", batch: null, error: getUserSafeTrackToZeroError(error).message });
    }
  };

  const updateCandidate = async (candidateId, patch) => {
    const batch = importState.batch;
    const current = batch.candidates.find((c) => c.candidateId === candidateId);
    const decision = current.decision;
    setImportState((state) => ({
      ...state,
      batch: { ...state.batch, candidates: state.batch.candidates.map((c) => (c.candidateId === candidateId ? { ...c, ...patch } : c)) },
    }));
    await service.decideImportCandidate(snapshot.workspace.id, batch.id, candidateId, { decision, patch });
  };

  const decideCandidate = async (candidateId, decision) => {
    setImportState((state) => ({ ...state, status: "saving-decision" }));
    const updated = await service.decideImportCandidate(snapshot.workspace.id, importState.batch.id, candidateId, { decision, patch: {} });
    setImportState({ status: "review", batch: updated, error: "" });
  };

  const resolveMatch = async (candidateId, targetDebtId, metadataUpdates) => {
    setImportState((state) => ({ ...state, status: "saving-decision" }));
    try {
      const updated = await service.resolveAsExistingDebt(snapshot.workspace.id, importState.batch.id, candidateId, { targetDebtId, metadataUpdates });
      setImportState({ status: "review", batch: updated, error: "" });
    } catch (error) {
      setImportState((state) => ({ ...state, status: "review", error: getUserSafeTrackToZeroError(error).message }));
    }
  };

  const resolveNew = async (candidateId) => {
    setImportState((state) => ({ ...state, status: "saving-decision" }));
    try {
      const updated = await service.resolveAsNewDebt(snapshot.workspace.id, importState.batch.id, candidateId);
      setImportState({ status: "review", batch: updated, error: "" });
    } catch (error) {
      setImportState((state) => ({ ...state, status: "review", error: getUserSafeTrackToZeroError(error).message }));
    }
  };

  const commit = async () => {
    setImportState((state) => ({ ...state, status: "committing" }));
    try {
      await service.commitImportBatch(snapshot.workspace.id, importState.batch.id);
      setImportState({ status: "idle", batch: null, error: "" });
      setPendingNonDebtItems([]);
      await refresh();
      await refreshReview?.();
      onClose?.();
    } catch (error) {
      setImportState((state) => ({ ...state, status: "review", error: error?.message || "Some debts could not be added. The rest were saved; try again for the remaining ones." }));
    }
  };

  if (importState.status === "idle" || importState.status === "ready" || importState.status === "parsing") {
    return (
      <Card variant="default">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx }}>Import debts</div>
            <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>Excel, CSV, PDF, or a photo</div>
          </div>
          {onClose ? <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button> : null}
        </div>

        {resumableBatchId ? (
          <WarningCallout title="You have an import waiting for review" style={{ marginBottom: 14 }}>
            {resumableSourceName ? `${resumableSourceName} · ` : ""}{resumableCandidateCount} debt{resumableCandidateCount === 1 ? "" : "s"} still need{resumableCandidateCount === 1 ? "s" : ""} a decision.
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <Button type="button" variant="primary" disabled={resuming} onClick={resumeImport}>{resuming ? "Loading..." : "Continue review"}</Button>
              {onGoToReview ? <Button type="button" onClick={onGoToReview}>Open in Review</Button> : null}
              <Button type="button" variant="ghost" onClick={() => setDismissedResumeBatchId(resumableBatchId)}>Dismiss</Button>
            </div>
          </WarningCallout>
        ) : null}

        <p style={{ ...TYPE_SCALE.body, color: palette.tx }}>Upload a spreadsheet (.xlsx, .xls, .csv), a statement PDF, or a photo/screenshot of a statement (PNG, JPG, WEBP).</p>
        <p style={{ ...TYPE_SCALE.supporting, color: palette.tx2, marginTop: 0 }}><strong>We analyze the file and show you what we found.</strong> Nothing becomes part of your debt data until you approve it.</p>

        <Card variant="default" style={{ borderStyle: "dashed", marginTop: 12 }}>
          <div style={{ display: "grid", gap: 12 }}>
            {selectedFile ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>Selected file</div>
                    <div style={{ ...TYPE_SCALE.supporting, fontWeight: 800, color: palette.tx }}>{selectedFile.name}</div>
                    <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>{formatFileSize(selectedFile)}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Button type="button" variant="primary" disabled={!canManage || importState.status === "parsing"} onClick={analyzeSelectedFile}>
                    {importState.status === "parsing" ? "Analyzing..." : "Analyze file"}
                  </Button>
                  <Button type="button" onClick={() => { setSelectedFile(null); setImportState({ status: "idle", batch: null, error: "" }); }}>
                    Choose another file
                  </Button>
                </div>
              </>
            ) : (
              <label style={{ display: "grid", gap: 10, cursor: "pointer" }}>
                <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>Choose a file</div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp"
                  aria-label="Upload a spreadsheet, PDF, or photo of your debts"
                  disabled={!canManage || importState.status === "parsing"}
                  onChange={(event) => handleFileSelection(event.target.files?.[0])}
                  style={{ width: "100%" }}
                />
              </label>
            )}

            {importState.status === "parsing" && (
              <div role="status" aria-live="polite" style={{ ...TYPE_SCALE.supporting, color: palette.ac || palette.tx, fontWeight: 800 }}>
                Reading your file… Finding debt details… Checking for duplicates… Preparing your review…
              </div>
            )}

            {importState.error && <p role="alert" style={{ ...TYPE_SCALE.supporting, color: palette.da, fontWeight: 800 }}>{importState.error}</p>}
            {!canManage && <p style={{ ...TYPE_SCALE.supporting, color: palette.tx2 }}>Your role is read-only for imports.</p>}
          </div>
        </Card>
      </Card>
    );
  }

  const batch = importState.batch;
  const candidates = batch.candidates;
  const confirmed = candidates.filter((c) => c.decision === "confirmed");
  const excluded = candidates.filter((c) => c.decision === "excluded");
  const totalConfirmedBalance = confirmed.reduce((sum, c) => sum + Number(c.currentBalance || 0), 0);
  const unknownAprCount = confirmed.filter((c) => c.aprStatus === "unknown").length;
  const missingMinimumCount = confirmed.filter((c) => c.minimumPayment == null).length;
  const mortgageExcludedCount = confirmed.filter((c) => c.debtType === "mortgage" && !c.includedInCorePayoffPlan).length;
  const busy = importState.status === "committing" || importState.status === "saving-decision";
  const selected = candidates.find((c) => c.candidateId === selectedCandidateId) || candidates[0] || null;
  const nonDebtItems = batch.metadata?.nonDebtItems || pendingNonDebtItems;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <ImportSummaryHeader candidates={candidates} nonDebtItems={nonDebtItems} sourceFilename={batch.sourceFilename} />
      <NonDebtCallout nonDebtItems={nonDebtItems} onAddAsDebt={onAddAsDebt} />

      {!!batch.warnings?.length && (
        <WarningCallout>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{batch.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </WarningCallout>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 300px) 1fr", gap: 16, alignItems: "start" }}>
        <Card variant="default" style={{ maxHeight: 640, overflowY: "auto" }}>
          <ImportCandidateList candidates={candidates} selectedCandidateId={selected?.candidateId} onSelect={setSelectedCandidateId} />
        </Card>
        <div>
          {selected ? (
            <ImportCandidateDetail
              candidate={selected}
              canManage={canManage}
              busy={busy}
              workspace={snapshot.workspace}
              members={snapshot.members}
              people={people}
              onUpdate={(patch) => updateCandidate(selected.candidateId, patch)}
              onDecide={(decision) => decideCandidate(selected.candidateId, decision)}
              onResolveMatch={(candidateId, targetDebtId, metadataUpdates) => resolveMatch(candidateId, targetDebtId, metadataUpdates)}
              onResolveNew={(candidateId) => resolveNew(candidateId)}
              onCreatePerson={canManage ? handleCreatePerson : undefined}
            />
          ) : (
            <Card variant="default"><p style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>No candidates to review.</p></Card>
          )}
        </div>
      </div>

      <Card variant="default">
        <div style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx, marginBottom: 8 }}>Before you add anything</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, ...TYPE_SCALE.supporting, color: palette.tx }}>
          <p><strong>Debts to create:</strong> {confirmed.length}</p>
          <p><strong>Excluded:</strong> {excluded.length}</p>
          <p><strong>Total confirmed balance:</strong> {money(totalConfirmedBalance)}</p>
          <p><strong>Unknown APR:</strong> {unknownAprCount}</p>
          <p><strong>Missing minimum payment:</strong> {missingMinimumCount}</p>
          <p><strong>Mortgage excluded from core:</strong> {mortgageExcludedCount}</p>
        </div>
        {importState.error && <p role="alert" style={{ ...TYPE_SCALE.supporting, color: palette.da, fontWeight: 800 }}>{importState.error}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <Button type="button" variant="primary" disabled={!canManage || busy || !confirmed.length} onClick={commit}>
            {importState.status === "committing" ? "Adding..." : `Add these ${confirmed.length} debt(s) to TrackToZero`}
          </Button>
          <Button type="button" onClick={() => { setImportState({ status: "idle", batch: null, error: "" }); setPendingNonDebtItems([]); }}>Cancel import</Button>
        </div>
      </Card>
    </div>
  );
}
