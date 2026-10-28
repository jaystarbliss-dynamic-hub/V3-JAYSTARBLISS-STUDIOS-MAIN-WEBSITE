#!/usr/bin/env node
/**
 * Complete Firestore Database Cloner for Jaystarbliss Studios
 *
 * Clones all collections, documents, and nested subcollections (e.g. jdiExams/events,
 * jdiExams/questions, users, schools, students, individualStudents, jdiExamAttempts,
 * classSchedules, settings, documentHeaders, etc.) from the source database to a target
 * database in the same Firebase project.
 *
 * Usage:
 *   SOURCE_DB="ai-studio-jaystarblissdyna-085e16ac-52ee-43ae-9c0c-52f6db7f8f7c" \
 *   TARGET_DB="(default)" \
 *   node scripts/clone-firestore-database.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SOURCE_DB_ID =
  process.env.SOURCE_DB ||
  'ai-studio-jaystarblissdyna-085e16ac-52ee-43ae-9c0c-52f6db7f8f7c';
const TARGET_DB_ID = process.env.TARGET_DB || '(default)';

const CORE_COLLECTIONS = [
  'users',
  'schools',
  'students',
  'individualStudents',
  'jdiExams',
  'schoolExams',
  'jdiExamAttempts',
  'jdiNotifications',
  'notifications',
  'classSchedules',
  'portalAccessSessions',
  'documentHeaders',
  'settings',
  'programs',
  'tracks',
  'courses',
  'assignments',
  'submissions',
  'attendance',
  'billing',
  'invoices',
  'payments',
  'agreements',
  'invites',
  'staff',
  'tutors',
  'parents',
];

function loadCredentials() {
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    }
  }

  const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (gacPath && existsSync(gacPath)) {
    return JSON.parse(readFileSync(gacPath, 'utf8'));
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || 'jaystarbliss-studios';
  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawPrivateKey =
    process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (clientEmail && rawPrivateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: rawPrivateKey.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

async function copyCollectionRecursive(sourceDb, targetDb, collectionPath, stats) {
  const sourceCol = sourceDb.collection(collectionPath);
  const snap = await sourceCol.get();

  if (snap.empty) return;

  console.log(`  • Copying ${snap.size} document(s) in [${collectionPath}]...`);

  const batchSize = 400;
  let batch = targetDb.batch();
  let countInBatch = 0;

  for (const docSnap of snap.docs) {
    const targetDocRef = targetDb.collection(collectionPath).doc(docSnap.id);
    batch.set(targetDocRef, docSnap.data(), { merge: true });
    countInBatch++;
    stats.documentsCopied++;

    if (countInBatch >= batchSize) {
      await batch.commit();
      batch = targetDb.batch();
      countInBatch = 0;
    }

    // Copy any nested subcollections under this document
    const subcollections = await docSnap.ref.listCollections();
    for (const subCol of subcollections) {
      await copyCollectionRecursive(
        sourceDb,
        targetDb,
        `${collectionPath}/${docSnap.id}/${subCol.id}`,
        stats
      );
    }
  }

  if (countInBatch > 0) {
    await batch.commit();
  }
}

async function main() {
  console.log('==============================================================');
  console.log(' Jaystarbliss Studios — Firestore Database Clone Utility');
  console.log(` Source Database : ${SOURCE_DB_ID}`);
  console.log(` Target Database : ${TARGET_DB_ID}`);
  console.log('==============================================================');

  const creds = loadCredentials();
  const app =
    getApps().length > 0
      ? getApps()[0]
      : creds
      ? initializeApp({
          credential: cert({
            projectId: creds.project_id || 'jaystarbliss-studios',
            clientEmail: creds.client_email,
            privateKey: creds.private_key,
          }),
        })
      : initializeApp({ projectId: 'jaystarbliss-studios' });

  const sourceDb =
    SOURCE_DB_ID === '(default)'
      ? getFirestore(app)
      : getFirestore(app, SOURCE_DB_ID);
  const targetDb =
    TARGET_DB_ID === '(default)'
      ? getFirestore(app)
      : getFirestore(app, TARGET_DB_ID);

  const stats = { collectionsScanned: 0, documentsCopied: 0 };

  // Discover all top-level collections dynamically (plus fallback CORE_COLLECTIONS)
  const collectionNames = new Set(CORE_COLLECTIONS);
  try {
    const rootCollections = await sourceDb.listCollections();
    for (const col of rootCollections) {
      collectionNames.add(col.id);
    }
  } catch (err) {
    console.warn('Could not list root collections dynamically; using known collection list:', err.message);
  }

  for (const colName of collectionNames) {
    stats.collectionsScanned++;
    try {
      await copyCollectionRecursive(sourceDb, targetDb, colName, stats);
    } catch (err) {
      console.error(`  ! Error copying collection [${colName}]:`, err.message || err);
      if (String(err.message || '').includes('Quota exceeded')) {
        console.error(
          '\n[QUOTA BLOCKED]: Firestore rejected the read from the source database because ' +
            'the AI Shared Quota daily read limit is currently exhausted.\n' +
            'To immediately lift the AI Shared Quota cap on this database without waiting for tomorrow:\n' +
            'Open: https://console.firebase.google.com/project/jaystarbliss-studios/firestore/databases/ai-studio-jaystarblissdyna-085e16ac-52ee-43ae-9c0c-52f6db7f8f7c/data?openUpgradeDialog=true'
        );
        process.exit(1);
      }
    }
  }

  console.log('\n==============================================================');
  console.log(` Clone Complete! Copied ${stats.documentsCopied} document(s).`);
  console.log('==============================================================');
}

main().catch((err) => {
  console.error('Fatal clone error:', err);
  process.exit(1);
});
