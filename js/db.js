// ============================================================
// Stockage local — IndexedDB uniquement. Aucune donnée ne quitte
// l'appareil sauf action explicite de l'utilisateur (export JSON).
// ============================================================

const DB_NAME = "moncarnet-db";
const DB_VERSION = 1;

const STORE_RECIPES = "recipes";
const STORE_WEEK = "weekMenu"; // clé = date "YYYY-MM-DD"
const STORE_SETTINGS = "settings"; // clé = string

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_RECIPES)) {
        const store = db.createObjectStore(STORE_RECIPES, { keyPath: "id" });
        store.createIndex("byUpdatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_WEEK)) {
        db.createObjectStore(STORE_WEEK, { keyPath: "date" });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function wrapRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------- Recettes ----------------

export async function getAllRecipes() {
  const store = await tx(STORE_RECIPES, "readonly");
  const all = await wrapRequest(store.getAll());
  return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function getRecipe(id) {
  const store = await tx(STORE_RECIPES, "readonly");
  return wrapRequest(store.get(id));
}

export async function saveRecipe(recipe) {
  const now = Date.now();
  const toSave = {
    id: recipe.id || uid(),
    title: recipe.title || "Sans titre",
    tags: recipe.tags || [],
    ingredients: recipe.ingredients || [],
    steps: recipe.steps || [],
    image: recipe.image || null, // dataURL base64, stocké localement
    source: recipe.source || { type: "manual" },
    transcript: recipe.transcript || null,
    notes: recipe.notes || "",
    createdAt: recipe.createdAt || now,
    updatedAt: now,
  };
  const store = await tx(STORE_RECIPES, "readwrite");
  await wrapRequest(store.put(toSave));
  return toSave;
}

export async function deleteRecipe(id) {
  const store = await tx(STORE_RECIPES, "readwrite");
  await wrapRequest(store.delete(id));
  // Nettoyage : retirer cette recette du menu de la semaine si assignée
  const weekStore = await tx(STORE_WEEK, "readwrite");
  const all = await wrapRequest(weekStore.getAll());
  for (const entry of all) {
    if (entry.recipeId === id) {
      await wrapRequest(weekStore.delete(entry.date));
    }
  }
}

/** Liste unique de tous les ingrédients (noms) utilisés dans le carnet, triée alpha. */
export async function getAllIngredientNames() {
  const recipes = await getAllRecipes();
  const set = new Set();
  for (const r of recipes) {
    for (const ing of r.ingredients || []) {
      if (ing.name && ing.name.trim()) set.add(ing.name.trim());
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
}

/** Liste unique combinant étiquettes manuelles et noms d'ingrédients, pour la
 *  recherche/filtrage par #tag dans le livre de recettes. Dédoublonnée sans
 *  tenir compte de la casse (garde la première graphie rencontrée). */
export async function getAllSearchTags() {
  const recipes = await getAllRecipes();
  const seen = new Map(); // clé en minuscules -> graphie d'origine
  for (const r of recipes) {
    for (const t of r.tags || []) {
      const clean = String(t || "").trim();
      if (clean && !seen.has(clean.toLowerCase())) seen.set(clean.toLowerCase(), clean);
    }
    for (const ing of r.ingredients || []) {
      const clean = String(ing.name || "").trim();
      if (clean && !seen.has(clean.toLowerCase())) seen.set(clean.toLowerCase(), clean);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "fr"));
}

// ---------------- Menu de la semaine ----------------

/** entry: { date: "YYYY-MM-DD", recipeId } */
export async function setDayRecipe(date, recipeId) {
  const store = await tx(STORE_WEEK, "readwrite");
  if (!recipeId) {
    await wrapRequest(store.delete(date));
    return null;
  }
  const entry = { date, recipeId };
  await wrapRequest(store.put(entry));
  return entry;
}

export async function getWeekEntries(dates) {
  const store = await tx(STORE_WEEK, "readonly");
  const results = {};
  for (const d of dates) {
    const entry = await wrapRequest(store.get(d));
    if (entry) results[d] = entry.recipeId;
  }
  return results;
}

export async function getAllWeekEntries() {
  const store = await tx(STORE_WEEK, "readonly");
  return wrapRequest(store.getAll());
}

// ---------------- Réglages ----------------

export async function getSetting(key, fallback = null) {
  const store = await tx(STORE_SETTINGS, "readonly");
  const row = await wrapRequest(store.get(key));
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  const store = await tx(STORE_SETTINGS, "readwrite");
  await wrapRequest(store.put({ key, value }));
}

// ---------------- Export / Import complet ----------------

export async function exportAllData() {
  const recipes = await getAllRecipes();
  const week = await getAllWeekEntries();
  const settingsStore = await tx(STORE_SETTINGS, "readonly");
  const settings = await wrapRequest(settingsStore.getAll());
  return {
    app: "MonCarnet",
    exportedAt: new Date().toISOString(),
    dbVersion: DB_VERSION,
    recipes,
    weekMenu: week,
    settings,
  };
}

/** mode: "merge" (ajoute/écrase par id) ou "replace" (vide tout avant d'importer) */
export async function importAllData(data, mode = "merge") {
  if (!data || typeof data !== "object") throw new Error("Fichier invalide");

  if (mode === "replace") {
    const rs = await tx(STORE_RECIPES, "readwrite");
    await wrapRequest(rs.clear());
    const ws = await tx(STORE_WEEK, "readwrite");
    await wrapRequest(ws.clear());
  }

  const recipeStore = await tx(STORE_RECIPES, "readwrite");
  for (const r of data.recipes || []) {
    await wrapRequest(recipeStore.put(r));
  }

  const weekStore = await tx(STORE_WEEK, "readwrite");
  for (const w of data.weekMenu || []) {
    await wrapRequest(weekStore.put(w));
  }

  const settingsStore = await tx(STORE_SETTINGS, "readwrite");
  for (const s of data.settings || []) {
    await wrapRequest(settingsStore.put(s));
  }

  return {
    recipesCount: (data.recipes || []).length,
    weekCount: (data.weekMenu || []).length,
  };
}
