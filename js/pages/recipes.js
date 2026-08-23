import { icon } from "../icons.js";
import { getAllRecipes, getAllSearchTags, getSetting, setSetting, RECIPE_CATEGORIES } from "../db.js";
import { escapeHTML } from "../ui.js";

// Palette de tranches de livres, façon fils de laine variés (cf. écusson cosy).
const SPINE_COLORS = ["#8C3A34", "#5B6B45", "#6B4423", "#3B4B63", "#7A4A61", "#4A5D4E", "#9C5B2E", "#5A3E63"];

function spineColorFor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return SPINE_COLORS[hash % SPINE_COLORS.length];
}

function bookSpineHTML(r) {
  return `
    <button class="book-spine" style="background:${spineColorFor(r.id)};" data-id="${r.id}" title="${escapeHTML(r.title)}">
      <span class="book-label"><span class="book-title">${escapeHTML(r.title)}</span></span>
    </button>`;
}

function byTitleAlpha(a, b) {
  return a.title.localeCompare(b.title, "fr");
}

// Toujours montrer au moins ce nombre d'étagères dans la bibliothèque
// principale, même si la collection est petite ou vide — pour garder le
// vrai effet "bibliothèque" plutôt qu'une seule étagère isolée. Un étage
// supplémentaire s'ajoute naturellement à mesure que la collection grandit.
const MIN_SHELVES = 5;
const MAX_SHELVES = 10;

/** Nombre d'étagères pour la bibliothèque principale, selon la taille de la
 *  collection (viser ~3-4 livres par étagère en moyenne une fois le minimum
 *  dépassé, avec de la variance : voir randomSizes ci-dessous). */
function shelfCountFor(total) {
  return Math.min(MAX_SHELVES, Math.max(MIN_SHELVES, Math.round(total / 3.5)));
}

/** Répartit un total en N tailles volontairement irrégulières (certaines
 *  peuvent être nulles), qui somment exactement au total. */
function randomSizes(total, shelfCount) {
  if (total === 0) return Array.from({ length: shelfCount }, () => 0);
  const weights = Array.from({ length: shelfCount }, () => Math.random());
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const sizes = weights.map((w) => Math.floor((w / totalWeight) * total));
  let remainder = total - sizes.reduce((a, b) => a + b, 0);
  while (remainder > 0) {
    sizes[Math.floor(Math.random() * shelfCount)]++;
    remainder--;
  }
  return sizes;
}

/** Découpe un tableau (déjà trié) en tranches consécutives selon des tailles
 *  données — préserve toujours l'ordre alphabétique global. */
function sliceBySizes(arr, sizes) {
  const chunks = [];
  let idx = 0;
  for (const size of sizes) {
    chunks.push(arr.slice(idx, idx + size));
    idx += size;
  }
  return chunks;
}

// Clé de réglage sous laquelle est mémorisée la répartition actuelle de la
// bibliothèque principale (rayon "Plat"), pour qu'elle reste fixe tant que
// l'ensemble des recettes de ce rayon ne change pas (ajout/suppression).
const SHELF_LAYOUT_SETTING_KEY = "platShelfLayout";
// Incrémenté quand l'algorithme de répartition change, pour invalider les
// dispositions déjà mémorisées avec l'ancienne logique.
const LAYOUT_VERSION = "v2";

/** Renvoie une répartition (tableau de tailles) stable pour la liste de
 *  recettes fournie : si elle a déjà été calculée pour exactement le même
 *  ensemble de recettes, la réutilise ; sinon en tire une nouvelle et la
 *  mémorise. */
async function getStableShelfSizes(platRecipes) {
  const signature = LAYOUT_VERSION + ":" + platRecipes.map((r) => r.id).sort().join(",");
  const stored = await getSetting(SHELF_LAYOUT_SETTING_KEY, null);
  if (stored && stored.signature === signature) {
    return stored.sizes;
  }
  const shelfCount = shelfCountFor(platRecipes.length);
  const sizes = randomSizes(platRecipes.length, shelfCount);
  await setSetting(SHELF_LAYOUT_SETTING_KEY, { signature, sizes });
  return sizes;
}

