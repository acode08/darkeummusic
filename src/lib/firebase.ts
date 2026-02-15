import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { 
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  Timestamp
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBqrkuSApK7GkkuBrUfuQAQYNEYzI2RkVg",
  authDomain: "dms-production-d1b3a.firebaseapp.com",
  projectId: "dms-production-d1b3a",
  storageBucket: "dms-production-d1b3a.firebasestorage.app",
  messagingSenderId: "222556629978",
  appId: "1:222556629978:web:185a4704fb8da6f620aee3"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { 
  app, 
  auth, 
  db,
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  Timestamp
};
