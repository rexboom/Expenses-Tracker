// IndexedDB persistence is isolated here so UI code stays storage-agnostic.
const DB = 'ledger-pwa', VERSION = 1;
let database;
export function initDB(){ return new Promise((resolve,reject)=>{ const req=indexedDB.open(DB,VERSION); req.onupgradeneeded=()=>{const db=req.result; if(!db.objectStoreNames.contains('transactions')) db.createObjectStore('transactions',{keyPath:'id'}); if(!db.objectStoreNames.contains('budgets')) db.createObjectStore('budgets',{keyPath:'id'}); if(!db.objectStoreNames.contains('settings')) db.createObjectStore('settings',{keyPath:'key'});}; req.onsuccess=()=>{database=req.result;resolve();};req.onerror=()=>reject(req.error); }); }
const store=(name,mode='readonly')=>database.transaction(name,mode).objectStore(name);
const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
export const getAll=name=>request(store(name).getAll()); export const get=(name,id)=>request(store(name).get(id)); export const put=(name,item)=>request(store(name,'readwrite').put(item)); export const remove=(name,id)=>request(store(name,'readwrite').delete(id));
export async function clearAll(){ await Promise.all(['transactions','budgets','settings'].map(n=>request(store(n,'readwrite').clear()))); }
export async function replaceAll(data){ await clearAll(); for(const n of ['transactions','budgets','settings']) for(const item of data[n]||[]) await put(n,item); }
