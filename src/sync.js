/* Anmeldung (E-Mail/Passwort) und Abgleich der Reisen mit Firestore.
   Pfad: users/<uid>/trips/<tripId>  mit {name, rev, json}. Neuere Version (rev) gewinnt.
   Firestore hält einen lokalen Offline-Speicher, Änderungen ohne Netz werden später nachgeschickt. */
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, deleteDoc, onSnapshot
} from 'firebase/firestore';
import { firebaseConfig } from './firebase-config.js';

let app, auth, db, unsub = null, uidNow = null, handlers = {};

export function initSync(h) {
  handlers = h;
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      experimentalAutoDetectLongPolling: true
    });
  } catch (e) {
    db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  }
  onAuthStateChanged(auth, (user) => {
    if (unsub) { unsub(); unsub = null; }
    uidNow = user ? user.uid : null;
    handlers.onUser && handlers.onUser(user ? { email: user.email, uid: user.uid } : null);
    if (user) listen(user.uid);
  });
}

function listen(uid) {
  const col = collection(db, 'users', uid, 'trips');
  unsub = onSnapshot(col, { includeMetadataChanges: true }, (snap) => {
    const m = snap.metadata;
    handlers.onStatus && handlers.onStatus(m.hasPendingWrites ? 'saving' : (m.fromCache ? 'offline' : 'ok'));
    snap.docChanges().forEach((ch) => {
      if (ch.doc.metadata.hasPendingWrites) return; // eigener, noch nicht bestätigter Stand
      if (ch.type === 'removed') handlers.onRemove && handlers.onRemove(ch.doc.id);
      else handlers.onTrip && handlers.onTrip(ch.doc.id, ch.doc.data());
    });
    handlers.onSnapshotDone && handlers.onSnapshotDone(snap.docs.map((d) => d.id), m.fromCache);
  }, (err) => {
    handlers.onStatus && handlers.onStatus('err', err && err.code);
  });
}

export const isOnline = () => !!uidNow;

export function pushTrip(id, data) {
  if (!uidNow) return Promise.resolve(false);
  return setDoc(doc(db, 'users', uidNow, 'trips', id), data).then(() => true);
}
export function removeTrip(id) {
  if (!uidNow) return Promise.resolve(false);
  return deleteDoc(doc(db, 'users', uidNow, 'trips', id)).then(() => true);
}
export const login = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
export const logout = () => signOut(auth);
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);

/* Verständliche Fehlermeldungen */
export function authMessage(e) {
  const c = (e && e.code) || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'E-Mail oder Passwort stimmt nicht.';
  if (c.includes('invalid-email')) return 'Das ist keine gültige E-Mail-Adresse.';
  if (c.includes('too-many-requests')) return 'Zu viele Versuche. Bitte kurz warten und noch einmal probieren.';
  if (c.includes('network')) return 'Keine Verbindung. Bitte Internet prüfen.';
  if (c.includes('user-disabled')) return 'Dieses Konto ist gesperrt.';
  return 'Anmeldung fehlgeschlagen' + (c ? ' (' + c + ')' : '') + '.';
}
