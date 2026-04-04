import { initializeApp } from "firebase/app";
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from "firebase/auth";
import {
  getFirestore, collection, doc, setDoc, addDoc,
  getDocs, onSnapshot, getDoc, serverTimestamp, query, orderBy, limit as fsLimit, where, writeBatch, deleteDoc
} from "firebase/firestore";

const env = typeof import.meta !== "undefined" ? (import.meta.env || {}) : {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || env.FIREBASE_API_KEY || "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || env.FIREBASE_AUTH_DOMAIN || "",
  projectId: env.VITE_FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID || "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || env.FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || env.FIREBASE_MESSAGING_SENDER_ID || "",
  appId: env.VITE_FIREBASE_APP_ID || env.FIREBASE_APP_ID || "",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || env.FIREBASE_MEASUREMENT_ID || ""
};

const REQUIRED_FIREBASE_KEYS = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

const missingFirebaseKeys = REQUIRED_FIREBASE_KEYS.filter((k) => !firebaseConfig[k]);

if (!firebaseConfig.apiKey) {
  console.warn("Firebase apiKey is missing. Add VITE_FIREBASE_API_KEY to your .env or configure Firebase in src/firebase.js.");
} else if (firebaseConfig.apiKey && !firebaseConfig.authDomain) {
  console.warn("Firebase config looks incomplete - check VITE_FIREBASE_AUTH_DOMAIN and other VITE_FIREBASE_* vars.");
}

export const isFirebaseConfigured = () => {
  return missingFirebaseKeys.length === 0;
};

export const getFirebaseConfig = () => ({ ...firebaseConfig });

export const getFirebaseStatus = () => ({
  configured: isFirebaseConfigured(),
  missingKeys: [...missingFirebaseKeys],
  projectId: firebaseConfig.projectId || "",
  authDomain: firebaseConfig.authDomain || "",
});

let app = null;
export let db = null;
export let auth = null;

if (isFirebaseConfigured()) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
  } catch (e) {
    console.error("Firebase initialization failed:", e);
    app = null;
    db = null;
    auth = null;
  }
}

const firebaseNotReadyError = () => new Error("Firebase is not configured. Add VITE_FIREBASE_* values to .env.");
const SCHEMA_VERSION = 2;

const userRootRef = (uid) => doc(db, "users", String(uid));
const registryRef = () => collection(db, "registry");
const registryDocRef = (uid) => doc(db, "registry", String(uid));
const configAdminsRef = () => doc(db, "config", "admins");
const userMonthRef = (uid, monthKey) => doc(db, "users", String(uid), "months", String(monthKey));
const userMonthAccountsRef = (uid, monthKey) => collection(db, "users", String(uid), "months", String(monthKey), "accounts");
const userMonthAccountRef = (uid, monthKey, accountId) =>
  doc(db, "users", String(uid), "months", String(monthKey), "accounts", String(accountId));
const userMonthUploadsRef = (uid, monthKey) => collection(db, "users", String(uid), "months", String(monthKey), "uploads");
const userAppRef = (uid) => doc(db, "users", String(uid), "meta", "app");
const userInvitesRef = (uid) => collection(db, "users", String(uid), "invites");
const userInviteRef = (uid, householdId) => doc(db, "users", String(uid), "invites", String(householdId));
const householdsRef = () => collection(db, "households");
const householdDirectoryRef = () => collection(db, "householdDirectory");
const householdRootRef = (householdId) => doc(db, "households", String(householdId));
const householdDirectoryDocRef = (householdId) => doc(db, "householdDirectory", String(householdId));
const householdMembersRef = (householdId) => collection(db, "households", String(householdId), "members");
const householdMemberRef = (householdId, uid) => doc(db, "households", String(householdId), "members", String(uid));
const householdJoinRequestsRef = (householdId) => collection(db, "households", String(householdId), "joinRequests");
const householdJoinRequestRef = (householdId, uid) => doc(db, "households", String(householdId), "joinRequests", String(uid));
const householdMetaAppRef = (householdId) => doc(db, "households", String(householdId), "meta", "app");
const householdMonthRef = (householdId, monthKey) => doc(db, "households", String(householdId), "months", String(monthKey));
const householdMonthAccountsRef = (householdId, monthKey) => collection(db, "households", String(householdId), "months", String(monthKey), "accounts");
const householdMonthAccountRef = (householdId, monthKey, accountId) =>
  doc(db, "households", String(householdId), "months", String(monthKey), "accounts", String(accountId));
const householdMonthUploadsRef = (householdId, monthKey) => collection(db, "households", String(householdId), "months", String(monthKey), "uploads");
const householdPlansRef = (householdId) => collection(db, "households", String(householdId), "payoff_plans");
const householdPlanRef = (householdId, planId) => doc(db, "households", String(householdId), "payoff_plans", String(planId));
const householdActivityRef = (householdId) => collection(db, "households", String(householdId), "activity");
const householdDashboardRef = (householdId, monthKey) => doc(db, "households", String(householdId), "dashboard", String(monthKey));

const makeJoinCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const AVATAR_COLORS = ["#14b8a6", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#22c55e"];
const pickAvatarColor = (seed = "") => {
  const raw = String(seed || "");
  const hash = raw.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};
const resolveIdentity = (person = {}) => {
  const email = String(person?.email || "").trim();
  const displayName = String(person?.displayName || person?.label || "").trim() || (email ? email.split("@")[0] : "Member");
  return {
    email,
    displayName,
    label: displayName,
    photoURL: String(person?.photoURL || "").trim(),
    avatarColor: String(person?.avatarColor || "").trim() || pickAvatarColor(person?.uid || email || displayName),
  };
};
const sanitizeForFirestore = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeForFirestore(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, nestedValue]) => [key, sanitizeForFirestore(nestedValue)])
        .filter(([, nestedValue]) => nestedValue !== undefined)
    );
  }
  return value;
};
const normalizeHouseholdDirectory = (householdId, data = {}) => ({
  householdId: String(householdId),
  name: String(data.name || "Shared Household").trim(),
  nameLower: String(data.name || "").trim().toLowerCase(),
  description: String(data.description || "").trim(),
  joinCode: String(data.joinCode || "").toUpperCase(),
  joinMode: data.joinMode === "approval" ? "approval" : "open",
  ownerId: String(data.ownerId || ""),
  memberCount: Number(data.memberCount || 0),
  active: data.active !== false,
  updatedAt: serverTimestamp(),
});

export const ensureHouseholdDirectoryEntry = async (householdId, overrideData = null) => {
  if (!db || !householdId) return null;
  const payloadSource = overrideData || (await getDoc(householdRootRef(householdId))).data?.() || null;
  if (!payloadSource) return null;
  const normalized = normalizeHouseholdDirectory(householdId, payloadSource);
  await setDoc(householdDirectoryDocRef(householdId), normalized, { merge: true });
  return normalized;
};

const getActorLabel = (scope) => scope?.actorName || scope?.actorEmail || "Unknown member";
const workspaceHasHousehold = (scope) => !!scope?.householdId;
const workspaceSettingsRef = (uid, scope) => workspaceHasHousehold(scope) ? householdMetaAppRef(scope.householdId) : userAppRef(uid);
const workspaceMonthRef = (uid, monthKey, scope) => workspaceHasHousehold(scope) ? householdMonthRef(scope.householdId, monthKey) : userMonthRef(uid, monthKey);
const workspaceAccountsRef = (uid, monthKey, scope) => workspaceHasHousehold(scope) ? householdMonthAccountsRef(scope.householdId, monthKey) : userMonthAccountsRef(uid, monthKey);
const workspaceAccountRef = (uid, monthKey, accountId, scope) => workspaceHasHousehold(scope) ? householdMonthAccountRef(scope.householdId, monthKey, accountId) : userMonthAccountRef(uid, monthKey, accountId);
const workspaceUploadsRef = (uid, monthKey, scope) => workspaceHasHousehold(scope) ? householdMonthUploadsRef(scope.householdId, monthKey) : userMonthUploadsRef(uid, monthKey);
const workspacePlansRef = (uid, scope) => workspaceHasHousehold(scope) ? householdPlansRef(scope.householdId) : collection(db, "users", String(uid), "payoff_plans");
const workspacePlanRef = (uid, planId, scope) => workspaceHasHousehold(scope) ? householdPlanRef(scope.householdId, planId) : doc(db, "users", String(uid), "payoff_plans", String(planId));

