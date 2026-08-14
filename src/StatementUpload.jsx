import { useRef, useState } from "react";
import { LAUNCH_COPY } from "./config/launchCopy";
import {
  buildCreateDraft,
  buildInitialOverrides,
  FIELD_CONFIG,
  formatCurrency,
  getFileType,
  loadOcr,
  loadPdfJs,
  matchAccount,
  parseNumericInput,
  parseStatement,
  PROVIDER_EXAMPLES,
} from "./services/adapters/statementTextExtraction.js";

export default function StatementUpload({ accounts = [], theme, onSaved, onUpload, onCreateAccount, onComplete, sourceMode = "pdf", ownerOptions = [] }) {
  const [status, setStatus] = useState("idle");
  const [parsed, setParsed] = useState(null);
  const [matches, setMatches] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [createDraft, setCreateDraft] = useState(buildCreateDraft(null, ownerOptions));
  const [fileName, setFileName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [savedList, setSavedList] = useState([]);
  const fileRef = useRef(null);

  const isDark = theme === "dark";
  const acceptsPdf = sourceMode === "pdf";
  const acceptsImages = sourceMode !== "pdf";
  const copyKey = acceptsPdf ? "pdf" : "image";
  const sourceTitle = LAUNCH_COPY.uploadModes[copyKey].title;
  const sourceDescription = LAUNCH_COPY.uploadModes[copyKey].description;
  const fileAccept = acceptsPdf ? ".pdf" : "image/png,image/jpeg,image/jpg,image/webp";
  const dropBadge = LAUNCH_COPY.uploadModes[copyKey].badge;
  const dropTitle = LAUNCH_COPY.uploadModes[copyKey].dropTitle;
  const dropSubtext = LAUNCH_COPY.uploadModes[copyKey].dropSubtext;
  const palette = {
    surf: isDark ? "#141414" : "#ffffff",
    surf2: isDark ? "#1e1e1e" : "#f0efe9",
    border: isDark ? "#2c2c2c" : "#e2e0d8",
    border2: isDark ? "#3a3a3a" : "#ccc9be",
    tx: isDark ? "#f0f0f0" : "#111111",
    tx2: isDark ? "#a0a0a0" : "#4a4a4a",
    muted: isDark ? "#555555" : "#999888",
    ac: "#00c9a7",
    acSoft: isDark ? "rgba(0,201,167,.14)" : "rgba(0,201,167,.10)",
    warn: isDark ? "#ffaa00" : "#c97800",
    danger: isDark ? "#ff4c4c" : "#d42828",
    dangerSoft: isDark ? "rgba(255,76,76,.12)" : "rgba(212,40,40,.08)",
  };

  const labelStyle = {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: palette.muted,
    marginBottom: 5,
    fontFamily: "'Instrument Sans',sans-serif",
  };
  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 7,
    border: `1.5px solid ${palette.border2}`,
    background: palette.surf,
    color: palette.tx,
    fontSize: 13,
    fontFamily: "'DM Mono',monospace",
    outline: "none",
    boxSizing: "border-box",
  };
  const buttonStyle = (background, color = "#000") => ({
    padding: "9px 18px",
    borderRadius: 8,
    border: "none",
    background,
    color,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Instrument Sans',sans-serif",
  });

  const extractPdfText = async (file) => {
    const { pdfjsLib, workerSrc } = await loadPdfJs();
    if (!pdfjsLib) throw new Error("PDF reader is not available");
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const pdf = await pdfjsLib.getDocument({
            data: event.target.result,
            useSystemFonts: true,
            disableFontFace: true,
            isEvalSupported: false,
            disablePreferences: true,
            disableHistory: true,
          }).promise;
          let fullText = "";
          for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
            try {
              const page = await pdf.getPage(pageIndex);
              const content = await page.getTextContent();
              const lines = [];
              let currentLine = [];
              let lastY = null;
              for (const item of content.items) {
                const chunk = String(item?.str || "").trim();
                if (!chunk) continue;
                const y = Number(item?.transform?.[5] ?? 0);
                if (lastY != null && Math.abs(y - lastY) > 2.5) {
                  if (currentLine.length) lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
                  currentLine = [];
                }
                currentLine.push(chunk);
                lastY = y;
              }
              if (currentLine.length) lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
              fullText += `${lines.join("\n")}\n`;
            } catch {
              // skip page if it fails (e.g. color space issues on some browsers)
            }
          }
          if (!fullText.trim()) throw new Error("No readable text found in PDF");
          resolve(fullText);
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const extractImageText = async (file) => {
    const ocrModule = await loadOcr();
    const workerApi = ocrModule.createWorker ? ocrModule : ocrModule.default;
    const result = await workerApi.recognize(file, "eng", {
      logger: () => {},
    });
    return result?.data?.text || "";
  };

  const handleFile = async (file) => {
    const fileType = getFileType(file);
    const invalidForMode =
      fileType === "unknown" ||
      (acceptsPdf && fileType !== "pdf") ||
      (acceptsImages && fileType !== "image");
    if (!file || invalidForMode) {
      setErrorMsg(acceptsPdf ? "Please upload a PDF statement." : "Please upload a PNG, JPG, JPEG, or WEBP image.");
      setStatus("error");
      return;
    }

    setFileName(file.name);
    setStatus("parsing");
    setErrorMsg("");

    try {
      const text = fileType === "pdf" ? await extractPdfText(file) : await extractImageText(file);
      const result = parseStatement(text);
      if (!result) {
        const manual = {
          balance: null,
          remaining_balance: null,
          min_due: null,
          due_day: null,
          apr_percent: null,
          new_purchases: null,
          interest_charged: null,
          fees: null,
          previous_balance: null,
          account_hint: "Manual entry",
          bank: "",
        };
        setParsed(manual);
        setMatches([]);
        setSelectedId(null);
        setOverrides(buildInitialOverrides(manual));
        setCreateDraft(buildCreateDraft(manual, ownerOptions));
        setStatus("results");
        return;
      }

      const matchedAccounts = matchAccount(result, accounts);
      setParsed(result);
      setMatches(matchedAccounts);
      setSelectedId(matchedAccounts.length === 1 ? matchedAccounts[0].id : null);
      setOverrides(buildInitialOverrides(result));
      setCreateDraft(buildCreateDraft(result, ownerOptions));
      setStatus("results");
    } catch (error) {
      setErrorMsg(`We could not read that file: ${error?.message || error}`);
      setStatus("error");
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setErrorMsg("");
    setStatus("saving");

    const account = accounts.find((item) => item.id === selectedId);
    if (!account) {
      setErrorMsg("Please choose a valid account before saving.");
      setStatus("error");
      return;
    }

    const nextBalance = parseNumericInput(overrides.remaining_balance) ?? parseNumericInput(overrides.balance) ?? account.cur_bal;
    const nextMinDue = parseNumericInput(overrides.min_due) ?? account.min_due_v;
    const nextPurchases = parseNumericInput(overrides.new_purchases) ?? account.purch_v ?? 0;
    const nextAprPercent = parseNumericInput(overrides.apr_percent);

    const updates = {
      cur_bal: nextBalance,
      min_due_v: nextMinDue,
      paid_v: account.paid_v || 0,
      is_paid: account.is_paid || false,
      purch_v: nextPurchases,
      apr_v: nextAprPercent != null ? nextAprPercent / 100 : account.apr_v,
    };

    const uploadAfter = {
      ...updates,
      remaining_balance_v: parseNumericInput(overrides.remaining_balance),
      previous_balance_v: parsed?.previous_balance ?? null,
      new_purchases_v: nextPurchases,
      interest_charged_v: parseNumericInput(overrides.interest_charged),
      fees_v: parseNumericInput(overrides.fees),
      due_day_v: parseNumericInput(overrides.due_day),
    };

    const parsedSnapshot = {
      ...parsed,
      balance: parseNumericInput(overrides.balance),
      remaining_balance: parseNumericInput(overrides.remaining_balance),
      min_due: parseNumericInput(overrides.min_due),
      due_day: parseNumericInput(overrides.due_day),
      apr_percent: parseNumericInput(overrides.apr_percent),
      new_purchases: parseNumericInput(overrides.new_purchases),
      interest_charged: parseNumericInput(overrides.interest_charged),
      fees: parseNumericInput(overrides.fees),
    };

    const before = account || null;
    try {
      await (onSaved ? onSaved(selectedId, updates) : Promise.resolve());
      setSavedList((current) => [...current, account.name]);

      if (typeof onUpload === "function") {
        onUpload({
          fileName,
          type: getFileType({ name: fileName }),
          rows: [{ accountId: selectedId, name: account.name, before, after: uploadAfter }],
          parsed: parsedSnapshot,
        });
      }
      setStatus("done");
      onComplete?.({ mode: "update", accountId: selectedId, accountName: account.name });
    } catch (error) {
      setErrorMsg(`We could not save that statement: ${error?.message || error}`);
      setStatus("error");
    }
  };

  const handleCreateAccount = async () => {
    if (typeof onCreateAccount !== "function") return;
    const name = String(createDraft.name || "").trim();
    if (!name) {
      setErrorMsg("Give the new bill a name before you save it.");
      setStatus("error");
      return;
    }
    setErrorMsg("");
    setStatus("saving");

    const created = await onCreateAccount({
      name,
      bank: String(createDraft.bank || parsed?.bank || name).trim(),
      owner: String(createDraft.owner || "").trim() || undefined,
      category: String(createDraft.category || "DEBT").trim().toUpperCase(),
      bal: String(parseNumericInput(overrides.remaining_balance) ?? parseNumericInput(overrides.balance) ?? createDraft.bal ?? ""),
      min: String(parseNumericInput(overrides.min_due) ?? createDraft.min ?? ""),
      due: String(parseNumericInput(overrides.due_day) ?? createDraft.due ?? ""),
      apr: String(parseNumericInput(overrides.apr_percent) ?? createDraft.apr ?? ""),
      interest_type: createDraft.interest_type || "variable_apr",
    });

    if (!created?.id) {
      setStatus("results");
      return;
    }

    setSavedList((current) => [...current, created.name || name]);

    if (typeof onUpload === "function") {
      onUpload({
        fileName,
        type: getFileType({ name: fileName }),
        rows: [{ accountId: created.id, name: created.name || name, before: null, after: created }],
        parsed: {
          ...parsed,
          balance: parseNumericInput(overrides.balance),
          remaining_balance: parseNumericInput(overrides.remaining_balance),
          min_due: parseNumericInput(overrides.min_due),
          due_day: parseNumericInput(overrides.due_day),
          apr_percent: parseNumericInput(overrides.apr_percent),
          new_purchases: parseNumericInput(overrides.new_purchases),
          interest_charged: parseNumericInput(overrides.interest_charged),
          fees: parseNumericInput(overrides.fees),
        },
      });
    }

    setStatus("done");
    onComplete?.({ mode: "create", accountId: created.id, accountName: created.name || name });
  };

  const reset = () => {
    setStatus("idle");
    setParsed(null);
    setMatches([]);
    setSelectedId(null);
    setOverrides({});
    setCreateDraft(buildCreateDraft(null, ownerOptions));
    setFileName("");
    setErrorMsg("");
    setSavedList([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div style={{ maxWidth: 760, margin: "24px auto 0" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: palette.muted, marginBottom: 6, fontFamily: "'Instrument Sans',sans-serif" }}>
          {sourceTitle}
        </div>
        <div style={{ fontSize: 13, color: palette.tx2 }}>
          {sourceDescription}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ width: "100%", fontSize: 11, color: palette.muted, marginBottom: 8 }}>
          Common examples only. You can still upload statements from other providers.
        </div>
        {PROVIDER_EXAMPLES.map((bank) => (
          <span key={bank} style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: bank.startsWith("+") ? palette.acSoft : palette.surf2, border: `1px solid ${bank.startsWith("+") ? palette.ac : palette.border}`, color: bank.startsWith("+") ? palette.ac : palette.tx2, fontFamily: "'Instrument Sans',sans-serif" }}>
            {bank}
          </span>
        ))}
      </div>

      {(status === "idle" || status === "error") && (
        <>
          <div
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
            onClick={() => fileRef.current?.click()}
            style={{ border: `2px dashed ${status === "error" ? palette.danger : palette.border2}`, borderRadius: 14, padding: "40px 24px", textAlign: "center", cursor: "pointer", background: palette.surf, transition: "all .2s", marginBottom: 12 }}
            onMouseEnter={(event) => {
              event.currentTarget.style.borderColor = palette.ac;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.borderColor = status === "error" ? palette.danger : palette.border2;
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>{dropBadge}</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: palette.tx, marginBottom: 4 }}>{dropTitle}</div>
            <div style={{ fontSize: 12, color: palette.muted }}>{dropSubtext}</div>
            {fileName && <div style={{ marginTop: 8, fontSize: 12, color: palette.ac, fontWeight: 600 }}>{fileName}</div>}
          </div>

          <input ref={fileRef} type="file" accept={fileAccept} style={{ display: "none" }} onChange={(event) => handleFile(event.target.files?.[0])} />

          {status === "error" && (
            <div style={{ padding: "12px 16px", borderRadius: 10, background: palette.dangerSoft, border: `1px solid ${palette.danger}`, color: palette.danger, fontSize: 13, marginBottom: 12 }}>
              {errorMsg}
            </div>
          )}
        </>
      )}

      {status === "parsing" && (
        <div style={{ textAlign: "center", padding: "40px 0", color: palette.muted }}>
          <div style={{ fontSize: 28, animation: "spin 1s linear infinite", display: "inline-block" }}>o</div>
          <div style={{ marginTop: 10, fontSize: 13 }}>Reading {fileName}...</div>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {status === "results" && parsed && (
        <div>
          {parsed.holder_name && (
            <div style={{ background: palette.acSoft, border: `1px solid ${palette.ac}`, borderRadius: 10, padding: "10px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 15 }}>👤</span>
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: palette.ac }}>Detected owner from statement: </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: palette.tx }}>{parsed.holder_name}</span>
              </div>
            </div>
          )}

          <div style={{ background: palette.surf, border: `1px solid ${palette.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: parsed.bank === "" ? palette.warn : palette.ac, marginBottom: 12, fontFamily: "'Instrument Sans',sans-serif" }}>
              {parsed.bank === "" ? "Could not auto-detect the bank - enter values manually and pick an account." : `Detected from ${parsed.account_hint}`}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
              {FIELD_CONFIG.map(({ label, key, step, placeholder }) => (
                <div key={key}>
                  <div style={labelStyle}>{label}</div>
                  <input type="number" step={step} style={inputStyle} value={overrides[key] ?? ""} onChange={(event) => setOverrides((current) => ({ ...current, [key]: event.target.value }))} placeholder={placeholder} />
                </div>
              ))}
            </div>

            {(parsed.loan_type || parsed.co_signer || parsed.estimated_payoff != null || parsed.principal_balance != null || parsed.accrued_interest_v != null || parsed.previous_balance != null || parsed.interest_charged != null || parsed.fees != null) && (
              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {parsed.loan_type && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Loan type: {parsed.loan_type}</div>}
                {parsed.co_signer && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Co-signer: {parsed.co_signer}</div>}
                {parsed.estimated_payoff != null && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Est. payoff: {formatCurrency(parsed.estimated_payoff)}</div>}
                {parsed.principal_balance != null && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Principal: {formatCurrency(parsed.principal_balance)}</div>}
                {parsed.accrued_interest_v != null && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Accrued interest: {formatCurrency(parsed.accrued_interest_v)}</div>}
                {parsed.previous_balance != null && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Previous balance: {formatCurrency(parsed.previous_balance)}</div>}
                {parsed.interest_charged != null && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Interest charged: {formatCurrency(parsed.interest_charged)}</div>}
                {parsed.fees != null && <div style={{ padding: "8px 10px", borderRadius: 999, background: palette.surf2, border: `1px solid ${palette.border}`, fontSize: 12, color: palette.tx2 }}>Fees: {formatCurrency(parsed.fees)}</div>}
              </div>
            )}

            <div style={{ marginTop: 10, fontSize: 11, color: palette.muted }}>Review anything the parser found before you save it to the account.</div>
          </div>

          <div style={{ background: palette.surf, border: `1px solid ${palette.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: palette.muted, marginBottom: 12, fontFamily: "'Instrument Sans',sans-serif" }}>Match to account</div>
            {matches.length === 0 ? (
              <div style={{ color: palette.warn, fontSize: 13 }}>No match yet. Pick the account you want to update.</div>
            ) : (
              <div style={{ fontSize: 12, color: palette.muted, marginBottom: 10 }}>
                {matches.length === 1
                  ? "We found 1 matching account and selected it below."
                  : `We found ${matches.length} matching accounts. Pick the one you want to update.`}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {(matches.length > 0 ? matches : accounts).map((account) => (
                <div key={account.id} onClick={() => setSelectedId(account.id)} style={{ padding: "10px 14px", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${selectedId === account.id ? palette.ac : palette.border}`, background: selectedId === account.id ? palette.acSoft : palette.surf2, display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all .13s" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: palette.tx }}>{account.name}</div>
                    <div style={{ fontSize: 11, color: palette.muted }}>{account.owner} - {account.category}</div>
                  </div>
                  {selectedId === account.id && <span style={{ color: palette.ac, fontWeight: 800, fontSize: 16 }}>Y</span>}
                </div>
              ))}
            </div>
          </div>

          {typeof onCreateAccount === "function" && (
            <div style={{ background: palette.surf, border: `1px solid ${palette.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: palette.muted, marginBottom: 12, fontFamily: "'Instrument Sans',sans-serif" }}>Create new bill</div>
              <div style={{ fontSize: 12, color: palette.tx2, marginBottom: 12 }}>
                No bill yet for this statement? Save it as a brand-new bill and start tracking it right away.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
                <div>
                  <div style={labelStyle}>Bill name</div>
                  <input type="text" style={{ ...inputStyle, fontFamily: "'Instrument Sans',sans-serif" }} value={createDraft.name} onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Discover card" />
                </div>
                <div>
                  <div style={labelStyle}>Provider</div>
                  <input type="text" style={{ ...inputStyle, fontFamily: "'Instrument Sans',sans-serif" }} value={createDraft.bank} onChange={(event) => setCreateDraft((current) => ({ ...current, bank: event.target.value }))} placeholder="e.g. Discover" />
                </div>
                <div>
                  <div style={labelStyle}>Bill owner{parsed?.holder_name ? " (from statement)" : ""}</div>
                  <input list="statement-owner-options" type="text" style={{ ...inputStyle, fontFamily: "'Instrument Sans',sans-serif" }} value={createDraft.owner} onChange={(event) => setCreateDraft((current) => ({ ...current, owner: event.target.value }))} placeholder="Pick or type a bill owner" />
                  <datalist id="statement-owner-options">
                    {ownerOptions.map((owner) => <option key={owner} value={owner} />)}
                  </datalist>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" style={buttonStyle(palette.surf2, palette.tx2)} onClick={reset}>
              Start over
            </button>
            {typeof onCreateAccount === "function" && (
              <button
                type="button"
                style={{ ...buttonStyle(palette.surf2, palette.tx), flex: 1 }}
                onClick={handleCreateAccount}
              >
                Create new bill
              </button>
            )}
            <button
              type="button"
              style={{ ...buttonStyle(selectedId ? palette.ac : "#ccc", selectedId ? "#000" : palette.muted), flex: 1, opacity: selectedId ? 1 : 0.5 }}
              disabled={!selectedId}
              onClick={handleSave}
            >
              Save to {selectedId ? accounts.find((account) => account.id === selectedId)?.name : "account"}
            </button>
          </div>
        </div>
      )}

      {status === "saving" && (
        <div style={{ textAlign: "center", padding: "40px 0", color: palette.muted }}>
          <div style={{ fontSize: 28, animation: "spin 1s linear infinite", display: "inline-block" }}>o</div>
          <div style={{ marginTop: 10, fontSize: 13 }}>Saving to your account...</div>
        </div>
      )}

      {status === "done" && (
        <div style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>Saved</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: palette.tx, marginBottom: 6 }}>Saved!</div>
          <div style={{ fontSize: 13, color: palette.muted, marginBottom: 20 }}>
            {savedList.map((name, index) => (
              <div key={`${name}-${index}`}>* {name}</div>
            ))}
          </div>
          <button type="button" style={buttonStyle(palette.ac)} onClick={reset}>
            Upload another statement
          </button>
        </div>
      )}
    </div>
  );
}
