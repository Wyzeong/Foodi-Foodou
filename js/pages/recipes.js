import { icon } from "../icons.js";
import { getAllRecipes, getAllSearchTags } from "../db.js";
import { escapeHTML } from "../ui.js";

export async function renderRecipes(main, { navigate }) {
  const [recipes, searchTags] = await Promise.all([getAllRecipes(), getAllSearchTags()]);

  let query = "";
  let activeTag = null; // en minuscules

  main.innerHTML = `
    <div class="toolbar">
      <input class="search-input" type="text" placeholder="Rechercher une recette..." id="search-input" />
    </div>
    ${
      searchTags.length
        ? `<div class="chip-row" id="chip-row">
            <button class="chip" data-tag="">Tous les #tags</button>
            ${searchTags.map((t) => `<button class="chip" data-tag="${escapeHTML(t.toLowerCase())}">#${escapeHTML(t)}</button>`).join("")}
          </div>`
        : ""
    }
    <div id="recipe-grid"></div>
  `;

  const grid = main.querySelector("#recipe-grid");
  const searchInput = main.querySelector("#search-input");
  const chipRow = main.querySelector("#chip-row");

  function recipeMatchesTag(r, tagLower) {
    if ((r.tags || []).some((t) => String(t).toLowerCase() === tagLower)) return true;
    if ((r.ingredients || []).some((i) => String(i.name).toLowerCase() === tagLower)) return true;
    return false;
  }

  function draw() {
    let filtered = recipes;
    if (activeTag) {
      filtered = filtered.filter((r) => recipeMatchesTag(r, activeTag));
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      filtered = filtered.filter((r) => {
        if (r.title.toLowerCase().includes(q)) return true;
        if ((r.tags || []).some((t) => t.toLowerCase().includes(q))) return true;
        return (r.ingredients || []).some((i) => i.name && i.name.toLowerCase().includes(q));
      });
    }

    if (!filtered.length) {
      grid.innerHTML = `
        <div class="empty-state">
          ${icon("book")}
          <p>${recipes.length ? "Aucune recette ne correspond." : "Votre carnet est vide pour l'instant.\nAjoutez votre première recette avec le bouton +."}</p>
        </div>`;
      return;
    }

    grid.innerHTML = `<div class="recipe-grid">
      ${filtered
        .map(
          (r) => `
        <button class="recipe-card" data-id="${r.id}">
          <div class="thumb">${r.image ? `<img src="${r.image}" alt="">` : icon("book")}</div>
          <div class="info">
            <h3>${escapeHTML(r.title)}</h3>
            <div class="meta">${(r.ingredients || []).length} ingrédient${(r.ingredients || []).length > 1 ? "s" : ""}</div>
          </div>
        </button>`
        )
        .join("")}
    </div>`;

    grid.querySelectorAll("[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => navigate("recipe-detail", { id: btn.dataset.id }));
    });
  }

  searchInput.addEventListener("input", (e) => {
    query = e.target.value;
    draw();
  });

  if (chipRow) {
    chipRow.querySelectorAll("[data-tag]").forEach((chip) => {
      chip.addEventListener("click", () => {
        activeTag = chip.dataset.tag || null;
        chipRow.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        draw();
      });
    });
    chipRow.querySelector('[data-tag=""]').classList.add("active");
  }

  draw();

  // FAB d'ajout
  const fab = document.createElement("button");
  fab.className = "fab";
  fab.innerHTML = icon("plus");
  fab.addEventListener("click", () => navigate("recipe-edit", { id: null }));
  main.appendChild(fab);
}