const parseHouseholdSearchInput = (term) => {
  const rawInput = String(term || "").trim();
  if (!rawInput) return { raw: "", normalized: "", joinCode: "", householdId: "" };
  const normalized = decodeURIComponent(rawInput).replace(/\s+/g, "");
  const tryParseUrl = (value) => {
    if (!value) return null;
    try {
      return new URL(value);
    } catch {
      return null;
    }
  };
  const url = tryParseUrl(normalized)
    || (normalized.includes("tracktozero.app") ? tryParseUrl(`https://${normalized.replace(/^https?:\/\//i, "")}`) : null);
  if (url) {
    const urlJoinCode = url.searchParams.get("joinCode") || url.searchParams.get("join");
    const urlHouseholdId = url.searchParams.get("household") || url.searchParams.get("householdId") || url.searchParams.get("hid");
    const hashParams = new URLSearchParams(String(url.hash || "").replace(/^#/, ""));
    const hashJoinCode = hashParams.get("joinCode") || hashParams.get("join");
    const hashHouseholdId = hashParams.get("household") || hashParams.get("householdId") || hashParams.get("hid");
    return {
      raw: rawInput,
      normalized,
      joinCode: String(urlJoinCode || hashJoinCode || "").trim().toUpperCase(),
      householdId: String(urlHouseholdId || hashHouseholdId || "").trim(),
    };
  }
  const joinCodeMatch = normalized.match(/(?:[#?&]|^)(?:joinCode|join|code)[:=\s-]*([A-Z0-9]{4,12})/i)
    || normalized.match(/(?:joinCode=|join=|code[:=\s-]*)([A-Z0-9]{4,12})/i);
  const householdIdMatch = normalized.match(/(?:[#?&]|^)(?:householdId|household|hid)[:=\s-]*([A-Za-z0-9_-]{8,40})/i)
    || normalized.match(/(?:householdId=|household=|hid=|household[:=\s-]*)([A-Za-z0-9_-]{8,40})/i);
  const standaloneJoinCode = !joinCodeMatch && /^[A-Z0-9]{4,12}$/i.test(normalized) ? normalized.toUpperCase() : "";
  const standaloneHouseholdId = !householdIdMatch && !standaloneJoinCode && /^[A-Za-z0-9_-]{8,40}$/i.test(normalized) ? normalized : "";
  return {
    raw: rawInput,
    normalized,
    joinCode: standaloneJoinCode || (joinCodeMatch?.[1] ? joinCodeMatch[1].toUpperCase() : ""),
    householdId: standaloneHouseholdId || (householdIdMatch?.[1] ? householdIdMatch[1].trim() : ""),
  };
};

const touchUserAndMonth = async (uid, monthKey) => {
  if (!db) return;
  await Promise.all([
    setDoc(
      userRootRef(uid),
      {
        schemaVersion: SCHEMA_VERSION,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ),
    setDoc(
      userMonthRef(uid, monthKey),
      {
        schemaVersion: SCHEMA_VERSION,
        monthKey: String(monthKey),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ),
  ]);
};

const touchHouseholdAndMonth = async (scope, monthKey = "") => {
  if (!db || !scope?.householdId) return;
  const payloads = [
    setDoc(
      householdRootRef(scope.householdId),
      {
        schemaVersion: SCHEMA_VERSION,
        updatedAt: serverTimestamp(),
        updatedBy: scope?.actorUid || "",
        updatedByLabel: getActorLabel(scope),
      },
      { merge: true }
    ),
  ];
  if (monthKey) {
    payloads.push(
      setDoc(
        householdMonthRef(scope.householdId, monthKey),
        {
          schemaVersion: SCHEMA_VERSION,
          monthKey: String(monthKey),
          updatedAt: serverTimestamp(),
          updatedBy: scope?.actorUid || "",
          updatedByLabel: getActorLabel(scope),
        },
        { merge: true }
      )
    );
  }
  await Promise.all(payloads);
};

const touchWorkspaceAndMonth = async (uid, monthKey, scope = null) => {
  if (workspaceHasHousehold(scope)) {
    await touchHouseholdAndMonth(scope, monthKey);
    return;
  }
  await touchUserAndMonth(uid, monthKey);
};

const addHouseholdActivity = async (scope, type, payload = {}) => {
  if (!db || !scope?.householdId) return;
  try {
    await addDoc(householdActivityRef(scope.householdId), {
      type,
      ...payload,
      actorUid: scope?.actorUid || "",
      actorEmail: scope?.actorEmail || "",
      actorLabel: getActorLabel(scope),
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("addHouseholdActivity error:", e);
  }
};

export const signup = (email, password) => {
  if (!auth) return Promise.reject(firebaseNotReadyError());
  return createUserWithEmailAndPassword(auth, email, password);
};

export const login = (email, password) => {
  if (!auth) return Promise.reject(firebaseNotReadyError());
  return signInWithEmailAndPassword(auth, email, password);
};

export const logout = () => {
  if (!auth) return Promise.resolve();
  return signOut(auth);
};

export const requestPasswordReset = async (email) => {
  if (!auth) throw firebaseNotReadyError();
  const nextEmail = String(email || "").trim();
  if (!nextEmail) throw new Error("Enter your email address first.");
  await sendPasswordResetEmail(auth, nextEmail);
  return true;
};

export const updateCurrentUserPassword = async (currentPassword, nextPassword) => {
  if (!auth?.currentUser) throw new Error("You need to sign in again before updating your password.");
  const email = String(auth.currentUser.email || "").trim();
  const current = String(currentPassword || "");
  const next = String(nextPassword || "");
  if (!email) throw new Error("This account does not have an email/password login.");
  if (!current) throw new Error("Enter your current password.");
  if (!next || next.length < 6) throw new Error("Use a new password with at least 6 characters.");

  const credential = EmailAuthProvider.credential(email, current);
  await reauthenticateWithCredential(auth.currentUser, credential);
  await updatePassword(auth.currentUser, next);
  return true;
};

export const onAuth = (cb) => {
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
};

export const getMonthKey = (month, year) =>
  `${year}-${String(month).padStart(2, "0")}`;

export const subscribeUserWorkspace = (uid, callback) => {
  if (!db) {
    callback({});
    return () => {};
  }
  return onSnapshot(
    userAppRef(uid),
    (snap) => callback(snap.exists() ? snap.data() : {}),
    (err) => {
      console.error("subscribeUserWorkspace error:", err);
      callback({});
    }
  );
};

export const subscribeUserProfile = (uid, callback) => {
  if (!db || !uid) {
    callback({});
    return () => {};
  }
  return onSnapshot(
    userRootRef(uid),
    (snap) => callback(snap.exists() ? snap.data() : {}),
    (err) => {
      console.error("subscribeUserProfile error:", err);
      callback({});
    }
  );
};

export const subscribeHouseholdInvites = (uid, callback) => {
  if (!db || !uid) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    userInvitesRef(uid),
    (snap) => {
      const invites = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aTime = a?.updatedAt?.toMillis ? a.updatedAt.toMillis() : new Date(a?.updatedAt || 0).getTime();
          const bTime = b?.updatedAt?.toMillis ? b.updatedAt.toMillis() : new Date(b?.updatedAt || 0).getTime();
          return bTime - aTime;
        });
      callback(invites);
    },
    (err) => {
      console.error("subscribeHouseholdInvites error:", err);
      callback([]);
    }
  );
};

export const subscribeHouseholdForUser = (uid, callback) => {
  if (!db) {
    callback({ activeHousehold: null, memberships: [] });
    return () => {};
  }
  const safeUid = String(uid || "");
  const q = query(householdsRef(), where("memberIds", "array-contains", String(uid)));
  return onSnapshot(
    q,
    async (snap) => {
      const rootMemberships = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const memberships = (await Promise.all(
        rootMemberships.map(async (item) => {
          try {
            const memberSnap = await getDoc(householdMemberRef(item.id, safeUid));
            if (!memberSnap.exists() || memberSnap.data()?.status !== "active") {
              return null;
            }
            const directorySnap = await getDoc(householdDirectoryDocRef(item.id));
            if (!directorySnap.exists()) {
              if (item?.joinCode || item?.name) {
                try {
                  await setDoc(
                    householdDirectoryDocRef(item.id),
                    normalizeHouseholdDirectory(item.id, item),
                    { merge: true }
                  );
                } catch (writeError) {
                  console.error("subscribeHouseholdForUser directory backfill error:", writeError);
                }
              }
              // Stamp active:true on old household roots that predate the field —
              // required for the non-member list query fallback in searchHouseholds.
              if (item.active !== true) {
                setDoc(householdRootRef(item.id), { active: true, updatedAt: serverTimestamp() }, { merge: true })
                  .catch(() => {});
              }
              return item;
            }
            const directoryData = directorySnap.data() || {};
            return {
              ...item,
              ...directoryData,
              id: item.id,
              householdId: item.id,
              joinCode: directoryData.joinCode || item.joinCode || "",
              name: directoryData.name || item.name || "",
              nameLower: directoryData.nameLower || item.nameLower || String(directoryData.name || item.name || "").trim().toLowerCase(),
              description: directoryData.description || item.description || "",
              joinMode: directoryData.joinMode || item.joinMode || "open",
              ownerEmail: directoryData.ownerEmail || item.ownerEmail || "",
            };
          } catch (error) {
            console.error("subscribeHouseholdForUser directory merge error:", error);
            return null;
          }
        })
      )).filter(Boolean);
      callback({
        activeHousehold: memberships.find((item) => item.active !== false) || null,
        memberships,
      });
    },
    (err) => {
      console.error("subscribeHouseholdForUser error:", err);
      callback({ activeHousehold: null, memberships: [] });
    }
  );
};

export const fetchHouseholdById = async (householdId) => {
  if (!db || !householdId) return null;
  try {
    const snap = await getDoc(householdRootRef(String(householdId)));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (e) {
    console.error("fetchHouseholdById error:", e);
    return null;
  }
};

export const subscribeHouseholdMembers = (householdId, callback) => {
  if (!db || !householdId) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    householdMembersRef(householdId),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error("subscribeHouseholdMembers error:", err);
      callback([]);
    }
  );
};

export const fetchHouseholdMembership = async (householdId, uid) => {
  if (!db || !householdId || !uid) return null;
  try {
    const snap = await getDoc(householdMemberRef(String(householdId), String(uid)));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (error) {
    console.error("fetchHouseholdMembership error:", error);
    return null;
  }
};

export const subscribeJoinRequests = (householdId, callback) => {
  if (!db || !householdId) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    householdJoinRequestsRef(householdId),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error("subscribeJoinRequests error:", err);
      callback([]);
    }
  );
};

export const searchHouseholds = async (term) => {
  if (!db) return [];
  const parsed = parseHouseholdSearchInput(term);
  const raw = parsed.joinCode || parsed.normalized || parsed.raw;
  if (!raw && !parsed.householdId) return [];
  try {
    const dedupeMatches = (items = []) => {
      const seen = new Set();
      return items.filter((item) => {
        const id = String(item?.id || item?.householdId || "").trim();
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    };
    const hydrateHousehold = async (seed = {}) => {
      const id = String(seed.id || seed.householdId || "").trim();
      if (!id) return null;
      const [directorySnap, rootSnap] = await Promise.all([
        getDoc(householdDirectoryDocRef(id)).catch(() => null),
        getDoc(householdRootRef(id)).catch(() => null),
      ]);
      const directoryData = directorySnap?.exists?.() ? directorySnap.data() : {};
      const rootData = rootSnap?.exists?.() ? rootSnap.data() : {};
      if (rootSnap?.exists?.() && !directorySnap?.exists?.()) {
        await Promise.allSettled([ensureHouseholdDirectoryEntry(id, { id, householdId: id, ...rootData })]);
      }
      return {
        id,
        householdId: id,
        ...rootData,
        ...directoryData,
        ...seed,
        name: String(seed.name || directoryData.name || rootData.name || "").trim(),
        description: String(seed.description || directoryData.description || rootData.description || "").trim(),
        joinCode: String(seed.joinCode || directoryData.joinCode || rootData.joinCode || "").trim().toUpperCase(),
        joinMode: String(seed.joinMode || directoryData.joinMode || rootData.joinMode || "approval"),
        memberIds: Array.isArray(seed.memberIds) ? seed.memberIds : (rootData.memberIds || []),
        memberCount: Number(seed.memberCount ?? rootData.memberCount ?? directoryData.memberCount ?? 0),
        active: seed.active ?? directoryData.active ?? rootData.active ?? true,
      };
    };

    if (parsed.householdId) {
      const match = await hydrateHousehold({ id: parsed.householdId, householdId: parsed.householdId });
      if (match?.name || match?.joinCode) return [match];
    }
    if (parsed.joinCode) {
      const byCode = await getDocs(query(householdDirectoryRef(), where("joinCode", "==", parsed.joinCode), fsLimit(10)));
      if (!byCode.empty) {
        const matches = (await Promise.all(
          byCode.docs.map((d) => hydrateHousehold({ id: d.id, ...d.data() }))
        )).filter(Boolean);
        if (matches.length) return matches;
      }
      try {
        const rootByCode = await getDocs(query(householdsRef(), where("joinCode", "==", parsed.joinCode), fsLimit(10)));
        if (!rootByCode.empty) {
          const matches = (await Promise.all(
            rootByCode.docs.map((d) => hydrateHousehold({ id: d.id, householdId: d.id, ...d.data() }))
          )).filter(Boolean);
          return matches;
        }
      } catch {
      // Non-members cannot query /households — fall through to name search
    }
      const directoryScan = await getDocs(query(householdDirectoryRef(), orderBy("nameLower"), fsLimit(100)));
      const scannedMatches = (await Promise.all(
        directoryScan.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((item) => {
            const itemJoinCode = String(item.joinCode || "").trim().toUpperCase();
            const itemId = String(item.id || item.householdId || "").trim();
            return itemJoinCode === parsed.joinCode || (parsed.householdId && itemId === parsed.householdId);
          })
          .map((item) => hydrateHousehold(item))
      )).filter(Boolean);
      if (scannedMatches.length) return scannedMatches;
    }
    if (!raw) return [];
    const needle = raw.toLowerCase();
    const prefixNeedle = needle.replace(/[^a-z0-9\s-]/gi, "").trim();
    const matchBuckets = [];

    if (prefixNeedle) {
      try {
        const prefixSnap = await getDocs(
          query(
            householdDirectoryRef(),
            orderBy("nameLower"),
            where("nameLower", ">=", prefixNeedle),
            where("nameLower", "<=", `${prefixNeedle}\uf8ff`),
            fsLimit(25)
          )
        );
        matchBuckets.push(
          ...(await Promise.all(prefixSnap.docs.map((d) => hydrateHousehold({ id: d.id, ...d.data() })))).filter(Boolean)
        );
      } catch (prefixError) {
        console.error("searchHouseholds prefix query error:", prefixError);
      }
    }

    const snap = await getDocs(query(householdDirectoryRef(), orderBy("nameLower"), fsLimit(200)));
    matchBuckets.push(
      ...(await Promise.all(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((item) => {
            const name = String(item.name || "").toLowerCase();
            const description = String(item.description || "").toLowerCase();
            const joinCode = String(item.joinCode || "").toLowerCase();
            return name.includes(needle) || description.includes(needle) || joinCode === needle;
          })
          .map((item) => hydrateHousehold(item))
      )).filter(Boolean)
    );

    const directoryMatches = dedupeMatches(matchBuckets);
    if (directoryMatches.length) return directoryMatches;

    // Fallback: search directly against active household roots so join-by-code/link
    // still works even if the directory mirror is missing or stale.
    // Note: activeByCode needs a composite index (active, joinCode) — keep it in its
    // own try-catch so a missing-index error doesn't kill the broader activeRoots scan.
    const activeRootMatches = [];
    if (parsed.joinCode) {
      try {
        const activeByCode = await getDocs(
          query(
            householdsRef(),
            where("active", "==", true),
            where("joinCode", "==", parsed.joinCode),
            fsLimit(25)
          )
        );
        activeRootMatches.push(
          ...(await Promise.all(
            activeByCode.docs.map((d) => hydrateHousehold({ id: d.id, householdId: d.id, ...d.data() }))
          )).filter(Boolean)
        );
      } catch {
        // Composite index may not exist yet — fall through to full active-roots scan
      }
    }
    try {
      const activeRoots = await getDocs(query(householdsRef(), where("active", "==", true), fsLimit(200)));
      activeRootMatches.push(
        ...(await Promise.all(
          activeRoots.docs
            .map((d) => ({ id: d.id, householdId: d.id, ...d.data() }))
            .filter((item) => {
              const itemId = String(item.id || item.householdId || "").trim();
              const name = String(item.name || "").toLowerCase();
              const description = String(item.description || "").toLowerCase();
              const joinCode = String(item.joinCode || "").trim().toUpperCase();
              return (
                (parsed.householdId && itemId === parsed.householdId)
                || (parsed.joinCode && joinCode === parsed.joinCode)
                || name.includes(needle)
                || description.includes(needle)
              );
            })
            .map((item) => hydrateHousehold(item))
        )).filter(Boolean)
      );
    } catch (rootSearchError) {
      console.error("searchHouseholds active root fallback error:", rootSearchError);
    }

    const rootMatches = dedupeMatches(activeRootMatches);
    if (rootMatches.length) return rootMatches;
    return [];
  } catch (e) {
    console.error("searchHouseholds error:", e);
    return [];
  }
};

export const createHousehold = async (owner, household, seed = null) => {
  if (!db) throw firebaseNotReadyError();
  const ownerId = String(owner?.uid || "");
  const ownerIdentity = resolveIdentity(owner);
  const ownerEmail = ownerIdentity.email;
  const ownerLabel = ownerIdentity.displayName || "Owner";
  const payload = {
    name: String(household?.name || "My Household").trim(),
    description: String(household?.description || "").trim(),
    joinMode: household?.joinMode === "approval" ? "approval" : "open",
    joinCode: makeJoinCode(),
    ownerId,
    ownerEmail,
    memberIds: [ownerId],
    memberCount: 1,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: ownerId,
    updatedByLabel: ownerLabel,
    dailyMessage: "You're doing this together",
  };
  const ref = await addDoc(householdsRef(), payload);
  const householdId = ref.id;
  await ensureHouseholdDirectoryEntry(householdId, payload);
  await Promise.all([
    setDoc(householdMemberRef(householdId, ownerId), {
      uid: ownerId,
      email: ownerEmail,
      label: ownerLabel,
      displayName: ownerLabel,
      photoURL: ownerIdentity.photoURL,
      avatarColor: ownerIdentity.avatarColor,
      role: "owner",
      status: "active",
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    setDoc(userAppRef(ownerId), {
      activeHouseholdId: householdId,
      householdSetupDone: true,
      workspaceMode: "household",
      updatedAt: serverTimestamp(),
    }, { merge: true }),
    setDoc(userRootRef(ownerId), {
      displayName: ownerLabel,
      photoURL: ownerIdentity.photoURL,
      avatarColor: ownerIdentity.avatarColor,
      updatedAt: serverTimestamp(),
    }, { merge: true }),
  ]);

  if (seed) {
    const batch = writeBatch(db);
    if (seed.settings) {
      batch.set(householdMetaAppRef(householdId), {
        ...sanitizeForFirestore(seed.settings),
        schemaVersion: SCHEMA_VERSION,
        updatedAt: serverTimestamp(),
        updatedBy: ownerId,
        updatedByLabel: ownerLabel,
      }, { merge: true });
    }
    Object.entries(seed.records || {}).forEach(([monthKey, records]) => {
      batch.set(householdMonthRef(householdId, monthKey), {
        schemaVersion: SCHEMA_VERSION,
        monthKey,
        updatedAt: serverTimestamp(),
        updatedBy: ownerId,
        updatedByLabel: ownerLabel,
      }, { merge: true });
      Object.entries(records || {}).forEach(([accountId, data]) => {
        batch.set(householdMonthAccountRef(householdId, monthKey, accountId), {
          ...sanitizeForFirestore(data),
          schemaVersion: SCHEMA_VERSION,
          updatedAt: serverTimestamp(),
          updatedBy: ownerId,
          updatedByLabel: ownerLabel,
        }, { merge: true });
      });
    });
    Object.entries(seed.income || {}).forEach(([monthKey, incomeData]) => {
      batch.set(householdMonthRef(householdId, monthKey), {
        entries: sanitizeForFirestore(Array.isArray(incomeData?.entries) ? incomeData.entries : []),
        receipts: sanitizeForFirestore(incomeData?.receipts && typeof incomeData.receipts === "object" ? incomeData.receipts : {}),
        schemaVersion: SCHEMA_VERSION,
        updatedAt: serverTimestamp(),
        updatedBy: ownerId,
        updatedByLabel: ownerLabel,
      }, { merge: true });
    });
    (seed.plans || []).forEach((plan) => {
      const planDoc = doc(householdPlansRef(householdId));
      batch.set(planDoc, {
        ...sanitizeForFirestore(plan),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: ownerId,
        updatedByLabel: ownerLabel,
      }, { merge: true });
    });
    await batch.commit();
  }

  await addHouseholdActivity(
    { householdId, actorUid: ownerId, actorEmail: ownerEmail, actorName: ownerLabel },
    "household.created",
    { householdName: payload.name, joinMode: payload.joinMode }
  );
  return { id: householdId, ...payload };
};

export const continueSoloWorkspace = async (uid) => {
  if (!db) throw firebaseNotReadyError();
  await setDoc(userAppRef(uid), {
    householdSetupDone: true,
    workspaceMode: "solo",
    updatedAt: serverTimestamp(),
  }, { merge: true });
};

export const requestJoinHousehold = async (user, household) => {
  if (!db) throw firebaseNotReadyError();
  const uid = String(user?.uid || "");
  const identity = resolveIdentity(user);
  const email = identity.email;
  const label = identity.displayName || "Member";
  const house = typeof household === "string" ? { id: household } : household;
  if (!house?.id) throw new Error("Household not found");
  const pendingInviteSnap = await getDoc(userInviteRef(uid, house.id));
  if (pendingInviteSnap.exists() && String(pendingInviteSnap.data()?.status || "").toLowerCase() === "pending") {
    return acceptHouseholdInvite(user, house.id);
  }
  if (house.joinMode === "open") {
    await ensureHouseholdDirectoryEntry(house.id, house);
    await Promise.all([
      setDoc(householdMemberRef(house.id, uid), {
        uid,
        email,
        label,
        displayName: label,
        photoURL: identity.photoURL,
        avatarColor: identity.avatarColor,
        role: "member",
        status: "active",
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true }),
      setDoc(householdRootRef(house.id), {
        memberIds: [...new Set([...(house.memberIds || []), uid])],
        memberCount: Number(house.memberCount || 0) + 1,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        updatedByLabel: label,
      }, { merge: true }),
      setDoc(userAppRef(uid), {
        activeHouseholdId: house.id,
        householdSetupDone: true,
        workspaceMode: "household",
        updatedAt: serverTimestamp(),
      }, { merge: true }),
      setDoc(userRootRef(uid), {
        displayName: label,
        photoURL: identity.photoURL,
        avatarColor: identity.avatarColor,
        updatedAt: serverTimestamp(),
      }, { merge: true }),
    ]);
    await addHouseholdActivity({ householdId: house.id, actorUid: uid, actorEmail: email, actorName: label }, "member.joined", {});
    return { status: "joined" };
  }
  // Re-requests are common after a member is removed and tries to join again.
  // If an old request doc is still around, a plain setDoc turns into an update
  // and the current rules reject it for non-admins.
  const priorSnap = await getDoc(householdJoinRequestRef(house.id, uid));
  if (priorSnap.exists()) {
    const priorStatus = String(priorSnap.data()?.status || "").trim().toLowerCase();
    if (priorStatus === "pending") {
      return { status: "requested" };
    }
    await deleteDoc(householdJoinRequestRef(house.id, uid));
  }
  await setDoc(householdJoinRequestRef(house.id, uid), {
    uid,
    email,
    label,
    displayName: label,
    photoURL: identity.photoURL,
    avatarColor: identity.avatarColor,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await addHouseholdActivity({ householdId: house.id, actorUid: uid, actorEmail: email, actorName: label }, "join.requested", {});
  return { status: "requested" };
};

export const inviteUserToHousehold = async (householdId, targetUid, actor) => {
  if (!db) throw firebaseNotReadyError();
  const safeHouseholdId = String(householdId || "").trim();
  const safeTargetUid = String(targetUid || "").trim();
  if (!safeHouseholdId || !safeTargetUid) throw new Error("Household and user ID are required.");
  if (String(actor?.uid || "") === safeTargetUid) throw new Error("Use the share link if you want to invite yourself.");

  const [householdSnap, memberSnap] = await Promise.all([
    getDoc(householdRootRef(safeHouseholdId)),
    getDoc(householdMemberRef(safeHouseholdId, safeTargetUid)),
  ]);
  if (!householdSnap.exists()) throw new Error("Household not found.");
  if (memberSnap.exists() && memberSnap.data()?.status === "active") {
    throw new Error("That user is already part of this household.");
  }

  const household = householdSnap.data() || {};
  await ensureHouseholdDirectoryEntry(safeHouseholdId, household);
  await setDoc(userInviteRef(safeTargetUid, safeHouseholdId), {
    householdId: safeHouseholdId,
    householdName: String(household.name || "Shared home"),
    householdDescription: String(household.description || ""),
    joinCode: String(household.joinCode || ""),
    joinMode: String(household.joinMode || "approval"),
    invitedByUid: String(actor?.uid || ""),
    invitedByEmail: String(actor?.email || ""),
    invitedByName: String(actor?.displayName || actor?.email || "Admin"),
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await addHouseholdActivity(
    { householdId: safeHouseholdId, actorUid: actor?.uid || "", actorEmail: actor?.email || "", actorName: actor?.displayName || actor?.email || "Admin" },
    "member.invited",
    { targetUid: safeTargetUid }
  );
  return true;
};

export const acceptHouseholdInvite = async (user, householdId) => {
  if (!db) throw firebaseNotReadyError();
  const uid = String(user?.uid || "");
  const safeHouseholdId = String(householdId || "").trim();
  if (!uid || !safeHouseholdId) throw new Error("Invite is missing its household.");

  const inviteSnap = await getDoc(userInviteRef(uid, safeHouseholdId));
  if (!inviteSnap.exists()) throw new Error("Invite not found.");
  const householdSnap = await getDoc(householdRootRef(safeHouseholdId));
  if (!householdSnap.exists()) throw new Error("Household no longer exists.");

  const household = { id: householdSnap.id, ...householdSnap.data() };
  const existingMemberSnap = await getDoc(householdMemberRef(safeHouseholdId, uid));
  if (existingMemberSnap.exists() && existingMemberSnap.data()?.status === "active") {
    await Promise.all([
      setDoc(userAppRef(uid), {
        activeHouseholdId: safeHouseholdId,
        householdSetupDone: true,
        workspaceMode: "household",
        pendingHouseholdId: "",
        pendingHouseholdName: "",
        updatedAt: serverTimestamp(),
      }, { merge: true }),
      deleteDoc(userInviteRef(uid, safeHouseholdId)),
    ]);
    return { status: "joined", household };
  }

  const identity = resolveIdentity(user);
  const label = identity.displayName || "Member";
  const nextMemberIds = Array.from(new Set([...(household.memberIds || []), uid]));
  const batch = writeBatch(db);
  batch.set(householdMemberRef(safeHouseholdId, uid), {
    uid,
    email: identity.email,
    label,
    displayName: label,
    photoURL: identity.photoURL,
    avatarColor: identity.avatarColor,
    role: "member",
    status: "active",
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  batch.set(householdRootRef(safeHouseholdId), {
    memberIds: nextMemberIds,
    memberCount: nextMemberIds.length,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
    updatedByLabel: label,
  }, { merge: true });
  batch.set(userAppRef(uid), {
    activeHouseholdId: safeHouseholdId,
    householdSetupDone: true,
    workspaceMode: "household",
    pendingHouseholdId: "",
    pendingHouseholdName: "",
    updatedAt: serverTimestamp(),
  }, { merge: true });
  batch.set(userRootRef(uid), {
    displayName: label,
    photoURL: identity.photoURL,
    avatarColor: identity.avatarColor,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  batch.delete(userInviteRef(uid, safeHouseholdId));
  batch.delete(householdJoinRequestRef(safeHouseholdId, uid));
  await batch.commit();

  await ensureHouseholdDirectoryEntry(safeHouseholdId, {
    ...household,
    memberCount: nextMemberIds.length,
    memberIds: nextMemberIds,
  });
  await addHouseholdActivity(
    { householdId: safeHouseholdId, actorUid: uid, actorEmail: identity.email, actorName: label },
    "member.joined",
    { source: "invite" }
  );
  return { status: "joined", household: { ...household, memberIds: nextMemberIds, memberCount: nextMemberIds.length } };
};

export const declineHouseholdInvite = async (uid, householdId) => {
  if (!db) throw firebaseNotReadyError();
  const safeUid = String(uid || "").trim();
  const safeHouseholdId = String(householdId || "").trim();
  if (!safeUid || !safeHouseholdId) return false;
  await deleteDoc(userInviteRef(safeUid, safeHouseholdId));
  return true;
};

export const approveJoinRequest = async (householdId, requestUserId, approver) => {
  if (!db) throw firebaseNotReadyError();
  const requestSnap = await getDoc(householdJoinRequestRef(householdId, requestUserId));
  if (!requestSnap.exists()) return false;
  const request = requestSnap.data();
  const householdSnap = await getDoc(householdRootRef(householdId));
  const household = householdSnap.exists() ? householdSnap.data() : {};
  await ensureHouseholdDirectoryEntry(householdId, { ...household, memberCount: Number(household.memberCount || 0) + 1 });
  const batch = writeBatch(db);
  batch.set(householdMemberRef(householdId, requestUserId), {
    uid: requestUserId,
    email: request.email || "",
    label: request.displayName || request.label || request.email || "Member",
    displayName: request.displayName || request.label || request.email || "Member",
    photoURL: request.photoURL || "",
    avatarColor: request.avatarColor || pickAvatarColor(requestUserId || request.email || request.label),
    role: "member",
    status: "active",
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  batch.set(householdJoinRequestRef(householdId, requestUserId), {
    status: "approved",
    reviewedAt: serverTimestamp(),
    reviewedBy: approver?.uid || "",
  }, { merge: true });
  batch.set(householdRootRef(householdId), {
    memberIds: Array.from(new Set([...(household.memberIds || []), requestUserId])),
    memberCount: Number(household.memberCount || 0) + 1,
    updatedAt: serverTimestamp(),
    updatedBy: approver?.uid || "",
    updatedByLabel: approver?.displayName || approver?.email || "Admin",
  }, { merge: true });
  batch.set(userAppRef(requestUserId), {
    activeHouseholdId: householdId,
    householdSetupDone: true,
    workspaceMode: "household",
    pendingHouseholdId: "",
    pendingHouseholdName: "",
    updatedAt: serverTimestamp(),
  }, { merge: true });
  batch.set(userInviteRef(requestUserId, householdId), {
    householdId,
    householdName: String(household.name || "Shared home"),
    householdDescription: String(household.description || ""),
    joinCode: String(household.joinCode || ""),
    joinMode: String(household.joinMode || "approval"),
    invitedByUid: String(approver?.uid || ""),
    invitedByEmail: String(approver?.email || ""),
    invitedByName: String(approver?.displayName || approver?.email || "Admin"),
    status: "accepted",
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  await addHouseholdActivity(
    { householdId, actorUid: approver?.uid || "", actorEmail: approver?.email || "", actorName: approver?.displayName || approver?.email || "Admin" },
    "join.approved",
    { requestUserId, requestEmail: request.email || "" }
  );
  return true;
};

export const rejectJoinRequest = async (householdId, requestUserId, approver) => {
  if (!db) throw firebaseNotReadyError();
  await setDoc(householdJoinRequestRef(householdId, requestUserId), {
    status: "rejected",
    reviewedAt: serverTimestamp(),
    reviewedBy: approver?.uid || "",
  }, { merge: true });
  await addHouseholdActivity(
    { householdId, actorUid: approver?.uid || "", actorEmail: approver?.email || "", actorName: approver?.displayName || approver?.email || "Admin" },
    "join.rejected",
    { requestUserId }
  );
  return true;
};

export const leaveHousehold = async (uid, householdId) => {
  if (!db) throw firebaseNotReadyError();
  const safeUid = String(uid || "");
  const safeHouseholdId = String(householdId || "");
  if (!safeUid || !safeHouseholdId) throw new Error("uid and householdId are required");

  const memberSnap = await getDoc(householdMemberRef(safeHouseholdId, safeUid));
  if (!memberSnap.exists()) throw new Error("You are not a member of this household");
  if (memberSnap.data()?.role === "owner") throw new Error("Owners cannot leave. Transfer ownership first.");

  const householdSnap = await getDoc(householdRootRef(safeHouseholdId));
  const household = householdSnap.exists() ? householdSnap.data() : {};

  const batch = writeBatch(db);
  // Remove member doc
  batch.delete(householdMemberRef(safeHouseholdId, safeUid));
  // Remove from memberIds, decrement memberCount
  const nextIds = (household.memberIds || []).filter((id) => id !== safeUid);
  batch.set(householdRootRef(safeHouseholdId), {
    memberIds: nextIds,
    memberCount: Math.max(0, nextIds.length),
    updatedAt: serverTimestamp(),
    updatedBy: safeUid,
    updatedByLabel: memberSnap.data()?.displayName || memberSnap.data()?.label || "Member",
  }, { merge: true });
  // Reset user to solo workspace
  batch.set(userAppRef(safeUid), {
    activeHouseholdId: "",
    householdSetupDone: true,
    workspaceMode: "solo",
    pendingHouseholdId: "",
    pendingHouseholdName: "",
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  await addHouseholdActivity(
    { householdId: safeHouseholdId, actorUid: safeUid, actorEmail: memberSnap.data()?.email || "", actorName: memberSnap.data()?.displayName || memberSnap.data()?.label || "Member" },
    "member.left",
    {}
  );
  return true;
};

export const removeHouseholdMember = async (householdId, targetUid, actor) => {
  if (!db) throw firebaseNotReadyError();
  const safeHouseholdId = String(householdId || "");
  const safeTargetUid = String(targetUid || "");

  const memberSnap = await getDoc(householdMemberRef(safeHouseholdId, safeTargetUid));
  if (!memberSnap.exists()) return false;
  if (memberSnap.data()?.role === "owner") throw new Error("Cannot remove the household owner");

  const householdSnap = await getDoc(householdRootRef(safeHouseholdId));
  const household = householdSnap.exists() ? householdSnap.data() : {};

  const batch = writeBatch(db);
  batch.delete(householdMemberRef(safeHouseholdId, safeTargetUid));
  const nextIds = (household.memberIds || []).filter((id) => id !== safeTargetUid);
  batch.set(householdRootRef(safeHouseholdId), {
    memberIds: nextIds,
    memberCount: Math.max(0, nextIds.length),
    updatedAt: serverTimestamp(),
    updatedBy: actor?.uid || "",
    updatedByLabel: actor?.displayName || actor?.email || "Admin",
  }, { merge: true });
  // Always reset the removed user's workspace to solo — merge:true makes this
  // safe even if the doc doesn't exist yet (creates it). Previously this was
  // conditional on the doc existing, which meant users with no workspace doc
  // were never notified of their removal via subscribeUserWorkspace.
  batch.set(userAppRef(safeTargetUid), {
    activeHouseholdId: "",
    householdSetupDone: true,
    workspaceMode: "solo",
    pendingHouseholdId: "",
    pendingHouseholdName: "",
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  await addHouseholdActivity(
    { householdId: safeHouseholdId, actorUid: actor?.uid || "", actorEmail: actor?.email || "", actorName: actor?.displayName || actor?.email || "Admin" },
    "member.removed",
    { targetUid: safeTargetUid, targetEmail: memberSnap.data()?.email || "" }
  );
  return true;
};

// Save a single account record for a month (merge so we don't overwrite fields)
export const saveRecord = async (uid, monthKey, accountId, data, scope = null) => {
  if (!db) {
    throw firebaseNotReadyError();
  }
  try {
    const ref = workspaceAccountRef(uid, monthKey, accountId, scope);
    await Promise.all([
      setDoc(
        ref,
        {
          ...data,
          schemaVersion: SCHEMA_VERSION,
          updatedAt: serverTimestamp(),
          updatedBy: scope?.actorUid || String(uid),
          updatedByLabel: getActorLabel(scope) || String(uid),
        },
        { merge: true }
      ),
      touchWorkspaceAndMonth(uid, monthKey, scope),
    ]);
    await addHouseholdActivity(scope, "record.updated", { monthKey: String(monthKey), accountId: String(accountId) });
  } catch (e) {
    console.error("saveRecord error:", e);
    throw e;
  }
};

// Atomically write a monthly account record AND workspace settings in one Firestore batch.
// Use this when an APR edit must keep the record and accountOverrides in sync.
export const saveRecordAndSettings = async (uid, monthKey, accountId, recordData, settingsData, scope = null) => {
  if (!db) throw firebaseNotReadyError();
  try {
    const actorUid   = scope?.actorUid || String(uid);
    const actorLabel = getActorLabel(scope) || String(uid);
    const meta = { schemaVersion: SCHEMA_VERSION, updatedAt: serverTimestamp(), updatedBy: actorUid, updatedByLabel: actorLabel };
    const batch = writeBatch(db);
    batch.set(workspaceAccountRef(uid, monthKey, accountId, scope), { ...recordData, ...meta }, { merge: true });
    batch.set(workspaceSettingsRef(uid, scope), { ...settingsData, ...meta }, { merge: true });
    await batch.commit();
    // Best-effort side effects (not part of the atomic write)
    await Promise.allSettled([
      touchWorkspaceAndMonth(uid, monthKey, scope),
      addHouseholdActivity(scope, "record.updated", { monthKey: String(monthKey), accountId: String(accountId) }),
    ]);
  } catch (e) {
    console.error("saveRecordAndSettings error:", e);
    throw e;
  }
};

// Load all account records for a month (one-time fetch)
export const loadRecords = async (uid, monthKey, scope = null) => {
  if (!db) return {};
  try {
    const snap = await getDocs(workspaceAccountsRef(uid, monthKey, scope));
    const result = {};
    snap.forEach(d => { result[d.id] = d.data(); });
    return result;
  } catch (e) {
    console.error("loadRecords error:", e);
    return {};
  }
};

// Real-time listener for a month's records
export const subscribeRecords = (uid, monthKey, callback, scope = null) => {
  if (!db) {
    callback({});
    return () => {};
  }
  return onSnapshot(
    workspaceAccountsRef(uid, monthKey, scope),
    (snap) => {
      const result = {};
      snap.forEach(d => { result[d.id] = d.data(); });
      callback(result);
    },
    (err) => {
      console.error("subscribeRecords error:", err);
      // Prevent UI from hanging in loading state when listener fails.
      callback({});
    }
  );
};

// Save income list for a month
export const saveIncome = async (uid, monthKey, incomeList, scope = null) => {
  if (!db) {
    throw firebaseNotReadyError();
  }
  try {
    const ref = workspaceMonthRef(uid, monthKey, scope);
    const payload = Array.isArray(incomeList)
      ? { entries: incomeList, receipts: {} }
      : {
          entries: Array.isArray(incomeList?.entries) ? incomeList.entries : [],
          receipts: incomeList?.receipts && typeof incomeList.receipts === "object" ? incomeList.receipts : {},
        };
    await Promise.all([
      setDoc(
        ref,
        {
          ...payload,
          schemaVersion: SCHEMA_VERSION,
          updatedAt: serverTimestamp(),
          updatedBy: scope?.actorUid || String(uid),
          updatedByLabel: getActorLabel(scope) || String(uid),
        },
        { merge: true }
      ),
      touchWorkspaceAndMonth(uid, monthKey, scope),
    ]);
    await addHouseholdActivity(scope, "income.updated", { monthKey: String(monthKey) });
  } catch (e) {
    console.error("saveIncome error:", e);
    throw e;
  }
};

// Load income for a month
export const loadIncome = async (uid, monthKey, scope = null) => {
  if (!db) return [];
  try {
    const ref = workspaceMonthRef(uid, monthKey, scope);
    const snap = await getDoc(ref);
    if (!snap.exists()) return [];
    const data = snap.data();
    if (Array.isArray(data?.entries) || data?.receipts) {
      return {
        entries: Array.isArray(data?.entries) ? data.entries : [],
        receipts: data?.receipts && typeof data.receipts === "object" ? data.receipts : {},
      };
    }
    return [];
  } catch (e) {
    console.error("loadIncome error:", e);
    return [];
  }
};

// Save an upload/audit record under a month
export const saveUpload = async (uid, monthKey, upload, scope = null) => {
  if (!db) {
    throw firebaseNotReadyError();
  }
  try {
    const ref = workspaceUploadsRef(uid, monthKey, scope);
    const docRef = await addDoc(ref, {
      ...upload,
      schemaVersion: SCHEMA_VERSION,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: scope?.actorUid || String(uid),
      updatedByLabel: getActorLabel(scope) || String(uid),
    });
    await touchWorkspaceAndMonth(uid, monthKey, scope);
    await addHouseholdActivity(scope, "upload.saved", { monthKey: String(monthKey), uploadId: docRef.id, statementName: upload?.statementName || "" });
    return docRef.id;
  } catch (e) {
    console.error("saveUpload error:", e);
    throw e;
  }
};

// Load upload/audit records for a month
export const loadUploads = async (uid, monthKey, maxItems = 500, scope = null) => {
  if (!db) return [];
  try {
    const clampedLimit = Math.max(1, Math.min(Number(maxItems) || 500, 2000));
    const q = query(
      workspaceUploadsRef(uid, monthKey, scope),
      orderBy("createdAt", "asc"),
      fsLimit(clampedLimit)
    );
    const snap = await getDocs(q);
    const result = [];
    snap.forEach(d => result.push({ id: d.id, ...d.data() }));
    return result;
  } catch (e) {
    console.error("loadUploads error:", e);
    return [];
  }
};

// Create or update a payoff plan.
// If planId is omitted, a new plan is created and the id is returned.
export const upsertPayoffPlan = async (uid, plan, planId = null, scope = null) => {
  if (!db) {
    throw firebaseNotReadyError();
  }
  const clean = {
    name: plan?.name || "New Plan",
    owner: plan?.owner || "All",
    strategy: plan?.strategy || "avalanche",
    monthly_extra: Number(plan?.monthly_extra || 0),
    items: Array.isArray(plan?.items) ? plan.items : [],
    updatedAt: serverTimestamp(),
    updatedBy: scope?.actorUid || String(uid),
    updatedByLabel: getActorLabel(scope) || String(uid),
  };

  try {
    if (planId) {
      const ref = workspacePlanRef(uid, planId, scope);
      await setDoc(ref, clean, { merge: true });
      await addHouseholdActivity(scope, "plan.updated", { planId: String(planId), planName: clean.name });
      return String(planId);
    }
    const ref = workspacePlansRef(uid, scope);
    const created = await addDoc(ref, { ...clean, createdAt: serverTimestamp() });
    await addHouseholdActivity(scope, "plan.created", { planId: created.id, planName: clean.name });
    return created.id;
  } catch (e) {
    console.error("upsertPayoffPlan error:", e);
    throw e;
  }
};

// Load all payoff plans for a user.
export const loadPayoffPlans = async (uid, scope = null) => {
  if (!db) return [];
  try {
    const snap = await getDocs(workspacePlansRef(uid, scope));
    const result = [];
    snap.forEach((d) => result.push({ id: d.id, ...d.data() }));
    return result.sort((a, b) => {
      const aTs = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
      const bTs = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
      return bTs - aTs;
    });
  } catch (e) {
    console.error("loadPayoffPlans error:", e);
    return [];
  }
};

// User-level app settings (custom categories/accounts, UI prefs, etc.)
export const saveUserSettings = async (uid, data) => {
  if (!db) {
    throw firebaseNotReadyError();
  }
  try {
    const ref = userAppRef(uid);
    await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    console.error("saveUserSettings error:", e);
    throw e;
  }
};

export const loadUserSettings = async (uid) => {
  if (!db) return {};
  try {
    const ref = userAppRef(uid);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : {};
  } catch (e) {
    console.error("loadUserSettings error:", e);
    return {};
  }
};

export const saveWorkspaceSettings = async (uid, data, scope = null) => {
  if (!db) throw firebaseNotReadyError();
  try {
    const ref = workspaceSettingsRef(uid, scope);
    await setDoc(ref, {
      ...data,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: serverTimestamp(),
      updatedBy: scope?.actorUid || String(uid),
      updatedByLabel: getActorLabel(scope) || String(uid),
    }, { merge: true });
    await addHouseholdActivity(scope, "settings.updated", {});
  } catch (e) {
    console.error("saveWorkspaceSettings error:", e);
    throw e;
  }
};

export const deletePayoffPlan = async (uid, planId, scope = null) => {
  if (!db || !planId) {
    if (!db) throw firebaseNotReadyError();
    return false;
  }
  try {
    await deleteDoc(workspacePlanRef(uid, planId, scope));
    await addHouseholdActivity(scope, "plan.deleted", { planId: String(planId) });
    return true;
  } catch (e) {
    console.error("deletePayoffPlan error:", e);
    throw e;
  }
};

export const saveUserProfile = async (uid, data = {}) => {
  if (!db) throw firebaseNotReadyError();
  const identity = resolveIdentity(data);
  await setDoc(
    userRootRef(uid),
    {
      displayName: identity.displayName,
      photoURL: identity.photoURL,
      avatarColor: identity.avatarColor,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return identity;
};

export const saveHouseholdMemberProfile = async (householdId, uid, data = {}) => {
  if (!db) throw firebaseNotReadyError();
  const identity = resolveIdentity(data);
  await setDoc(
    householdMemberRef(householdId, uid),
    {
      label: identity.displayName,
      displayName: identity.displayName,
      photoURL: identity.photoURL,
      avatarColor: identity.avatarColor,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return identity;
};

export const loadWorkspaceSettings = async (uid, scope = null) => {
  if (!db) return {};
  try {
    const ref = workspaceSettingsRef(uid, scope);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : {};
  } catch (e) {
    console.error("loadWorkspaceSettings error:", e);
    return {};
  }
};

export const subscribeHouseholdActivity = (householdId, callback, maxItems = 20) => {
  if (!db || !householdId) {
    callback([]);
    return () => {};
  }
  const q = query(householdActivityRef(householdId), orderBy("createdAt", "desc"), fsLimit(Math.max(1, Math.min(Number(maxItems) || 20, 50))));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error("subscribeHouseholdActivity error:", err);
      callback([]);
    }
  );
};

export const subscribeHouseholdDashboard = (householdId, monthKey, callback) => {
  if (!db || !householdId || !monthKey) {
    callback(null);
    return () => {};
  }
  return onSnapshot(
    householdDashboardRef(householdId, monthKey),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => {
      console.error("subscribeHouseholdDashboard error:", err);
      callback(null);
    }
  );
};

export const saveHouseholdDashboardSnapshot = async (householdId, monthKey, totals, scope = null) => {
  if (!db || !householdId) return;
  try {
    await setDoc(householdDashboardRef(householdId, monthKey), {
      ...totals,
      monthKey: String(monthKey),
      updatedAt: serverTimestamp(),
      updatedBy: scope?.actorUid || "",
      updatedByLabel: getActorLabel(scope),
    }, { merge: true });
  } catch (e) {
    console.error("saveHouseholdDashboardSnapshot error:", e);
  }
};

// ---------- Admin / Registry ----------

/** Write a sanitized profile entry to /registry/{uid} on login. */
export const upsertUserRegistry = async (uid, data = {}) => {
  if (!db || !uid) return;
  try {
    await setDoc(registryDocRef(uid), {
      uid: String(uid),
      email: String(data.email || ""),
      displayName: String(data.displayName || data.email || ""),
      workspaceMode: data.workspaceMode || "solo",
      activeHouseholdId: String(data.activeHouseholdId || ""),
      lastSeenAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    // Non-critical — don't block app startup
    console.warn("upsertUserRegistry error:", e);
  }
};

/** Subscribe to all user registry entries (admin only — requires /config/admins rule). */
export const subscribeAllUsers = (callback) => {
  if (!db) {
    callback([]);
    return () => {};
  }
  const q = query(registryRef(), orderBy("lastSeenAt", "desc"), fsLimit(200));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error("subscribeAllUsers error:", err);
      callback([]);
    }
  );
};

/** Read /config/admins to get the list of admin UIDs. */
export const fetchAdminConfig = async () => {
  if (!db) return { uids: [] };
  try {
    const snap = await getDoc(configAdminsRef());
    return snap.exists() ? snap.data() : { uids: [] };
  } catch (e) {
    console.error("fetchAdminConfig error:", e);
    return { uids: [] };
  }
};

export const saveAdminConfig = async (uids = []) => {
  if (!db) throw firebaseNotReadyError();
  const nextUids = Array.from(new Set((Array.isArray(uids) ? uids : []).map((uid) => String(uid || "").trim()).filter(Boolean)));
  await setDoc(configAdminsRef(), {
    uids: nextUids,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return { uids: nextUids };
};

export const adminSetUserAdminRole = async (targetUid, makeAdmin) => {
  if (!db) throw firebaseNotReadyError();
  const safeTargetUid = String(targetUid || "").trim();
  if (!safeTargetUid) throw new Error("User ID is required.");
  const current = await fetchAdminConfig();
  const currentUids = Array.isArray(current?.uids) ? current.uids.map(String) : [];
  const nextUids = makeAdmin
    ? Array.from(new Set([...currentUids, safeTargetUid]))
    : currentUids.filter((uid) => uid !== safeTargetUid);
  return saveAdminConfig(nextUids);
};

const deleteCollectionDocs = async (collectionRef) => {
  const snap = await getDocs(collectionRef);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
  await batch.commit();
};

const deleteMonthSubtree = async (monthDocRef) => {
  const monthSnap = await getDoc(monthDocRef);
  if (!monthSnap.exists()) return;
  await Promise.all([
    deleteCollectionDocs(collection(monthDocRef, "accounts")),
    deleteCollectionDocs(collection(monthDocRef, "uploads")),
  ]);
  await deleteDoc(monthDocRef);
};

export const adminForceRemoveUserFromHouseholds = async (targetUid) => {
  if (!db) throw firebaseNotReadyError();
  const safeTargetUid = String(targetUid || "").trim();
  if (!safeTargetUid) throw new Error("User ID is required.");

  const snap = await getDocs(query(householdsRef(), where("memberIds", "array-contains", safeTargetUid)));
  for (const householdDoc of snap.docs) {
    const household = householdDoc.data() || {};
    const memberSnap = await getDoc(householdMemberRef(householdDoc.id, safeTargetUid));
    if (memberSnap.exists() && memberSnap.data()?.role === "owner") {
      throw new Error("This user owns a household. Transfer ownership before forcing removal.");
    }
    const nextIds = (household.memberIds || []).filter((id) => String(id) !== safeTargetUid);
    const batch = writeBatch(db);
    batch.delete(householdMemberRef(householdDoc.id, safeTargetUid));
    batch.set(householdRootRef(householdDoc.id), {
      memberIds: nextIds,
      memberCount: Math.max(0, nextIds.length),
      updatedAt: serverTimestamp(),
      updatedBy: "admin",
      updatedByLabel: "Admin",
    }, { merge: true });
    await batch.commit();
  }

  await setDoc(userAppRef(safeTargetUid), {
    activeHouseholdId: "",
    householdSetupDone: true,
    workspaceMode: "solo",
    pendingHouseholdId: "",
    pendingHouseholdName: "",
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await setDoc(registryDocRef(safeTargetUid), {
    workspaceMode: "solo",
    activeHouseholdId: "",
    lastSeenAt: serverTimestamp(),
  }, { merge: true });
  return true;
};

/** Admin action: force a user's workspace to solo mode. */
export const adminResetUserToSolo = async (targetUid) => {
  if (!db || !targetUid) throw new Error("targetUid required");
  await adminForceRemoveUserFromHouseholds(targetUid);
  await setDoc(userAppRef(String(targetUid)), {
    activeHouseholdId: "",
    householdSetupDone: true,
    workspaceMode: "solo",
    pendingHouseholdId: "",
    pendingHouseholdName: "",
    updatedAt: serverTimestamp(),
  }, { merge: true });
  // Mirror the solo state in registry so the admin list reflects the change immediately
  await setDoc(registryDocRef(String(targetUid)), {
    workspaceMode: "solo",
    activeHouseholdId: "",
    lastSeenAt: serverTimestamp(),
  }, { merge: true });
};

export const adminDeleteUserFirestoreData = async (targetUid) => {
  if (!db || !targetUid) throw new Error("targetUid required");
  const safeTargetUid = String(targetUid || "").trim();
  await adminForceRemoveUserFromHouseholds(safeTargetUid);

  const monthRefs = await getDocs(collection(db, "users", safeTargetUid, "months"));
  for (const monthDoc of monthRefs.docs) {
    await deleteMonthSubtree(monthDoc.ref);
  }

  await Promise.all([
    deleteCollectionDocs(collection(db, "users", safeTargetUid, "payoff_plans")),
    deleteCollectionDocs(collection(db, "users", safeTargetUid, "invites")),
  ]);

  const metaAppSnap = await getDoc(userAppRef(safeTargetUid));
  if (metaAppSnap.exists()) {
    await deleteDoc(userAppRef(safeTargetUid));
  }

  const userSnap = await getDoc(userRootRef(safeTargetUid));
  if (userSnap.exists()) {
    await deleteDoc(userRootRef(safeTargetUid));
  }

  const registrySnap = await getDoc(registryDocRef(safeTargetUid));
  if (registrySnap.exists()) {
    await deleteDoc(registryDocRef(safeTargetUid));
  }

  const adminConfig = await fetchAdminConfig();
  if (Array.isArray(adminConfig?.uids) && adminConfig.uids.includes(safeTargetUid)) {
    await saveAdminConfig(adminConfig.uids.filter((uid) => String(uid) !== safeTargetUid));
  }
  return true;
};

