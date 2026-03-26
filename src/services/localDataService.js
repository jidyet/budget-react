const USERS_KEY = 'budget_local_users';

const safeParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const localKey = (uid) => `budget_local_${uid}`;
const planKey = (uid) => `budget_local_plans_${uid}`;
const settingsKey = (uid) => `budget_local_settings_${uid}`;

export function createLocalDataService({ seedMonthKey, seedAccounts, defaultRecord }) {
  const ensureLocalUserData = (uid) => {
    const storageKey = localKey(uid);
    const raw = localStorage.getItem(storageKey);

    if (!raw) {
      const months = {
        [seedMonthKey]: {
          accounts: Object.fromEntries(seedAccounts.map((account) => [account.id, defaultRecord(account)])),
          income: [],
          uploads: [],
        },
      };
      const next = { months };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    }

    return safeParse(raw, { months: {} });
  };

  const writeLocalUserData = (uid, updater) => {
    const current = ensureLocalUserData(uid);
    const next = updater(current) || current;
    localStorage.setItem(localKey(uid), JSON.stringify(next));
    return next;
  };

  return {
    ensureLocalUserData,
    loadRecords(uid, monthKey) {
      const data = ensureLocalUserData(uid);
      return data.months?.[monthKey]?.accounts || {};
    },
    loadIncome(uid, monthKey) {
      const data = ensureLocalUserData(uid);
      return data.months?.[monthKey]?.income || [];
    },
    saveIncome(uid, monthKey, incomeList) {
      writeLocalUserData(uid, (data) => {
        if (!data.months) data.months = {};
        if (!data.months[monthKey]) data.months[monthKey] = { accounts: {}, income: [], uploads: [] };
        data.months[monthKey].income = Array.isArray(incomeList)
          ? incomeList
          : {
              entries: Array.isArray(incomeList?.entries) ? incomeList.entries : [],
              receipts: incomeList?.receipts && typeof incomeList.receipts === 'object' ? incomeList.receipts : {},
            };
        return data;
      });
    },
    saveUpload(uid, monthKey, upload) {
      writeLocalUserData(uid, (data) => {
        if (!data.months) data.months = {};
        if (!data.months[monthKey]) data.months[monthKey] = { accounts: {}, income: [], uploads: [] };
        if (!Array.isArray(data.months[monthKey].uploads)) data.months[monthKey].uploads = [];
        data.months[monthKey].uploads.push({ ...upload, createdAt: Date.now() });
        return data;
      });
    },
    createUser(email, password) {
      const users = safeParse(localStorage.getItem(USERS_KEY), {});
      if (users[email]) throw new Error('Local account already exists');
      const uid = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      users[email] = { uid, password };
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      ensureLocalUserData(uid);
      return { uid, email, isLocal: true };
    },
    signIn(email, password) {
      const users = safeParse(localStorage.getItem(USERS_KEY), {});
      const entry = users[email];
      if (!entry || entry.password !== password) throw new Error('Local signin failed');
      return { uid: entry.uid, email, isLocal: true };
    },
    loadPlans(uid) {
      return safeParse(localStorage.getItem(planKey(uid)), []);
    },
    savePlan(uid, payload, existingId = '') {
      const list = safeParse(localStorage.getItem(planKey(uid)), []);
      const id = existingId || `plan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const index = list.findIndex((plan) => plan.id === id);
      const next = {
        ...payload,
        id,
        updatedAt: Date.now(),
        createdAt: index >= 0 ? list[index].createdAt : Date.now(),
      };
      if (index >= 0) list[index] = next;
      else list.unshift(next);
      localStorage.setItem(planKey(uid), JSON.stringify(list));
      return id;
    },
    deletePlan(uid, existingId = '') {
      if (!existingId) return [];
      const list = safeParse(localStorage.getItem(planKey(uid)), []);
      const next = list.filter((plan) => plan.id !== existingId);
      localStorage.setItem(planKey(uid), JSON.stringify(next));
      return next;
    },
    loadSettings(uid) {
      return safeParse(localStorage.getItem(settingsKey(uid)), {});
    },
    saveSettings(uid, payload) {
      const merged = { ...safeParse(localStorage.getItem(settingsKey(uid)), {}), ...payload, updatedAt: Date.now() };
      localStorage.setItem(settingsKey(uid), JSON.stringify(merged));
    },
  };
}
