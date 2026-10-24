import { getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  setLogLevel,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';

// Suppress internal @firebase/firestore WebChannel 10s network timeout console.error logs
// on constrained/proxied connections so the client smoothly operates in offline/long-polling mode.
setLogLevel('silent');

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

function createResilientFirestore(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createResilientFirestore();
export const auth = getAuth(app);

// Google Workspace OAuth scopes (merged & configured via set_up_oauth)
export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const googleProvider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  googleProvider.addScope(scope);
}

// In-memory OAuth access token cache (never stored in localStorage or sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Boot-time Firestore connectivity check (non-blocking on constrained/offline networks)
async function testConnection() {
  try {
    if (!firebaseConfig.projectId || !firebaseConfig.firestoreDatabaseId) {
      console.warn('Firebase configuration is incomplete.');
      return;
    }
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.info('Firestore operating in offline-resilient mode for current network.');
    }
  }
}
void testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  if (
    errMsg.toLowerCase().includes('permission') ||
    errMsg.toLowerCase().includes('insufficient')
  ) {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  } else {
    console.warn('Firestore Network/Operation Notice: ', JSON.stringify(errInfo));
  }
  throw new Error(JSON.stringify(errInfo));
}

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      if (!isSigningIn) {
        cachedAccessToken = null;
      }
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string | null }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken || null;

    // Ensure UserProfile document exists in Firestore
    if (result.user) {
      const uid = result.user.uid;
      const profilePath = `users/${uid}`;
      try {
        await setDoc(
          doc(db, 'users', uid),
          {
            uid: uid.slice(0, 128),
            displayName: (result.user.displayName || 'Tirazis Customer').slice(0, 100),
            preferredLocale: 'fa',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: false }
        );
      } catch {
        // Profile may already exist; ignore create collision on sign-in
      }
    }

    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// Blueprint-synchronized validation constants
export const BLUEPRINT_CONSTRAINTS = {
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  MAX_ID_LENGTH: 128,
  MAX_BUILD_TITLE_LENGTH: 120,
  MAX_SLUG_LENGTH: 120,
};

export interface SavedPcBuildDoc {
  id: string;
  ownerId: string;
  title: string;
  cpuSlug: string;
  motherboardSlug: string;
  gpuSlug: string;
  ramSlug: string;
  storageSlug: string;
  psuSlug: string;
  caseSlug: string;
  coolerSlug: string;
  estimatedWattage: number;
  compatibilityStatus: 'compatible' | 'warning' | 'incompatible' | 'unverified';
  totalPriceIrr: number;
  driveFileId?: string;
}

