import HouseholdSetupPage from "../../pages/HouseholdSetupPage";

export default function HouseholdSetupModal({
  open,
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
  onDismiss,
  inviteLink,
  onCopyInvite,
  onShareInvite,
}) {
  if (!open) return null;
  const c = palette;

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 620, background: "rgba(0,0,0,0.7)" }} />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 621,
          background: c.surf,
          borderRadius: 20,
          padding: isMobile ? "24px 18px" : "28px 30px",
          width: isMobile ? "94vw" : 640,
          maxHeight: "88vh",
          overflowY: "auto",
          boxShadow: "0 20px 80px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 6 }}>
              Household setup
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.tx }}>Choose your shared path</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={onContinueSolo}
              style={{ background: "none", border: "none", color: c.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "4px 8px", borderRadius: 6 }}
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={onDismiss}
              style={{ background: "none", border: "none", color: c.muted, fontSize: 24, cursor: "pointer", lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        </div>
        <HouseholdSetupPage
          palette={c}
          isMobile={isMobile}
          tab={tab}
          setTab={setTab}
          form={form}
          setForm={setForm}
          actionLoading={actionLoading}
          searchLoading={searchLoading}
          searchResults={searchResults}
          lblStyle={lblStyle}
          inputStyle={inputStyle}
          selStyle={selStyle}
          onCreate={onCreate}
          onSearch={onSearch}
          onClearSearchResults={onClearSearchResults}
          onJoin={onJoin}
          onContinueSolo={onContinueSolo}
          inviteLink={inviteLink}
          onCopyInvite={onCopyInvite}
          onShareInvite={onShareInvite}
          onDone={onDismiss}
        />
      </div>
    </>
  );
}
