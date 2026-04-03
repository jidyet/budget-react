import CreateHouseholdPage from "./CreateHouseholdPage";
import JoinHouseholdPage from "./JoinHouseholdPage";
import { LAUNCH_COPY } from "../config/launchCopy";

export default function HouseholdSetupPage(props) {
  const {
    palette,
    isMobile,
    tab,
    setTab,
    form,
    setForm,
    actionLoading,
    searchLoading,
    searchResults,
    lblStyle,
    inputStyle,
    selStyle,
    onCreate,
    onSearch,
    onClearSearchResults,
    onJoin,
    onContinueSolo,
    inviteLink,
    onCopyInvite,
    onShareInvite,
    onDone,
  } = props;
  const c = palette;

  // "invite" tab is auto-shown after household creation — don't show in the nav
  const navTabs = [
    ["choose", "Choose"],
    ["create", "Create household"],
    ["join", "Join household"],
    ["solo", "Continue solo"],
  ];

  return (
    <>
      {tab !== "invite" && (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {navTabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: `1px solid ${tab === id ? c.ac : c.border2}`,
              background: tab === id ? c.acD : c.surf2,
              color: tab === id ? c.ac : c.tx,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      )}

      {tab === "invite" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.tx, marginBottom: 6 }}>Household ready</div>
            <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.6 }}>
              Share this link or code with anyone you want to bring in. It stays active — come back to it any time from Settings.
            </div>
          </div>
          <div style={{ padding: "14px 16px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: c.muted, marginBottom: 6 }}>Share link</div>
            <div style={{ fontSize: 13, color: c.tx, wordBreak: "break-all", lineHeight: 1.5 }}>
              {inviteLink || "Link generating..."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onCopyInvite && onCopyInvite(inviteLink)}
              style={{ padding: "12px 16px", borderRadius: 12, border: "none", background: c.ac, color: "#001014", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={() => onShareInvite && onShareInvite(inviteLink)}
              style={{ padding: "12px 16px", borderRadius: 12, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 14, fontWeight: 800, cursor: "pointer" }}
            >
              Share
            </button>
            <button
              type="button"
              onClick={onDone}
              style={{ padding: "12px 16px", borderRadius: 12, border: `1px solid ${c.border2}`, background: c.surf, color: c.tx2, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {tab === "choose" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              background: c.surf2,
              border: `1px solid ${c.border}`,
              fontSize: 13,
              color: c.tx2,
              lineHeight: 1.6,
            }}
          >
            {LAUNCH_COPY.householdSetup.chooserNote}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            {[
              { id: "create", title: "Create household", desc: "Start a shared money journey from what you already have." },
              { id: "join", title: "Join household", desc: "Open the same shared progress space as your partner or family." },
              { id: "solo", title: "Continue solo", desc: "Keep your private flow and switch later when you are ready." },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                style={{
                  padding: "16px 14px",
                  borderRadius: 16,
                  border: `1px solid ${c.border}`,
                  background: c.surf2,
                  color: c.tx,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.6 }}>{item.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "create" && (
        <CreateHouseholdPage
          palette={c}
          isMobile={isMobile}
          form={form}
          setForm={setForm}
          loading={actionLoading}
          lblStyle={lblStyle}
          inputStyle={inputStyle}
          selStyle={selStyle}
          onCreate={onCreate}
        />
      )}

      {tab === "join" && (
        <JoinHouseholdPage
          palette={c}
          isMobile={isMobile}
          form={form}
          setForm={setForm}
          results={searchResults}
          searchLoading={searchLoading}
          actionLoading={actionLoading}
          inputStyle={inputStyle}
          onSearch={onSearch}
          onClearResults={onClearSearchResults}
          onJoin={onJoin}
        />
      )}

      {tab === "solo" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.6 }}>
            {LAUNCH_COPY.householdSetup.soloNote}
          </div>
          <button
            type="button"
            disabled={actionLoading}
            onClick={onContinueSolo}
            style={{
              padding: "13px 16px",
              borderRadius: 12,
              border: `1px solid ${c.border2}`,
              background: c.surf2,
              color: c.tx,
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              opacity: actionLoading ? 0.72 : 1,
            }}
          >
            {actionLoading ? "Saving..." : "Continue solo"}
          </button>
        </div>
      )}
    </>
  );
}
