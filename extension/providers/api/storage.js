const DB_NAME = 'professor-ask-api-keys';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Impossible d’ouvrir le stockage des clés API.'));
  });
  return dbPromise;
}

export async function getApiKey(provider) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(provider);
    request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : '');
    request.onerror = () => reject(request.error || new Error('Lecture de la clé API impossible.'));
  });
}

export async function setApiKey(provider, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(key, provider);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Enregistrement de la clé API impossible.'));
  });
}

export async function deleteApiKey(provider) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(provider);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Suppression de la clé API impossible.'));
  });
}