export async function savePcBuildToFirestore(input: Omit<SavedPcBuildDoc, 'id' | 'ownerId'>): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required to save PC build');
  }
  const buildId = `build_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`.replace(
    /[^a-zA-Z0-9_\-]/g,
    ''
  );
  const path = `pcBuilds/${buildId}`;

  const payload: Record<string, any> = {
    ownerId: user.uid.slice(0, BLUEPRINT_CONSTRAINTS.MAX_ID_LENGTH),
    title: (input.title || 'Custom Tirazis Workstation').slice(0, BLUEPRINT_CONSTRAINTS.MAX_BUILD_TITLE_LENGTH),
    cpuSlug: (input.cpuSlug || '').slice(0, BLUEPRINT_CONSTRAINTS.MAX_SLUG_LENGTH),
    motherboardSlug: (input.motherboardSlug || '').slice(0, BLUEPRINT_CONSTRAINTS.MAX_SLUG_LENGTH),
    gpuSlug: (input.gpuSlug || '').slice(0, BLUEPRINT_CONSTRAINTS.MAX_SLUG_LENGTH),
    ramSlug: (input.ramSlug || '').slice(0, BLUEPRINT_CONSTRAINTS.MAX_SLUG_LENGTH),
    storageSlug: (input.storageSlug || '').slice(0, BLUEPRINT_CONSTRAINTS.MAX_SLUG_LENGTH),
    psuSlug: (input.psuSlug || '').slice(0, BLUEPRINT_CONSTRAINTS.MAX_SLUG_LENGTH),
    caseSlug: (input.caseSlug || '').slice(0, BLUEPRINT_CONSTRAINTS.MAX_SLUG_LENGTH),
    coolerSlug: (input.coolerSlug || '').slice(0, BLUEPRINT_CONSTRAINTS.MAX_SLUG_LENGTH),
    estimatedWattage: Math.max(0, Math.min(5000, Number(input.estimatedWattage) || 0)),
    compatibilityStatus: input.compatibilityStatus,
    totalPriceIrr: Math.max(0, Number(input.totalPriceIrr) || 0),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.driveFileId) {
    payload.driveFileId = input.driveFileId.slice(0, 128);
  }

  try {
    await setDoc(doc(db, 'pcBuilds', buildId), payload);
    return buildId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeToUserPcBuilds(
  userId: string,
  onUpdate: (builds: SavedPcBuildDoc[]) => void
) {
  const path = 'pcBuilds';
  const q = query(collection(db, 'pcBuilds'), where('ownerId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: SavedPcBuildDoc[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SavedPcBuildDoc, 'id'>),
      }));
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function deletePcBuildFromFirestore(buildId: string): Promise<void> {
  const path = `pcBuilds/${buildId}`;
  try {
    await deleteDoc(doc(db, 'pcBuilds', buildId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// Price Drop Notification Requests (/users/{userId}/priceDropAlerts/{alertId})
// ============================================================================

export interface PriceDropAlertDoc {
  id: string;
  userId: string;
  productSlug: string;
  productName: string;
  email: string;
  currentPriceIrr: number;
  status: 'active' | 'triggered' | 'cancelled';
}

export function buildPriceDropAlertId(productSlug: string): string {
  const cleaned = productSlug.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 110);
  return `alert_${cleaned || 'item'}`;
}

export async function savePriceDropAlertToFirestore(input: {
  productSlug: string;
  productName: string;
  email: string;
  currentPriceIrr: number;
}): Promise<PriceDropAlertDoc> {
  const user = auth.currentUser;
  const sanitizedEmail = input.email.trim().slice(0, 254);
  const sanitizedSlug = input.productSlug.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, BLUEPRINT_CONSTRAINTS.MAX_SLUG_LENGTH);
  const sanitizedName = (input.productName || sanitizedSlug).trim().slice(0, 200);
  const sanitizedPrice = Math.max(0, Number(input.currentPriceIrr) || 0);
  const alertId = buildPriceDropAlertId(sanitizedSlug);

  if (!user) {
    throw new Error('AUTH_REQUIRED_FOR_CLOUD_SYNC');
  }

  const uid = user.uid.slice(0, BLUEPRINT_CONSTRAINTS.MAX_ID_LENGTH);
  const userProfilePath = `users/${uid}`;

  // Ensure parent user profile document exists for Pillar 1 Master Gate relational check
  try {
    await setDoc(
      doc(db, 'users', uid),
      {
        uid,
        displayName: (user.displayName || user.email || 'Tirazis Customer').slice(0, 100),
        preferredLocale: 'fa',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: false }
    );
  } catch {
    // User profile already exists or offline mode active
  }

  const path = `${userProfilePath}/priceDropAlerts/${alertId}`;
  const payload = {
    userId: uid,
    productSlug: sanitizedSlug,
    productName: sanitizedName,
    email: sanitizedEmail,
    currentPriceIrr: sanitizedPrice,
    status: 'active' as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'users', uid, 'priceDropAlerts', alertId), payload);
    return {
      id: alertId,
      userId: uid,
      productSlug: sanitizedSlug,
      productName: sanitizedName,
      email: sanitizedEmail,
      currentPriceIrr: sanitizedPrice,
      status: 'active',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeToUserPriceDropAlerts(
  userId: string,
  onUpdate: (alerts: PriceDropAlertDoc[]) => void
) {
  const path = `users/${userId}/priceDropAlerts`;
  const q = query(
    collection(db, 'users', userId, 'priceDropAlerts'),
    where('userId', '==', userId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items: PriceDropAlertDoc[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<PriceDropAlertDoc, 'id'>),
      }));
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function deletePriceDropAlertFromFirestore(productSlug: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid.slice(0, BLUEPRINT_CONSTRAINTS.MAX_ID_LENGTH);
  const alertId = buildPriceDropAlertId(productSlug);
  const path = `users/${uid}/priceDropAlerts/${alertId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'priceDropAlerts', alertId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}


// ============================================================================
// Google Drive Workspace Integration (Client-Side Bearer Token)
// ============================================================================

export interface DriveFileRecord {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  createdTime?: string;
}

export async function listDriveBuildFiles(): Promise<DriveFileRecord[]> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('NEEDS_GOOGLE_DRIVE_AUTH');
  }
  const q = encodeURIComponent("trashed = false and name contains 'Tirazis'");
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,webViewLink,createdTime)&pageSize=15`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Google Drive API returned ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

export async function exportBuildToGoogleDrive(
  title: string,
  manifestObject: Record<string, any>
): Promise<DriveFileRecord> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('NEEDS_GOOGLE_DRIVE_AUTH');
  }

  const metadata = {
    name: `Tirazis-PC-Build-${title.replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '-')}.json`,
    mimeType: 'application/json',
  };

  const boundary = 'tirazis_drive_multipart_boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(manifestObject, null, 2) +
    closeDelimiter;

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,createdTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to upload build to Google Drive (${res.status}): ${errText.slice(0, 180)}`);
  }

  return res.json();
}

export async function deleteDriveBuildFile(fileId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('NEEDS_GOOGLE_DRIVE_AUTH');
  }
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to delete Google Drive file (${res.status})`);
  }
}
