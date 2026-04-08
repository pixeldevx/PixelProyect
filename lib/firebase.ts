import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

let app: any;
let dbInstance: any;
let authInstance: any;
let storageInstance: any;

export const getFirebase = () => {
  if (!app) {
    try {
      app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
      dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
      authInstance = getAuth(app);
      storageInstance = getStorage(app);
    } catch (error) {
      console.error("Error initializing Firebase:", error);
      throw error;
    }
  }
  return { db: dbInstance, auth: authInstance, storage: storageInstance };
};

// Initialize instances for direct export
const appInstance = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(appInstance, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(appInstance);
export const storage = getStorage(appInstance);
