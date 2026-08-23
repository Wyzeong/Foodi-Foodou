// ============================================================
// Intégration Google Drive — sauvegarde/restauration des données.
//
// Utilise Google Identity Services (GIS) côté client uniquement
// (aucun backend nécessaire). Scope demandé : drive.file, qui ne
// donne accès qu'aux fichiers créés par cette app elle-même — pas
// à l'ensemble du Drive de l'utilisateur.
//
// Le script GIS n'est chargé qu'à la demande (clic sur "Connecter"),
// jamais au chargement de l'app : conforme à la contrainte
// "Internet uniquement pour des services ponctuels et non bloquants".
// ============================================================

import { getSetting, setSetting } from "./db.js";

const CLIENT_ID = "505509850744-cjj8ed7a710a856utr8s12ps7rp0ari5.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const BACKUP_FILENAME = "foodi-foodou-sauvegarde.json";
const TOKEN_SETTING_KEY = "googleDriveToken";

let tokenClient = null;
let gisLoadingPromise = null;
let memoryToken = null; // { access_token, expires_at }

function loadGisScript() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if (gisLoadingPromise) return gisLoadingPromise;
  gisLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Impossible de charger le service Google (vérifie ta connexion)"));
    document.head.appendChild(script);
  });
  return gisLoadingPromise;
}

function ensureTokenClient() {
  if (tokenClient) return tokenClient;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: () => {}, // remplacé à chaque appel
  });
  return tokenClient;
}

async function restoreTokenFromStorage() {
  if (memoryToken && memoryToken.expires_at > Date.now() + 30000) return memoryToken;
  const stored = await getSetting(TOKEN_SETTING_KEY, null);
  if (stored && stored.expires_at > Date.now() + 30000) {
    memoryToken = stored;
    return stored;
  }
  return null;
}

async function persistToken(tokenResponse) {
  const token = {
    access_token: tokenResponse.access_token,
    expires_at: Date.now() + (Number(tokenResponse.expires_in) || 3600) * 1000,
  };
  memoryToken = token;
  await setSetting(TOKEN_SETTING_KEY, token);
  return token;
}

/** Ouvre la fenêtre de consentement Google (à appeler depuis un clic utilisateur). */
export async function connect() {
  await loadGisScript();
  const client = ensureTokenClient();
  return new Promise((resolve, reject) => {
    client.callback = async (resp) => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      const token = await persistToken(resp);
      resolve(token);
    };
    try {
      client.requestAccessToken({ prompt: "consent" });
    } catch (e) {
      reject(e);
    }
  });
}

/** Tente un renouvellement silencieux du token (sans popup) si besoin. */
async function getValidToken() {
  const existing = await restoreTokenFromStorage();
  if (existing) return existing;
  return null;
}

export async function isConnected() {
  return !!(await restoreTokenFromStorage());
}

export async function disconnect() {
  const t = await restoreTokenFromStorage();
  memoryToken = null;
  await setSetting(TOKEN_SETTING_KEY, null);
  if (t && window.google?.accounts?.oauth2?.revoke) {
    try { window.google.accounts.oauth2.revoke(t.access_token, () => {}); } catch { /* ignore */ }
  }
}

async function driveFetch(url, options = {}) {
  const token = await getValidToken();
  if (!token) throw new Error("NOT_CONNECTED");
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token.access_token}` },
  });
  if (res.status === 401) {
    // Token expiré/révoqué côté Google : on efface l'état local pour forcer une reconnexion propre.
    memoryToken = null;
    await setSetting(TOKEN_SETTING_KEY, null);
    throw new Error("NOT_CONNECTED");
  }
  return res;
}

async function findBackupFile() {
  const q = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`);
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,modifiedTime)`);
  if (!res.ok) throw new Error(`Erreur Google Drive (${res.status})`);
  const data = await res.json();
  return (data.files && data.files[0]) || null;
}

/** Crée ou met à jour le fichier de sauvegarde sur le Drive de l'utilisateur. */
export async function uploadBackup(jsonString) {
  const existing = await findBackupFile();

  if (existing) {
    const res = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: jsonString,
    });
    if (!res.ok) throw new Error(`Échec de la mise à jour (${res.status})`);
    return { updated: true };
  }

  const boundary = "foodifoodou" + Date.now();
  const metadata = { name: BACKUP_FILENAME, mimeType: "application/json" };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonString}\r\n--${boundary}--`;

  const res = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Échec de la création (${res.status})`);
  return { updated: false };
}

/** Récupère et parse le fichier de sauvegarde depuis le Drive de l'utilisateur. */
export async function downloadBackup() {
  const existing = await findBackupFile();
  if (!existing) throw new Error("NOT_FOUND");
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`);
  if (!res.ok) throw new Error(`Échec du téléchargement (${res.status})`);
  return res.json();
}

/** Infos sur la sauvegarde existante (pour affichage), ou null si aucune / non connecté. */
export async function getBackupInfo() {
  try {
    return await findBackupFile();
  } catch {
    return null;
  }
}
