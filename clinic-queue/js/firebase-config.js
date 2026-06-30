// Firebase initialization — shared across all pages.
// apiKey here is a public client identifier (not a secret) and is safe to commit.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, getDocs, getDoc, serverTimestamp, Timestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
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

export {
  collection, doc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, getDocs, getDoc, serverTimestamp, Timestamp, runTransaction,
  signInWithEmailAndPassword, signOut, onAuthStateChanged
};
