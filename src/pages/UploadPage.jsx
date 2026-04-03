import { lazy, Suspense, useState } from "react";
import LoadingState from "../components/ui/LoadingState";

const ExcelImport = lazy(() => import("../ExcelImport"));
const StatementUpload = lazy(() => import("../StatementUpload"));

const TABS = [
  { id: "excel", label: "From Excel/CSV" },
  { id: "pdf",   label: "From PDF Statement" },
  { id: "other", label: "From Other Files/Docs" },
];

export default function UploadPage({ c, allAccts, monthKey, theme, updateRecord, showToast, handleUpload }) {
  const [uploadTab, setUploadTab] = useState("excel");

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setUploadTab(id)}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: `1.5px solid ${uploadTab === id ? c.ac : c.border}`,
              background: uploadTab === id ? c.acD : c.surf,
              color: uploadTab === id ? c.ac : c.muted,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'Instrument Sans',sans-serif",
              transition: "all .15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {uploadTab === "excel" && (
        <Suspense fallback={<LoadingState palette={c} label="Opening import tools..." />}>
          <ExcelImport
            accounts={allAccts}
            monthKey={monthKey}
            theme={theme}
            onImported={async (id, updates) => {
              await updateRecord(id, updates);
              showToast("Imported from Excel");
            }}
            onUpload={handleUpload}
          />
        </Suspense>
      )}

      {uploadTab === "pdf" && (
        <Suspense fallback={<LoadingState palette={c} label="Opening PDF reader..." />}>
          <StatementUpload
            accounts={allAccts}
            monthKey={monthKey}
            theme={theme}
            sourceMode="pdf"
            onSaved={async (id, updates) => {
              await updateRecord(id, updates);
              showToast("Updated from statement");
            }}
            onUpload={handleUpload}
          />
        </Suspense>
      )}

      {uploadTab === "other" && (
        <Suspense fallback={<LoadingState palette={c} label="Opening image reader..." />}>
          <StatementUpload
            accounts={allAccts}
            monthKey={monthKey}
            theme={theme}
            sourceMode="other"
            onSaved={async (id, updates) => {
              await updateRecord(id, updates);
              showToast("Updated from file");
            }}
            onUpload={handleUpload}
          />
        </Suspense>
      )}
    </div>
  );
}
