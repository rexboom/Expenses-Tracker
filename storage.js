// IndexedDB persistence module: offline-first, schema-managed, and storage-agnostic.
const DB_NAME = 'ledger-pwa';
const DB_VERSION = 3;
const STORE_NAMES = ['transactions', 'budgets', 'settings', 'accounts', 'goals', 'investments'];

let database = null;
let initPromise = null;

export function initDB() {
  if (database) return Promise.resolve(database);
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('transactions')) {
        const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
        txStore.createIndex('by_date', 'date', { unique: false });
        txStore.createIndex('by_account', 'accountId', { unique: false });
        txStore.createIndex('by_type', 'type', { unique: false });
        txStore.createIndex('by_category', 'category', { unique: false });
      } else {
        const txStore = req.transaction.objectStore('transactions');
        if (!txStore.indexNames.contains('by_date')) txStore.createIndex('by_date', 'date', { unique: false });
        if (!txStore.indexNames.contains('by_account')) txStore.createIndex('by_account', 'accountId', { unique: false });
        if (!txStore.indexNames.contains('by_type')) txStore.createIndex('by_type', 'type', { unique: false });
        if (!txStore.indexNames.contains('by_category')) txStore.createIndex('by_category', 'category', { unique: false });
      }

      if (!db.objectStoreNames.contains('budgets')) {
        db.createObjectStore('budgets', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('accounts')) {
        db.createObjectStore('accounts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('goals')) {
        db.createObjectStore('goals', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('investments')) {
        db.createObjectStore('investments', { keyPath: 'id' });
      }
    };

    req.onsuccess = () => {
      database = req.result;
      database.onversionchange = () => {
        database.close();
        database = null;
      };
      resolve(database);
    };

    req.onerror = () => {
      initPromise = null;
      reject(req.error);
    };
  });

  return initPromise;
}

const store = (name, mode = 'readonly') => {
  if (!database) throw new Error('Database not initialized. Call initDB() first.');
  return database.transaction(name, mode).objectStore(name);
};

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const getAll = (name) => request(store(name).getAll());
export const get = (name, id) => request(store(name).get(id));
export const put = (name, item) => request(store(name, 'readwrite').put(item));
export const remove = (name, id) => request(store(name, 'readwrite').delete(id));

export async function clearAll() {
  await Promise.all(STORE_NAMES.map((n) => request(store(n, 'readwrite').clear())));
  try {
    localStorage.removeItem('ledger_auto_backup');
  } catch (_) {}
}

export async function replaceAll(data) {
  await clearAll();
  for (const n of STORE_NAMES) {
    const items = data[n] || [];
    for (const item of items) {
      await put(n, item);
    }
  }
}

export async function getExportPayload() {
  const payload = {
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    transactions: await getAll('transactions'),
    budgets: await getAll('budgets'),
    settings: await getAll('settings'),
    accounts: await getAll('accounts'),
    goals: await getAll('goals'),
    investments: await getAll('investments'),
  };
  return payload;
}

export async function createAutoBackup() {
  try {
    const payload = await getExportPayload();
    localStorage.setItem('ledger_auto_backup', JSON.stringify(payload));
    return payload.exportedAt;
  } catch (err) {
    console.warn('Auto backup failed', err);
    return null;
  }
}

export function getAutoBackupInfo() {
  try {
    const raw = localStorage.getItem('ledger_auto_backup');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      timestamp: parsed.exportedAt || null,
      txCount: parsed.transactions?.length || 0,
      accountsCount: parsed.accounts?.length || 0,
    };
  } catch (_) {
    return null;
  }
}

export async function restoreAutoBackup() {
  const raw = localStorage.getItem('ledger_auto_backup');
  if (!raw) throw new Error('No auto-backup found in storage.');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.transactions)) throw new Error('Invalid auto-backup structure.');
  await replaceAll(parsed);
  return parsed;
}
