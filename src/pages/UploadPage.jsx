import { lazy, Suspense, useState } from "react";
import LoadingState from "../components/ui/LoadingState";
import GuidanceCard from "../components/ui/GuidanceCard";
import ExcelImport from "../ExcelImport";

const StatementUpload = lazy(() => import("../StatementUpload"));

const TABS = [
  { id: "pdf",   label: "From PDF Statement" },
  { id: "other", label: "From Other Files/Docs" },
  { id: "sheet", label: "From Excel / CSV" },
];

export default function UploadPage({ c, allAccts, monthKey, theme, updateRecord, showToast, handleUpload, addCustomAccount, ownerOptions = [] }) {
  const [uploadTab, setUploadTab] = useState("pdf");

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <GuidanceCard
          palette={c}
          icon="↑"
          title="Choose how you want to import"
          instruction="Pick PDF statement, other files, or Excel / CSV, then upload your file below."
          result="We’ll pull what we can, let you review it, and then save it to the right bill."
        />
      </div>

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

      {uploadTab === "pdf" && (
        <Suspense fallback={<LoadingState palette={c} label="Opening PDF reader..." />}>
          <StatementUpload
            accounts={allAccts}
            monthKey={monthKey}
            theme={theme}
            sourceMode="pdf"
            ownerOptions={ownerOptions}
            onCreateAccount={addCustomAccount}
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
            ownerOptions={ownerOptions}
            onCreateAccount={addCustomAccount}
            onSaved={async (id, updates) => {
              await updateRecord(id, updates);
              showToast("Updated from file");
            }}
            onUpload={handleUpload}
          />
        </Suspense>
      )}

      {uploadTab === "sheet" && (
        <ExcelImport
          accounts={allAccts}
          theme={theme}
          onImported={async (id, updates) => {
            await updateRecord(id, updates);
            showToast("Updated from spreadsheet");
          }}
          onUpload={handleUpload}
        />
      )}
    </div>
  );
}
