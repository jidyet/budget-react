import { useEffect, useState } from "react";
import EmptyState from "../components/feedback/EmptyState";
import ErrorState from "../components/feedback/ErrorState";
import { MONTHS } from "../data/mockAccounts";
import { fx, pct } from "../utils/budgetUtils";

export default function HistoryPage(props) {
  const {
    mounted,
    c,
    user,
    isLocalUser,
    ensureLocalUserData,
    monthKey,
    loadUploads,
    workspaceScope,
    selMonth,
    selYear,
    normalizeAprDecimal,
    isMobile,
  } = props;

  const [uploadsList, setUploadsList] = useState([]);
  const [uploadsError, setUploadsError] = useState(null);
  const [sel, setSel] = useState(null);

  const formatUploadDate = (createdAt) => {
    try {
      if (!createdAt) return "";
      const d = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt);
      return d.toLocaleString();
    } catch {
      return "";
    }
  };

  const buildStatementHighlights = (upload, row) => {
    const parsed = upload?.parsed || {};
    const before = row?.before || {};
    const after = row?.after || {};
    const aprValue = normalizeAprDecimal(after.apr_v ?? before.apr_v ?? 0);
    const highlights = [
      { label: "Bank", value: parsed.bank || row?.name || "Unknown" },
      { label: "Bill", value: row?.name || parsed.account_hint || "Matched account" },
      { label: "Balance", value: fx(after.cur_bal ?? parsed.balance ?? before.cur_bal ?? 0) },
      { label: "Remaining", value: fx(after.remaining_balance_v ?? parsed.remaining_balance ?? null) },
      { label: "Min due", value: fx(after.min_due_v ?? parsed.min_due ?? before.min_due_v ?? 0) },
      { label: "New purchases", value: fx(after.new_purchases_v ?? parsed.new_purchases ?? after.purch_v ?? null) },
      { label: "APR", value: aprValue > 0 ? pct(aprValue) : "Not found" },
      { label: "Due day", value: parsed.due_day ? `Day ${parsed.due_day}` : "Not found" },
      { label: "Interest", value: fx(after.interest_charged_v ?? parsed.interest_charged ?? null) },
      { label: "Fees", value: fx(after.fees_v ?? parsed.fees ?? null) },
    ];
    return highlights.filter((item) => item.value !== "-" || item.label === "APR" || item.label === "Due day");
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user) {
        setUploadsList([]);
        setUploadsError(null);
        return;
      }
      if (user.isLocal || isLocalUser) {
        const data = ensureLocalUserData(user.uid);
        const uploads = ((data.months || {})[monthKey] || {}).uploads || [];
        if (active) {
          setUploadsList(uploads.slice().reverse());
          setUploadsError(null);
        }
        return;
      }
      try {
        const uploads = await (loadUploads ? loadUploads(user.uid, monthKey, 500, workspaceScope) : []);
        if (active) {
          setUploadsList(uploads.slice().reverse());
          setUploadsError(null);
        }
      } catch (error) {
        console.error("loadUploads error", error);
        if (active) setUploadsError("We could not load your uploads right now.");
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [ensureLocalUserData, isLocalUser, loadUploads, monthKey, user, workspaceScope]);

  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", display: "grid", gap: 12, maxWidth: 860 }}>
      <div style={{ background: `linear-gradient(135deg, ${c.ac}14, ${c.surf} 36%, ${c.surf2})`, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px 20px", display: "grid", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>History</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: c.tx }}>Statement uploads</div>
        <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.55, maxWidth: 560 }}>
          Every statement you've imported this month, with a breakdown of what we pulled in.
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 800, color: c.tx2, paddingLeft: 2 }}>
        {MONTHS[selMonth - 1]} {selYear} · {uploadsList.length} upload{uploadsList.length !== 1 ? "s" : ""}
      </div>
      {uploadsError && <ErrorState palette={c} title="Uploads unavailable" message={uploadsError} />}
      {!uploadsError && uploadsList.length === 0 && <EmptyState palette={c} title="Nothing here yet" message="No uploads were saved for this month." />}

      {uploadsList.map((upload, index) => (
        <div key={index} style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800 }}>{upload.fileName || upload.type}</div>
              <div style={{ fontSize: 12, color: c.muted }}>
                {upload.uploader || upload.parsed?.account_hint || ""} - {formatUploadDate(upload.createdAt)}
              </div>
            </div>
            <div>
              <button
                onClick={() => setSel(sel === index ? null : index)}
                style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${sel === index ? c.ac : c.border2}`, background: sel === index ? `${c.ac}16` : c.surf2, color: sel === index ? c.ac : c.tx, fontWeight: 700, cursor: "pointer" }}
              >
                Details
              </button>
            </div>
          </div>

          {sel === index && (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {(upload.rows || []).map((row, rowIndex) => (
                <div key={rowIndex} style={{ padding: "12px", borderTop: `1px dashed ${c.border}`, borderRadius: 12, background: c.surf2, display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: c.tx }}>{row.name}</div>
                      <div style={{ fontSize: 12, color: c.muted }}>Saved to {row.accountId}</div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.ac }}>Quick look</div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3,minmax(0,1fr))", gap: 8 }}>
                    {buildStatementHighlights(upload, row).map((item) => (
                      <div key={item.label} style={{ padding: "10px 12px", borderRadius: 10, background: c.surf, border: `1px solid ${c.border}` }}>
                        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 5 }}>{item.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: c.tx, fontFamily: ["Balance", "Remaining", "Min due", "New purchases", "Interest", "Fees", "APR"].includes(item.label) ? "'DM Mono',monospace" : "'Instrument Sans',sans-serif" }}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.5 }}>
                    We pulled in the latest statement details and only updated the account fields you confirmed.
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
