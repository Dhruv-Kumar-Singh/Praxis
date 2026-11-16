/**
 * Firebase Admin SDK — single initialisation point.
 *
 * Uses firebase-admin v12+ named-export API (no monolithic default).
 *
 * Authentication strategy (in priority order):
 *
 *  1. FIREBASE_SERVICE_ACCOUNT_JSON  — full service-account JSON as a single
 *     env-var string (recommended for CI/CD, Render, Railway, etc.)
 *
 *  2. GOOGLE_APPLICATION_CREDENTIALS — path to a service-account JSON file on
 *     disk (Application Default Credentials — works locally and on GCP).
 *
 *  3. Database URL only — works ONLY when RTDB rules allow unauthenticated
 *     access. Development/testing only; never use in production.
 *
 * Database:
 *   Firebase Realtime Database: https://praxis-b8ea5-default-rtdb.firebaseio.com/
 *
 * Usage:
 *   import { db, auth } from '../config/firebase.js';
 *   const snap = await db.ref('users/abc123').get();
 */

import {
  initializeApp,
  getApps,
  cert,
  applicationDefault,
} from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getAuth } from 'firebase-admin/auth';
import { env } from './env.js';

const databaseURL = env.FIREBASE_DATABASE_URL;

function buildApp() {
  // Guard against double-init in --watch / hot-reload scenarios
  if (getApps().length > 0) return getApps()[0];

  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    // Strategy 1: inline JSON string in env-var
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON. ' +
        'Ensure the full service-account.json is provided as a single-line JSON string.',
      );
    }
    return initializeApp({ credential: cert(serviceAccount), databaseURL });
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Strategy 2: Application Default Credentials (file path)
    return initializeApp({ credential: applicationDefault(), databaseURL });
  }

  // Strategy 3: no credentials — RTDB rules must allow unauthenticated access
  return initializeApp({ databaseURL });
}

const firebaseApp = buildApp();

/**
 * Firebase Realtime Database root reference.
 * All repository adapters import this.
 * @type {import('firebase-admin/database').Database}
 */
export const db = getDatabase(firebaseApp);

/**
 * Firebase Admin Auth instance.
 * @type {import('firebase-admin/auth').Auth}
 */
export const auth = getAuth(firebaseApp);

export { firebaseApp };
