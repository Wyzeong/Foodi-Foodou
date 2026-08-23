import { icon } from "../icons.js";
import { getAllRecipes, getAllSearchTags, RECIPE_CATEGORIES } from "../db.js";
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

export async function renderRecipes(main, { navigate }) {
  const [recipes, searchTags] = await Promise.all([getAllRecipes(), getAllSearchTags()]);

  // Regroupe les recettes par rayon ; les recettes sans catégorie connue
  // (données anciennes) atterrissent dans un rayon "Autres" ajouté au besoin.
  const byCategory = {};
  for (const c of RECIPE_CATEGORIES) byCategory[c.key] = [];
  const others = [];
  for (const r of recipes) {
    if (byCategory[r.category]) byCategory[r.category].push(r);
    else others.push(r);
  }
  const shelves = [...RECIPE_CATEGORIES];
  if (others.length) shelves.push({ key: "autre", label: "Autres" });
  if (others.length) byCategory.autre = others;

  let activeCategory = ""; // "" = toutes les étagères
  let query = "";
  let activeTag = null;

  main.innerHTML = `
    <div class="shelf-toolbar">
      <div class="chip-row" id="category-tabs">
        <button class="chip active" data-cat="">Toute la bibliothèque</button>
        ${shelves.map((c) => `<button class="chip" data-cat="${c.key}">${c.label}</button>`).join("")}
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

  function draw() {
    const shelvesToShow = activeCategory ? shelves.filter((s) => s.key === activeCategory) : shelves;
    const isSingle = !!activeCategory;

    container.innerHTML = `
      <div class="bookcase ${isSingle ? "single-shelf" : ""}">
        ${shelvesToShow
          .map((shelf) => {
            const shelfRecipes = (byCategory[shelf.key] || []).filter(recipeMatchesSearch);
            return `
            <div class="shelf-section">
              <div class="shelf-plaque-row"><span class="shelf-plaque">${shelf.label}</span></div>
              <div class="shelf-books ${isSingle ? "wrap" : ""}">
                ${
                  shelfRecipes.length
                    ? shelfRecipes.map(bookSpineHTML).join("")
                    : `<div class="shelf-empty">Aucune recette dans ce rayon${activeCategory || query || activeTag ? " (ou filtrée)" : ""} pour l'instant.</div>`
                }
              </div>
              <div class="shelf-plank"></div>
            </div>`;
          })
          .join("")}
      </div>
    `;

    container.querySelectorAll("[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => navigate("recipe-detail", { id: btn.dataset.id }));
    });
  }

  categoryTabs.querySelectorAll("[data-cat]").forEach((chip) => {
    chip.addEventListener("click", () => {
      activeCategory = chip.dataset.cat || "";
      categoryTabs.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      draw();
    });
  });

  main.querySelector("#toggle-search-btn").addEventListener("click", () => {
    searchPanel.classList.toggle("hidden");
    if (!searchPanel.classList.contains("hidden")) searchInput.focus();
  });

  searchInput.addEventListener("input", (e) => {
    query = e.target.value;
    draw();
  });

  if (tagFilterRow) {
    tagFilterRow.querySelectorAll("[data-tag]").forEach((chip) => {
      chip.addEventListener("click", () => {
        activeTag = chip.dataset.tag || null;
        tagFilterRow.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        draw();
      });
    });
  }

  draw();

  // FAB d'ajout
  const fab = document.createElement("button");
  fab.className = "fab";
  fab.innerHTML = icon("plus");
  fab.addEventListener("click", () => navigate("recipe-edit", { id: null }));
  main.appendChild(fab);
}
