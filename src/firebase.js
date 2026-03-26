import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
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
const userMonthRef = (uid, monthKey) => doc(db, "users", String(uid), "months", String(monthKey));
const userMonthAccountsRef = (uid, monthKey) => collection(db, "users", String(uid), "months", String(monthKey), "accounts");
const userMonthAccountRef = (uid, monthKey, accountId) =>
  doc(db, "users", String(uid), "months", String(monthKey), "accounts", String(accountId));
const userMonthUploadsRef = (uid, monthKey) => collection(db, "users", String(uid), "months", String(monthKey), "uploads");
const userAppRef = (uid) => doc(db, "users", String(uid), "meta", "app");
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

const getActorLabel = (scope) => scope?.actorName || scope?.actorEmail || "Unknown member";
const workspaceHasHousehold = (scope) => !!scope?.householdId;
const workspaceSettingsRef = (uid, scope) => workspaceHasHousehold(scope) ? householdMetaAppRef(scope.householdId) : userAppRef(uid);
const workspaceMonthRef = (uid, monthKey, scope) => workspaceHasHousehold(scope) ? householdMonthRef(scope.householdId, monthKey) : userMonthRef(uid, monthKey);
const workspaceAccountsRef = (uid, monthKey, scope) => workspaceHasHousehold(scope) ? householdMonthAccountsRef(scope.householdId, monthKey) : userMonthAccountsRef(uid, monthKey);
const workspaceAccountRef = (uid, monthKey, accountId, scope) => workspaceHasHousehold(scope) ? householdMonthAccountRef(scope.householdId, monthKey, accountId) : userMonthAccountRef(uid, monthKey, accountId);
const workspaceUploadsRef = (uid, monthKey, scope) => workspaceHasHousehold(scope) ? householdMonthUploadsRef(scope.householdId, monthKey) : userMonthUploadsRef(uid, monthKey);
const workspacePlansRef = (uid, scope) => workspaceHasHousehold(scope) ? householdPlansRef(scope.householdId) : collection(db, "users", String(uid), "payoff_plans");
const workspacePlanRef = (uid, planId, scope) => workspaceHasHousehold(scope) ? householdPlanRef(scope.householdId, planId) : doc(db, "users", String(uid), "payoff_plans", String(planId));

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

export const subscribeHouseholdForUser = (uid, callback) => {
  if (!db) {
    callback({ activeHousehold: null, memberships: [] });
    return () => {};
  }
  const q = query(householdsRef(), where("memberIds", "array-contains", String(uid)));
  return onSnapshot(
    q,
    (snap) => {
      const memberships = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
  const raw = String(term || "").trim();
  if (!raw) return [];
  try {
    const byCode = await getDocs(query(householdDirectoryRef(), where("joinCode", "==", raw.toUpperCase()), fsLimit(10)));
    if (!byCode.empty) return byCode.docs.map((d) => ({ id: d.id, ...d.data() }));
    const snap = await getDocs(query(householdDirectoryRef(), orderBy("nameLower"), fsLimit(40)));
    const needle = raw.toLowerCase();
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((item) => String(item.name || "").toLowerCase().includes(needle));
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
  await Promise.all([
    setDoc(householdDirectoryDocRef(householdId), normalizeHouseholdDirectory(householdId, payload), { merge: true }),
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
  if (house.joinMode === "open") {
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
      setDoc(householdDirectoryDocRef(house.id), normalizeHouseholdDirectory(house.id, { ...house, memberCount: Number(house.memberCount || 0) + 1 }), { merge: true }),
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
  }, { merge: true });
  await addHouseholdActivity({ householdId: house.id, actorUid: uid, actorEmail: email, actorName: label }, "join.requested", {});
  return { status: "requested" };
};

export const approveJoinRequest = async (householdId, requestUserId, approver) => {
  if (!db) throw firebaseNotReadyError();
  const requestSnap = await getDoc(householdJoinRequestRef(householdId, requestUserId));
  if (!requestSnap.exists()) return false;
  const request = requestSnap.data();
  const householdSnap = await getDoc(householdRootRef(householdId));
  const household = householdSnap.exists() ? householdSnap.data() : {};
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
  batch.set(householdDirectoryDocRef(householdId), normalizeHouseholdDirectory(householdId, { ...household, memberCount: Number(household.memberCount || 0) + 1 }), { merge: true });
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