export async function renderRecipes(main, { navigate }) {
  const [allRecipes, searchTags] = await Promise.all([getAllRecipes(), getAllSearchTags()]);

  // Regroupe les recettes par rayon (pour les bibliothèques par catégorie) ;
  // les recettes sans catégorie connue (données anciennes) atterrissent dans
  // un rayon "Autres" ajouté au besoin.
  const byCategory = {};
  for (const c of RECIPE_CATEGORIES) byCategory[c.key] = [];
  const others = [];
  for (const r of allRecipes) {
    if (byCategory[r.category]) byCategory[r.category].push(r);
    else others.push(r);
  }
  // "Plat" est la bibliothèque principale par défaut : pas d'onglet dédié,
  // pour éviter la redondance avec "Bibliothèque principale".
  const categoryTabsList = RECIPE_CATEGORIES.filter((c) => c.key !== "plat");
  if (others.length) categoryTabsList.push({ key: "autre", label: "Autres" });
  if (others.length) byCategory.autre = others;

  let activeCategory = ""; // "" = bibliothèque principale (rayon "Plat" uniquement)
  let query = "";
  let activeTag = null;

  main.innerHTML = `
    <div class="shelf-toolbar">
      <div class="chip-row" id="category-tabs">
        <button class="chip active" data-cat="">Bibliothèque principale</button>
        ${categoryTabsList.map((c) => `<button class="chip" data-cat="${c.key}">${c.label}</button>`).join("")}
      </div>
      <button class="icon-btn" id="toggle-search-btn" style="color:var(--color-primary);" title="Rechercher par ingrédient ou étiquette">
        ${icon("search")}
      </button>
    </div>

    <div class="search-panel hidden" id="search-panel">
      <input class="search-input" type="text" placeholder="Filtrer par nom, ingrédient, étiquette..." id="search-input" />
      ${
        searchTags.length
          ? `<div class="chip-row" id="tag-filter-row">
              <button class="chip active" data-tag="">Tous les #tags</button>
              ${searchTags.map((t) => `<button class="chip" data-tag="${escapeHTML(t.toLowerCase())}">#${escapeHTML(t)}</button>`).join("")}
            </div>`
          : ""
      }
    </div>

    <div id="bookcase-container"></div>
  `;

  const container = main.querySelector("#bookcase-container");
  const categoryTabs = main.querySelector("#category-tabs");
  const searchPanel = main.querySelector("#search-panel");
  const searchInput = main.querySelector("#search-input");
  const tagFilterRow = main.querySelector("#tag-filter-row");

  function recipeMatchesSearch(r) {
    if (activeTag) {
      const hasTag = (r.tags || []).some((t) => String(t).toLowerCase() === activeTag);
      const hasIng = (r.ingredients || []).some((i) => String(i.name).toLowerCase() === activeTag);
      if (!hasTag && !hasIng) return false;
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const inTitle = r.title.toLowerCase().includes(q);
      const inTags = (r.tags || []).some((t) => t.toLowerCase().includes(q));
      const inIng = (r.ingredients || []).some((i) => i.name && i.name.toLowerCase().includes(q));
      if (!inTitle && !inTags && !inIng) return false;
    }
    return true;
  }

  function shelfSectionHTML(books, { plaque, emptyMessage } = {}) {
    return `
      <div class="shelf-section">
        ${plaque ? `<div class="shelf-plaque-row"><span class="shelf-plaque">${plaque}</span></div>` : ""}
        <div class="shelf-books ${plaque ? "wrap" : ""}">
          ${
            books.length
              ? books.map(bookSpineHTML).join("")
              : emptyMessage
              ? `<div class="shelf-empty">${emptyMessage}</div>`
              : ""
          }
        </div>
        <div class="shelf-plank"></div>
      </div>`;
  }

  async function draw() {
    let bookcaseHTML;

    if (!activeCategory) {
      // Bibliothèque principale : uniquement le rayon "Plat", toujours triée
      // par ordre alphabétique. Répartition irrégulière sur plusieurs
      // étagères (façon vraie bibliothèque, pas un rangement informatique
      // parfait) — mémorisée pour rester fixe tant que le rayon "Plat" ne
      // change pas (ajout ou suppression d'une recette).
      const fullPlat = byCategory.plat || [];
      const filtered = fullPlat.filter(recipeMatchesSearch).sort(byTitleAlpha);
      const isFiltering = !!(query.trim() || activeTag);
      const sizes = isFiltering
        ? randomSizes(filtered.length, shelfCountFor(filtered.length))
        : await getStableShelfSizes(fullPlat);
      const chunks = sliceBySizes(filtered, sizes);
      bookcaseHTML = `
        <div class="bookcase">
          ${chunks
            .map((chunk, i) =>
              shelfSectionHTML(chunk, {
                emptyMessage: i === 0 && filtered.length === 0
                  ? (isFiltering
                      ? "Aucune recette ne correspond à ta recherche."
                      : "Aucune recette dans \"Plat\" pour l'instant — touche le + pour en ajouter une.")
                  : null,
              })
            )
            .join("")}
        </div>`;
    } else {
      // Bibliothèque du rayon sélectionné : uniquement ses recettes, triées alpha.
      const shelf = categoryTabsList.find((c) => c.key === activeCategory);
      const filtered = (byCategory[shelf.key] || []).filter(recipeMatchesSearch).sort(byTitleAlpha);
      bookcaseHTML = `
        <div class="bookcase single-shelf">
          ${shelfSectionHTML(filtered, { plaque: shelf.label, emptyMessage: "Aucune recette dans ce rayon pour l'instant." })}
        </div>`;
    }

    container.innerHTML = bookcaseHTML;
    container.querySelectorAll("[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => navigate("recipe-detail", { id: btn.dataset.id }));
    });
  }

  categoryTabs.querySelectorAll("[data-cat]").forEach((chip) => {
    chip.addEventListener("click", async () => {
      activeCategory = chip.dataset.cat || "";
      categoryTabs.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      await draw();
    });
  });

  main.querySelector("#toggle-search-btn").addEventListener("click", () => {
    searchPanel.classList.toggle("hidden");
    if (!searchPanel.classList.contains("hidden")) searchInput.focus();
  });

  searchInput.addEventListener("input", async (e) => {
    query = e.target.value;
    await draw();
  });

  if (tagFilterRow) {
    tagFilterRow.querySelectorAll("[data-tag]").forEach((chip) => {
      chip.addEventListener("click", async () => {
        activeTag = chip.dataset.tag || null;
        tagFilterRow.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        await draw();
      });
    });
  }

  await draw();

  // FAB d'ajout
  const fab = document.createElement("button");
  fab.className = "fab";
  fab.innerHTML = icon("plus");
  fab.addEventListener("click", () => navigate("recipe-edit", { id: null }));
  main.appendChild(fab);
}
