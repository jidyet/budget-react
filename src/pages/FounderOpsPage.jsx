import { useEffect, useState } from "react";
import {
  TRIAGE_GUIDE,
  STATUS_FLOW,
  buildReleaseNotesDraft,
  buildSupportSnapshot,
} from "../services/founderOpsService";

const NEXT_ACTIONS = [
  "Review new feedback",
  "Check anything marked critical now",
  "Confirm billing still stays off for testers",
  "Keep release notes short and clear",
];

const CHECKS_KEY = "hb_founder_checks_v1";
const NOTES_KEY = "hb_founder_notes_v1";

const loadChecks = () => {
  try { return JSON.parse(localStorage.getItem(CHECKS_KEY) || "{}"); } catch { return {}; }
};
const saveChecks = (v) => { try { localStorage.setItem(CHECKS_KEY, JSON.stringify(v)); } catch { /* */ } };
const loadNotes = () => { try { return localStorage.getItem(NOTES_KEY) || ""; } catch { return ""; } };
const saveNotes = (v) => { try { localStorage.setItem(NOTES_KEY, v); } catch { /* */ } };

export default function FounderOpsPage({
  mounted,
  c,
  isMobile,
  appVersionLabel,
  supportEmail,
  launchFlags,
  softLaunchSummary,
  feedbackSentCount,
  copyToClipboard,
}) {
  const [checks, setChecks] = useState(loadChecks);
  const [notes, setNotes] = useState(loadNotes);
  const [editingNotes, setEditingNotes] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [releaseNotesEditing, setReleaseNotesEditing] = useState(false);
  const [releaseNotesDraft, setReleaseNotesDraft] = useState(() =>
    buildReleaseNotesDraft({ appVersionLabel, launchFlags })
  );
  const [feedbackCount, setFeedbackCount] = useState(feedbackSentCount);

  useEffect(() => {
    setFeedbackCount(feedbackSentCount);
  }, [feedbackSentCount]);

  const supportSnapshot = buildSupportSnapshot({
    appVersionLabel,
    supportEmail,
    launchFlags,
    softLaunchSummary,
    feedbackSentCount: feedbackCount,
  });

  const toggleCheck = (item) => {
    const next = { ...checks, [item]: !checks[item] };
    setChecks(next);
    saveChecks(next);
  };

  const resetChecks = () => {
    setChecks({});
    saveChecks({});
  };

  const doCopy = (text, label, key) => {
    copyToClipboard?.(text, `${label} copied`);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const checkedCount = NEXT_ACTIONS.filter((a) => checks[a]).length;

  const inp = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${c.border2}`,
    background: c.surf2,
    color: c.tx,
    fontSize: 13,
    fontFamily: "'DM Mono', monospace",
    outline: "none",
    boxSizing: "border-box",
    resize: "vertical",
  };

  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", display: "grid", gap: 14 }}>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${c.ac}16, ${c.surf} 34%, ${c.surf2} 82%, ${c.go}10)`, border: `1px solid ${c.border}`, borderRadius: 24, padding: isMobile ? "18px 18px" : "22px 24px", display: "grid", gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>Founder ops</div>
        <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900, color: c.tx }}>Keep launch management light</div>
        <div style={{ fontSize: 14, color: c.tx2, lineHeight: 1.6, maxWidth: 720 }}>
          This page keeps launch operations simple: what to review, how to triage, and what version is live right now.
        </div>

        {/* Editable release notes */}
        <div style={{ background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 12, padding: "12px 14px", marginTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>Release notes draft</div>
            <button
              type="button"
              onClick={() => setReleaseNotesEditing((v) => !v)}
              style={{ padding: "4px 10px", borderRadius: 999, border: `1px solid ${c.border2}`, background: "transparent", color: c.tx2, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              {releaseNotesEditing ? "Done" : "Edit"}
            </button>
          </div>
          {releaseNotesEditing ? (
            <textarea
              rows={8}
              style={inp}
              value={releaseNotesDraft}
              onChange={(e) => setReleaseNotesDraft(e.target.value)}
            />
          ) : (
            <pre style={{ margin: 0, fontSize: 12, color: c.tx2, whiteSpace: "pre-wrap", lineHeight: 1.6, fontFamily: "'DM Mono', monospace" }}>{releaseNotesDraft}</pre>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => doCopy(releaseNotesDraft, "Release notes", "release")}
            style={{ padding: "11px 16px", borderRadius: 999, border: "none", background: copiedKey === "release" ? c.go : c.ac, color: "#001014", fontSize: 13, fontWeight: 900, cursor: "pointer", transition: "background 0.2s" }}
          >
            {copiedKey === "release" ? "Copied!" : "Copy release notes"}
          </button>
          <button
            type="button"
            onClick={() => doCopy(supportSnapshot, "Support snapshot", "snapshot")}
            style={{ padding: "11px 16px", borderRadius: 999, border: `1px solid ${c.border2}`, background: copiedKey === "snapshot" ? `${c.go}20` : c.surf, color: copiedKey === "snapshot" ? c.go : c.tx, fontSize: 13, fontWeight: 800, cursor: "pointer", transition: "all 0.2s" }}
          >
            {copiedKey === "snapshot" ? "Copied!" : "Copy support snapshot"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>

        {/* Launch snapshot */}
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px", display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Launch snapshot</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c.tx }}>What is live right now</div>
          </div>
          {[
            { label: "Version", value: appVersionLabel, copyable: true, copyKey: "version" },
            { label: "Support", value: supportEmail, link: `mailto:${supportEmail}`, copyable: true, copyKey: "email" },
            { label: "Billing", value: launchFlags?.billingEnabled ? "Live" : "Off for testers", tone: launchFlags?.billingEnabled ? c.go : c.wa },
            { label: "Launch pulse", value: softLaunchSummary },
            { label: "Feedback from this device", value: String(feedbackCount), action: feedbackCount > 0 ? { label: "Reset", fn: () => { setFeedbackCount(0); try { const s = JSON.parse(localStorage.getItem("hb_founder_ops_v1") || "{}"); s.feedbackSentCount = 0; localStorage.setItem("hb_founder_ops_v1", JSON.stringify(s)); } catch { /* */ } } } : null },
          ].map(({ label, value, tone, copyable, copyKey, link, action }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${c.border}` }}>
              <span style={{ fontSize: 12, color: c.muted, fontWeight: 700 }}>{label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {link ? (
                  <a href={link} style={{ fontSize: 12, color: c.ac, fontWeight: 800, textDecoration: "none" }}>{value}</a>
                ) : (
                  <span style={{ fontSize: 12, color: tone || c.tx, fontWeight: 800, textAlign: "right" }}>{value}</span>
                )}
                {copyable && (
                  <button
                    type="button"
                    onClick={() => doCopy(value, label, copyKey)}
                    style={{ padding: "2px 7px", borderRadius: 6, border: `1px solid ${c.border2}`, background: "transparent", color: copiedKey === copyKey ? c.go : c.muted, fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                  >
                    {copiedKey === copyKey ? "✓" : "copy"}
                  </button>
                )}
                {action && (
                  <button
                    type="button"
                    onClick={action.fn}
                    style={{ padding: "2px 7px", borderRadius: 6, border: `1px solid ${c.da}40`, background: "transparent", color: c.da, fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                  >
                    {action.label}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Next checks checklist */}
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px", display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Next checks</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: c.tx }}>A simple founder loop</div>
            </div>
            {checkedCount > 0 && (
              <button
                type="button"
                onClick={resetChecks}
                style={{ padding: "5px 10px", borderRadius: 999, border: `1px solid ${c.border2}`, background: "transparent", color: c.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
              >
                Reset ({checkedCount}/{NEXT_ACTIONS.length})
              </button>
            )}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {NEXT_ACTIONS.map((item) => {
              const done = !!checks[item];
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleCheck(item)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 14, background: done ? `${c.go}14` : c.surf2, border: `1px solid ${done ? c.go + "55" : c.border}`, cursor: "pointer", textAlign: "left", width: "100%", transition: "all 0.15s" }}
                >
                  <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${done ? c.go : c.border2}`, background: done ? c.go : "transparent", color: "#fff", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                    {done ? "✓" : ""}
                  </div>
                  <div style={{ fontSize: 13, color: done ? c.muted : c.tx, textDecoration: done ? "line-through" : "none", transition: "all 0.15s" }}>{item}</div>
                </button>
              );
            })}
          </div>
          {checkedCount === NEXT_ACTIONS.length && (
            <div style={{ textAlign: "center", padding: "8px 12px", borderRadius: 10, background: `${c.go}14`, border: `1px solid ${c.go}40`, color: c.go, fontSize: 13, fontWeight: 800 }}>
              All done for this loop
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>

        {/* Triage guide */}
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px", display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Triage guide</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c.tx }}>Sort feedback fast</div>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {TRIAGE_GUIDE.map((item, i) => {
              const tones = [c.da, c.wa, c.muted];
              return (
                <div key={item.label} style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${tones[i] || c.border}30` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: tones[i] || c.border, flexShrink: 0 }} />
                    <div style={{ fontSize: 14, fontWeight: 900, color: tones[i] || c.tx }}>{item.label}</div>
                  </div>
                  <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.6 }}>{item.detail}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status flow + Founder notes */}
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px", display: "grid", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Status flow</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: c.tx }}>Keep issue status simple</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {STATUS_FLOW.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => doCopy(item, "Status", `status_${item}`)}
                  title="Click to copy"
                  style={{ padding: "9px 14px", borderRadius: 999, border: `1px solid ${copiedKey === `status_${item}` ? c.ac : c.border2}`, background: copiedKey === `status_${item}` ? `${c.ac}18` : c.surf2, color: copiedKey === `status_${item}` ? c.ac : c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer", transition: "all 0.15s" }}
                >
                  {item}
                </button>
              ))}
            </div>
            <div style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}`, fontSize: 13, color: c.tx2, lineHeight: 1.6 }}>
              Keep the workflow light: new → reviewing → planned → fixed → closed. Click any tag to copy the label.
            </div>
          </div>

          {/* Founder notes */}
          <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px", display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>Founder notes</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: c.tx }}>Quick scratch pad</div>
              </div>
              {notes && !editingNotes && (
                <button
                  type="button"
                  onClick={() => doCopy(notes, "Notes", "notes")}
                  style={{ padding: "5px 10px", borderRadius: 999, border: `1px solid ${c.border2}`, background: "transparent", color: copiedKey === "notes" ? c.go : c.muted, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                >
                  {copiedKey === "notes" ? "Copied!" : "Copy"}
                </button>
              )}
            </div>
            {editingNotes ? (
              <div style={{ display: "grid", gap: 8 }}>
                <textarea
                  rows={5}
                  autoFocus
                  style={inp}
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); saveNotes(e.target.value); }}
                  placeholder="Jot anything — decisions, questions, what to tackle next..."
                />
                <button
                  type="button"
                  onClick={() => setEditingNotes(false)}
                  style={{ padding: "9px", borderRadius: 8, border: "none", background: c.ac, color: "#001014", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  Done
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditingNotes(true)}
                style={{ width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 12, border: `1px dashed ${c.border2}`, background: c.surf2, color: notes ? c.tx : c.muted, fontSize: 13, cursor: "pointer", lineHeight: 1.6, fontFamily: "'DM Mono', monospace", minHeight: 80 }}
              >
                {notes || "Click to add notes..."}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
