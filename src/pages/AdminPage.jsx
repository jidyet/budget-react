import { useCallback, useEffect, useState } from "react";
import {
  adminDeleteUserFirestoreData,
  adminResetUserToSolo,
  adminSetUserAdminRole,
  fetchAdminConfig,
  subscribeAllUsers,
} from "../firebase";

const SETUP_STEPS = `To bootstrap admin access:
1. Open Firebase Console -> Firestore -> /config/admins
2. Create the document with field: uids (array) containing your UID
3. Reload this page`;

export default function AdminPage({ mounted, c, isMobile, user, showToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [actionUserId, setActionUserId] = useState("");
  const [adminConfig, setAdminConfig] = useState({ uids: [] });

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeAllUsers((docs) => {
      setUsers(docs);
      setLoading(false);
    });
    return unsub;
  }, []);

  const refreshAdminConfig = useCallback(() => {
    fetchAdminConfig().then((config) => setAdminConfig(config || { uids: [] }));
  }, []);

  useEffect(() => {
    refreshAdminConfig();
  }, [refreshAdminConfig]);

  const filtered = users.filter((entry) => {
    if (!query.trim()) return true;
    const needle = query.toLowerCase();
    return (
      String(entry.email || "").toLowerCase().includes(needle) ||
      String(entry.displayName || "").toLowerCase().includes(needle) ||
      String(entry.uid || "").toLowerCase().includes(needle)
    );
  });

  const adminUids = Array.isArray(adminConfig?.uids) ? adminConfig.uids.map(String) : [];
  const notSetup = adminUids.length === 0;

  const withBusy = async (uid, work) => {
    setActionUserId(uid);
    try {
      await work();
    } finally {
      setActionUserId("");
    }
  };

  const handleResetToSolo = useCallback(async (targetUser) => {
    if (!window.confirm(`Reset "${targetUser.email}" to solo and remove them from any household?`)) return;
    await withBusy(targetUser.uid, async () => {
      await adminResetUserToSolo(targetUser.uid);
      showToast(`${targetUser.email} reset to solo`);
    });
  }, [showToast]);

  const handleToggleAdmin = useCallback(async (targetUser, makeAdmin) => {
    const prompt = makeAdmin
      ? `Grant admin access to "${targetUser.email}"?`
      : `Remove admin access from "${targetUser.email}"?`;
    if (!window.confirm(prompt)) return;
    await withBusy(targetUser.uid, async () => {
      await adminSetUserAdminRole(targetUser.uid, makeAdmin);
      refreshAdminConfig();
      showToast(makeAdmin ? `${targetUser.email} is now an admin` : `${targetUser.email} removed from admins`);
    });
  }, [refreshAdminConfig, showToast]);

  const handleDeleteData = useCallback(async (targetUser) => {
    if (!window.confirm(`Delete all Firestore data for "${targetUser.email}"? This does not remove their Firebase Auth sign-in.`)) return;
    await withBusy(targetUser.uid, async () => {
      await adminDeleteUserFirestoreData(targetUser.uid);
      refreshAdminConfig();
      showToast(`${targetUser.email} Firestore data deleted`);
    });
  }, [refreshAdminConfig, showToast]);

  const card = {
    background: c.surf2,
    border: `1px solid ${c.border}`,
    borderRadius: 16,
    padding: isMobile ? "14px 16px" : "16px 20px",
  };

  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", display: "grid", gap: 14, maxWidth: 960, margin: "0 auto" }}>
      <div style={{ ...card, background: `linear-gradient(135deg, ${c.ac}16, ${c.surf} 34%, ${c.surf2} 82%)` }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>
          Admin
        </div>
        <div style={{ fontSize: isMobile ? 24 : 28, fontWeight: 900, color: c.tx, marginTop: 4 }}>
          User management
        </div>
        <div style={{ fontSize: 13, color: c.tx2, marginTop: 4 }}>
          {users.length} registered user{users.length !== 1 ? "s" : ""} · {adminUids.length} admin{adminUids.length !== 1 ? "s" : ""}
        </div>
      </div>

      {notSetup && (
        <div style={{ ...card, background: `${c.wa || "#f59e0b"}18`, border: `1px solid ${(c.wa || "#f59e0b")}55` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: c.tx, marginBottom: 6 }}>Admin list not configured</div>
          <pre style={{ fontSize: 12, color: c.tx2, whiteSpace: "pre-wrap", margin: 0 }}>{SETUP_STEPS}</pre>
          <div style={{ fontSize: 12, color: c.muted, marginTop: 8 }}>Your UID: <code style={{ userSelect: "all" }}>{user?.uid}</code></div>
        </div>
      )}

      <div style={{ ...card, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.6 }}>
          Admin tools can now reset workspace state, remove stale household membership, promote or demote admins, and delete a user&apos;s Firestore data.
        </div>
        <div style={{ fontSize: 11, color: c.muted }}>
          Note: deleting Firebase Auth sign-in accounts still requires an Admin SDK or backend function.
        </div>
      </div>

      <div style={{ ...card, padding: isMobile ? "10px 14px" : "10px 16px" }}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by email, name, or UID..."
          style={{
            width: "100%",
            border: "none",
            background: "transparent",
            color: c.tx,
            fontSize: 14,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: c.muted, padding: 40, fontSize: 14 }}>Loading users...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", color: c.muted, padding: 40, fontSize: 14 }}>
          {query ? "No users match that search." : "No registered users yet."}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {filtered.map((entry) => (
            <UserRow
              key={entry.uid}
              entry={entry}
              c={c}
              isMobile={isMobile}
              isSelf={String(entry.uid) === String(user?.uid || "")}
              isAdmin={adminUids.includes(String(entry.uid))}
              isBusy={actionUserId === entry.uid}
              onResetToSolo={handleResetToSolo}
              onToggleAdmin={handleToggleAdmin}
              onDeleteData={handleDeleteData}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserRow({ entry, c, isMobile, isSelf, isAdmin, isBusy, onResetToSolo, onToggleAdmin, onDeleteData }) {
  const isHousehold = entry.workspaceMode === "household";
  const lastSeen = entry.lastSeenAt?.toDate?.() || (entry.lastSeenAt?.seconds ? new Date(entry.lastSeenAt.seconds * 1000) : null);
  const lastSeenLabel = lastSeen ? lastSeen.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "-";

  return (
    <div
      style={{
        background: c.surf2,
        border: `1px solid ${c.border}`,
        borderRadius: 14,
        padding: isMobile ? "12px 14px" : "14px 18px",
        display: "flex",
        alignItems: isMobile ? "flex-start" : "center",
        gap: 12,
        flexDirection: isMobile ? "column" : "row",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: c.acD,
          color: c.ac,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {String(entry.displayName || entry.email || "?")[0].toUpperCase()}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: c.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {entry.displayName || entry.email || entry.uid}
          {isSelf && <span style={{ marginLeft: 6, fontSize: 11, color: c.ac, fontWeight: 700 }}>(you)</span>}
        </div>
        <div style={{ fontSize: 12, color: c.tx2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {entry.email || "No email"}
        </div>
        <div style={{ fontSize: 11, color: c.muted, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Pill background={isHousehold ? `${c.go}20` : `${c.ac}18`} color={isHousehold ? c.go : c.ac}>
            {isHousehold ? "household" : "solo"}
          </Pill>
          {isAdmin && (
            <Pill background={`${c.wa || "#f59e0b"}20`} color={c.wa || "#f59e0b"}>
              admin
            </Pill>
          )}
          {isHousehold && entry.activeHouseholdId && (
            <span style={{ color: c.muted }}>hh: {entry.activeHouseholdId.slice(0, 8)}...</span>
          )}
          <span>last seen {lastSeenLabel}</span>
        </div>
      </div>

      {!isSelf && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onResetToSolo(entry)}
            style={actionButton(c, isBusy)}
          >
            {isBusy ? "Working..." : "Reset to solo"}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onToggleAdmin(entry, !isAdmin)}
            style={actionButton(c, isBusy)}
          >
            {isAdmin ? "Remove admin" : "Make admin"}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onDeleteData(entry)}
            style={{
              ...actionButton(c, isBusy),
              border: `1px solid ${c.da || "#ef4444"}`,
              background: c.daD || "#fee2e2",
              color: c.da || "#ef4444",
              fontWeight: 700,
            }}
          >
            Delete data
          </button>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(entry.uid)}
            style={actionButton(c, false)}
            title="Copy UID"
          >
            UID
          </button>
        </div>
      )}
    </div>
  );
}

function Pill({ children, background, color }) {
  return (
    <span
      style={{
        padding: "2px 7px",
        borderRadius: 999,
        background,
        color,
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

function actionButton(c, isBusy) {
  return {
    padding: "7px 12px",
    borderRadius: 10,
    border: `1px solid ${c.border}`,
    background: c.surf,
    color: c.tx2,
    fontSize: 12,
    fontWeight: 600,
    cursor: isBusy ? "wait" : "pointer",
    opacity: isBusy ? 0.5 : 1,
  };
}
