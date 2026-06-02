import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'GlasstechERP_DB';
const DB_VER = 3;

let dbPromise: Promise<IDBPDatabase<any>>;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VER, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('productionPieces')) db.createObjectStore('productionPieces', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('ledger')) db.createObjectStore('ledger', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('stockLedger')) db.createObjectStore('stockLedger', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('activityLogs')) db.createObjectStore('activityLogs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('archive')) db.createObjectStore('archive', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('accounts')) db.createObjectStore('accounts', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
};