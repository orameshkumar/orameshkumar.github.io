// Firebase initialization — shared across all pages.
// apiKey here is a public client identifier (not a secret) and is safe to commit.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, getDocs, getDoc, serverTimestamp, Timestamp, runTransaction, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAdfa43BWJL-kGWXUj6rMbFM6zWYMUMpCU",
  authDomain: "clinic-queue-system-3f663.firebaseapp.com",
  projectId: "clinic-queue-system-3f663",
  storageBucket: "clinic-queue-system-3f663.firebasestorage.app",
  messagingSenderId: "696083840993",
  appId: "1:696083840993:web:16face9e389e139fd49ca0"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Scope auth sessions to a single browser tab instead of the whole browser.
// Default Firebase behavior shares one login across every tab/window of the
// same browser, which breaks the case where two doctors share one machine
// and each opens their own tab. Session-scoped persistence means: a login
// survives a refresh within that same tab, but a new tab starts logged out,
// and other open tabs are unaffected by a sign-in/out elsewhere.
// authReady resolves once this is in effect, so pages can await it before
// attaching onAuthStateChanged listeners or attempting a sign-in.
export const authReady = setPersistence(auth, browserSessionPersistence).catch((err) => {
  console.error("Failed to set session-scoped auth persistence, falling back to default behavior.", err);
});

export {
  collection, doc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, getDocs, getDoc, serverTimestamp, Timestamp, runTransaction, writeBatch,
  signInWithEmailAndPassword, signOut, onAuthStateChanged
};
