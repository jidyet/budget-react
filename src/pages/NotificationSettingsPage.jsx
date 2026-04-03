import EmptyStateCard from "../components/ui/EmptyStateCard";
import LoadingState from "../components/ui/LoadingState";
import ProTag from "../components/billing/ProTag";

export default function NotificationSettingsPage({
  mounted,
  c,
  notifPermission,
  requestBillReminderPermission,
  reminderPreferences,
  preferencesLoading,
  patchReminderPreferences,
  pwaInstalled,
  subscription,
}) {
  const toggleStyle = (enabled) => ({
    width: 48,
    height: 28,
    borderRadius: 999,
    border: `1px solid ${enabled ? c.ac : c.border2}`,
    background: enabled ? c.ac : c.surf2,
    position: "relative",
    cursor: "pointer",
  });
  const knobStyle = (enabled) => ({
    position: "absolute",
    top: 3,
    left: enabled ? 24 : 3,
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: enabled ? "#001014" : c.surf,
  });

  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", display: "grid", gap: 12, maxWidth: 860 }}>
      <div style={{ background: `linear-gradient(135deg, ${c.ac}14, ${c.surf} 36%, ${c.surf2})`, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px 20px", display: "grid", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>Notifications</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: c.tx }}>
          Stay in sync
          <ProTag subscription={subscription} palette={c} />
        </div>
        <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.55, maxWidth: 620 }}>
          Keep reminders light and useful. Turn on only the nudges that help you keep going.
        </div>
      </div>

      {preferencesLoading ? (
        <LoadingState palette={c} label="Loading your reminder settings..." />
      ) : (
        <>
          <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 18, padding: "16px 18px", display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, color: c.tx }}>Permission</div>
                <div style={{ fontSize: 12, color: c.tx2, marginTop: 4 }}>
                  {notifPermission === "granted"
                    ? "Reminders are on."
                    : notifPermission === "denied"
                      ? "Notifications are blocked right now."
                      : notifPermission === "unsupported"
                        ? "This device does not support notifications."
                        : "Turn reminders on when you are ready."}
                </div>
              </div>
              {notifPermission !== "granted" && notifPermission !== "unsupported" && (
                <button type="button" onClick={requestBillReminderPermission} style={{ padding: "10px 14px", borderRadius: 12, border: "none", background: c.ac, color: "#001014", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                  Enable reminders
                </button>
              )}
            </div>
          </div>

          <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 18, padding: "16px 18px", display: "grid", gap: 10 }}>
            {[
              ["dueSoon", "Due soon", "A gentle nudge when something is close."],
              ["checkIn", "Check-in", "A simple prompt to come back and look."],
              ["milestones", "Milestones", "Short celebration when you hit a win."],
              ["householdUpdates", "Household updates", "Know when someone else moved things forward."],
              ["launchPrompts", "Launch notes", "Small welcome and return prompts during early launch."],
              ["reviewPrompts", "Feedback asks", "A quick feedback check after a good moment."],
            ].map(([key, title, detail]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${c.border}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: c.tx }}>{title}</div>
                  <div style={{ fontSize: 12, color: c.tx2 }}>{detail}</div>
                </div>
                <button type="button" onClick={() => patchReminderPreferences({ [key]: !reminderPreferences[key] })} style={toggleStyle(reminderPreferences[key])}>
                  <span style={knobStyle(reminderPreferences[key])} />
                </button>
              </div>
            ))}
            <div style={{ display: "grid", gap: 6, paddingTop: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: c.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Reminder pace</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["gentle", "weekly", "off"].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => patchReminderPreferences({ cadence: option })}
                    style={{
                      padding: "9px 12px",
                      borderRadius: 999,
                      border: `1px solid ${reminderPreferences.cadence === option ? c.ac : c.border2}`,
                      background: reminderPreferences.cadence === option ? `${c.ac}14` : c.surf2,
                      color: reminderPreferences.cadence === option ? c.ac : c.tx,
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {option === "gentle" ? "Gentle" : option === "weekly" ? "Weekly" : "Off"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {!pwaInstalled && (
            <EmptyStateCard
              palette={c}
              title="Add to home screen"
              message="Keep the app one tap away when you want a quick daily check-in."
            />
          )}
        </>
      )}
    </div>
  );
}
