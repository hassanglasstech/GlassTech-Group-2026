import { initDB } from './db';

export const bgSaveToIDB = async (storeName: string, items: any[]) => {
  try {
    const db = await initDB();
    const tx = db.transaction(storeName, 'readwrite');
    await Promise.all([
      tx.store.clear(),
      ...items.map(item => tx.store.put(item))
    ]);
    await tx.done;
  } catch (e) {
    console.warn(`Background IDB Write Failed for ${storeName}`, e);
  }
};

export const safeParse = (key: string, defaultValue: string = '[]') => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : JSON.parse(defaultValue);
  } catch (e) {
    console.error(`Storage Error: Corrupted data in ${key}. Resetting.`, e);
    return JSON.parse(defaultValue);
  }
};
