import { icon } from "../icons.js";
import { getAllRecipes, getWeekEntries, setDayRecipe } from "../db.js";
import { openSheet, toast } from "../ui.js";

const DOW_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DOW_LABELS_MON_FIRST = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=dim
  const diff = (day === 0 ? -6 : 1) - day; // ramène au lundi
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatMonthRange(startDate, endDate) {
  const opts = { day: "numeric", month: "long" };
  const startStr = startDate.toLocaleDateString("fr-FR", opts);
  const endStr = endDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return `${startStr} — ${endStr}`;
}

export async function renderWeek(main, { navigate, params }) {
  const refDate = params.ref ? new Date(params.ref) : new Date();
  const weekStart = startOfWeek(refDate);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(d);
  }
  const isoDates = days.map(toISODate);
  const todayISO = toISODate(new Date());

  const [entries, recipes] = await Promise.all([getWeekEntries(isoDates), getAllRecipes()]);
  const recipeById = Object.fromEntries(recipes.map((r) => [r.id, r]));

  const weekEnd = days[6];

  main.innerHTML = `
    <div class="week-nav">
      <button class="icon-btn" style="color:var(--color-primary)" data-nav="prev">${icon("back")}</button>
      <span class="week-label">${formatMonthRange(weekStart, weekEnd)}</span>
      <button class="icon-btn" style="color:var(--color-primary)" data-nav="next">${icon("chevron")}</button>
    </div>
    <div class="week-list">
      ${days
        .map((d, i) => {
          const iso = isoDates[i];
          const isToday = iso === todayISO;
          const recipeId = entries[iso];
          const recipe = recipeId ? recipeById[recipeId] : null;
          return `
          <button class="day-card ${isToday ? "is-today" : ""}" data-date="${iso}">
            <div class="day-date">
              <span class="dow">${DOW_LABELS_MON_FIRST[i]}</span>
              <span class="num">${d.getDate()}</span>
            </div>
            <div class="day-body">
              ${
                recipe
                  ? `<div class="assigned">
                      ${recipe.image ? `<img src="${recipe.image}" alt="">` : `<span class="placeholder-thumb">${icon("book")}</span>`}
                      <span class="recipe-name">${escapeHTML(recipe.title)}</span>
                    </div>`
                  : `<span class="empty-label">Aucune recette</span>`
              }
              <span class="chevron">${icon("chevron")}</span>
            </div>
          </button>`;
        })
        .join("")}
    </div>
  `;

  main.querySelector('[data-nav="prev"]').addEventListener("click", () => {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    navigate("week", { ref: prev.toISOString() });
  });
  main.querySelector('[data-nav="next"]').addEventListener("click", () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    navigate("week", { ref: next.toISOString() });
  });

  main.querySelectorAll("[data-date]").forEach((btn) => {
    btn.addEventListener("click", () => openDayPicker(btn.dataset.date, recipes, recipeById[entries[btn.dataset.date]], () => {
      renderWeek(main, { navigate, params });
    }));
  });
}

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function openDayPicker(dateISO, recipes, currentRecipe, onDone) {
  const dateLabel = new Date(dateISO + "T00:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  });

  const listHTML = recipes.length
    ? recipes
        .map(
          (r) => `
        <button class="recipe-pick-item" data-id="${r.id}">
          ${r.image ? `<img src="${r.image}" alt="">` : `<span class="placeholder-thumb">${icon("book")}</span>`}
          <span>${escapeHTML(r.title)}</span>
        </button>`
        )
        .join("")
    : `<p style="padding:var(--space-3) 0;">Aucune recette dans votre bibliothèque pour le moment.</p>`;

  const { root, close } = openSheet(`
    <h3 style="text-transform:capitalize">${dateLabel}</h3>
    <p>Choisir une recette à associer à ce jour.</p>
    <div class="recipe-pick-list">${listHTML}</div>
    <div class="btn-row">
      ${currentRecipe ? `<button class="btn btn-outline" data-act="clear">Retirer la recette</button>` : `<button class="btn btn-outline" data-act="cancel">Annuler</button>`}
    </div>
  `);

  root.querySelectorAll("[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await setDayRecipe(dateISO, btn.dataset.id);
      close();
      toast("Recette ajoutée au menu");
      onDone();
    });
  });

  const clearBtn = root.querySelector('[data-act="clear"]');
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      await setDayRecipe(dateISO, null);
      close();
      toast("Jour libéré");
      onDone();
    });
  }
  const cancelBtn = root.querySelector('[data-act="cancel"]');
  if (cancelBtn) cancelBtn.addEventListener("click", close);
}
