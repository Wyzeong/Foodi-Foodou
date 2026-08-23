import { icon } from "../icons.js";
import { getAllRecipes, getAllSearchTags, getWeekEntries, setMealSlot } from "../db.js";
import { openSheet, confirmSheet, toast, pluralizeUnit } from "../ui.js";

const DOW_LABELS_MON_FIRST = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const SLOT_LABELS = { midi: "Midi", soir: "Soir" };

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

function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

function formatMonthRange(startDate, endDate) {
  const opts = { day: "numeric", month: "long" };
  const startStr = startDate.toLocaleDateString("fr-FR", opts);
  const endStr = endDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return `${startStr} — ${endStr}`;
}

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function mealContent(meal, recipeById) {
  if (!meal) return `<span class="empty-label">Libre</span>`;
  const leftoverTag = meal.leftover ? `<span class="leftover-tag">restes</span>` : "";
  if (meal.type === "recipe") {
    const r = recipeById[meal.recipeId];
    if (!r) return `<span class="empty-label">Recette supprimée</span>`;
    return `<span class="assigned">
        ${r.image ? `<img src="${r.image}" alt="">` : `<span class="placeholder-thumb">${icon("book")}</span>`}
        <span class="recipe-name">${escapeHTML(r.title)}</span>
        ${leftoverTag}
      </span>`;
  }
  if (meal.type === "custom") {
    return `<span class="assigned">
        <span class="placeholder-thumb">${icon("edit")}</span>
        <span class="recipe-name">${escapeHTML(meal.label)}</span>
        ${leftoverTag}
      </span>`;
  }
  return `<span class="empty-label">Libre</span>`;
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

  const [entries, recipes, searchTags] = await Promise.all([getWeekEntries(isoDates), getAllRecipes(), getAllSearchTags()]);
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
          const entry = entries[iso] || { midi: null, soir: null };
          return `
          <div class="day-card ${isToday ? "is-today" : ""}">
            <div class="day-date">
              <span class="dow">${DOW_LABELS_MON_FIRST[i]}</span>
              <span class="num">${d.getDate()}</span>
            </div>
            <div class="day-body">
              <button class="meal-row" data-date="${iso}" data-slot="midi">
                <span class="meal-label">Midi</span>
                ${mealContent(entry.midi, recipeById)}
                <span class="chevron">${icon("chevron")}</span>
              </button>
              <button class="meal-row" data-date="${iso}" data-slot="soir">
                <span class="meal-label">Soir</span>
                ${mealContent(entry.soir, recipeById)}
                <span class="chevron">${icon("chevron")}</span>
              </button>
            </div>
          </div>`;
        })
        .join("")}
    </div>

    <button class="btn btn-accent btn-block" id="extract-list-btn" style="margin-top:var(--space-5);">
      ${icon("cart")} Extraire les ingrédients nécessaires
    </button>
  `;

  function rerender() {
    renderWeek(main, { navigate, params });
  }

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

  main.querySelectorAll(".meal-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      const date = btn.dataset.date;
      const slot = btn.dataset.slot;
      const currentEntry = entries[date] || { midi: null, soir: null };
      openMealPicker({ date, slot, currentMeal: currentEntry[slot], recipes, recipeById, searchTags, onDone: rerender });
    });
  });

  main.querySelector("#extract-list-btn").addEventListener("click", () => {
    const list = buildShoppingList(isoDates, entries, recipeById);
    showShoppingList(list);
  });
}

function openMealPicker({ date, slot, currentMeal, recipes, recipeById, searchTags, onDone }) {
  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  });

  function recipeListHTML(list) {
    return list.length
      ? list
          .map(
            (r) => `
        <button class="recipe-pick-item" data-id="${r.id}">
          ${r.image ? `<img src="${r.image}" alt="">` : `<span class="placeholder-thumb">${icon("book")}</span>`}
          <span>${escapeHTML(r.title)}</span>
        </button>`
          )
          .join("")
      : `<p style="padding:var(--space-3) 0;color:var(--color-ink-muted);">Aucune recette ne correspond.</p>`;
  }

  const { root, close } = openSheet(`
    <h3 style="text-transform:capitalize">${SLOT_LABELS[slot]} — ${dateLabel}</h3>
    <p>Choisir une recette, ou saisir un menu libre sans recette.</p>

    <div class="field" style="margin-bottom:var(--space-2);">
      <input type="text" id="meal-search-input" class="search-input" style="width:100%;" placeholder="Rechercher par nom..." />
    </div>
    ${
      searchTags.length
        ? `<div class="field" style="margin-bottom:var(--space-2);">
            <select id="meal-tag-select">
              <option value="">Toutes les étiquettes</option>
              ${searchTags.map((t) => `<option value="${escapeHTML(t.toLowerCase())}">#${escapeHTML(t)}</option>`).join("")}
            </select>
          </div>`
        : ""
    }

    <div class="recipe-pick-list" id="recipe-pick-list">${recipeListHTML(recipes)}</div>

    <div class="field" style="margin-top:var(--space-2);">
      <label>Ou menu libre (sans recette)</label>
      <div class="repeat-row">
        <input type="text" id="custom-meal-input" placeholder="Ex : Coquillettes jambon" />
        <button class="btn btn-outline" id="custom-meal-btn" type="button" style="flex-shrink:0;">${icon("check")}</button>
      </div>
    </div>

    <div class="btn-row">
      ${currentMeal ? `<button class="btn btn-outline" data-act="clear">Retirer</button>` : `<button class="btn btn-outline" data-act="cancel">Annuler</button>`}
    </div>
  `);

  const listEl = root.querySelector("#recipe-pick-list");
  const searchInput = root.querySelector("#meal-search-input");
  const tagSelect = root.querySelector("#meal-tag-select");

  function wireRecipeButtons() {
    listEl.querySelectorAll("[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => commitMeal({ type: "recipe", recipeId: btn.dataset.id }));
    });
  }

  function refreshList() {
    const q = searchInput.value.trim().toLowerCase();
    const tag = tagSelect ? tagSelect.value : "";
    const filtered = recipes.filter((r) => {
      if (tag) {
        const hasTag = (r.tags || []).some((t) => String(t).toLowerCase() === tag);
        const hasIng = (r.ingredients || []).some((i) => String(i.name).toLowerCase() === tag);
        if (!hasTag && !hasIng) return false;
      }
      if (q && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
    listEl.innerHTML = recipeListHTML(filtered);
    wireRecipeButtons();
  }

  wireRecipeButtons();
  searchInput.addEventListener("input", refreshList);
  if (tagSelect) tagSelect.addEventListener("change", refreshList);

  async function commitMeal(meal) {
    await setMealSlot(date, slot, meal);
    close();
    toast(slot === "midi" ? "Menu de midi mis à jour" : "Menu du soir mis à jour");

    if (slot === "soir") {
      await maybeProposeTomorrowLunch(date, meal);
    }
    onDone();
  }

  root.querySelector("#custom-meal-btn").addEventListener("click", () => {
    const label = root.querySelector("#custom-meal-input").value.trim();
    if (!label) { toast("Saisis un nom de menu"); return; }
    commitMeal({ type: "custom", label });
  });
  root.querySelector("#custom-meal-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") root.querySelector("#custom-meal-btn").click();
  });

  const clearBtn = root.querySelector('[data-act="clear"]');
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      await setMealSlot(date, slot, null);
      close();
      toast("Créneau libéré");
      onDone();
    });
  }
  const cancelBtn = root.querySelector('[data-act="cancel"]');
  if (cancelBtn) cancelBtn.addEventListener("click", close);
}

/** Après avoir programmé un menu du soir, propose de le reconduire le lendemain midi. */
async function maybeProposeTomorrowLunch(date, meal) {
  const tomorrow = addDays(date, 1);
  const tomorrowEntries = await getWeekEntries([tomorrow]);
  const existingLunch = tomorrowEntries[tomorrow]?.midi || null;
  const mealLabel = meal.type === "custom" ? meal.label : null;

  const tomorrowLabel = new Date(tomorrow + "T00:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  });

  const ok = await confirmSheet({
    title: "Reconduire ce menu demain midi ?",
    message: existingLunch
      ? `Un menu est déjà prévu demain midi (${tomorrowLabel}) — le proposer quand même le remplacera. Comptabilisé comme des restes, il ne sera pas recompté dans la liste de courses.`
      : `Mettre le même menu demain midi (${tomorrowLabel}) ? Comptabilisé comme des restes, il ne sera pas recompté dans la liste de courses.`,
    confirmLabel: "Oui, reconduire",
  });

  if (ok) {
    await setMealSlot(tomorrow, "midi", { ...meal, leftover: true });
    toast(`Menu reconduit pour demain midi${mealLabel ? " : " + mealLabel : ""}`);
  }
}

// ---------------- Liste de courses ----------------

function parseQty(q) {
  if (q === null || q === undefined) return NaN;
  const s = String(q).trim().replace(",", ".");
  if (!s) return NaN;
  return Number(s);
}

function buildShoppingList(isoDates, entries, recipeById) {
  const ingredientMap = new Map(); // clé: "nom|unité" (minuscules) -> { name, unit, quantities: [] }
  const missing = [];

  for (const iso of isoDates) {
    const entry = entries[iso];
    if (!entry) continue;
    for (const slot of ["midi", "soir"]) {
      const meal = entry[slot];
      if (!meal) continue;
      // Un repas reconduit automatiquement (restes du dîner de la veille) ne
      // représente pas une nouvelle quantité à acheter : on ne le recompte pas.
      if (meal.leftover) continue;

      if (meal.type === "recipe") {
        const r = recipeById[meal.recipeId];
        if (!r) continue;
        for (const ing of r.ingredients || []) {
          const name = (ing.name || "").trim();
          if (!name) continue;
          const unit = (ing.unit || "").trim();
          const key = name.toLowerCase() + "|" + unit.toLowerCase();
          if (!ingredientMap.has(key)) ingredientMap.set(key, { name, unit, quantities: [] });
          ingredientMap.get(key).quantities.push((ing.quantity || "").trim());
        }
      } else if (meal.type === "custom") {
        if (!missing.includes(meal.label)) missing.push(meal.label);
      }
    }
  }

  const items = Array.from(ingredientMap.values())
    .map((it) => {
      const nonEmpty = it.quantities.filter((q) => q !== "");
      const allNumeric = nonEmpty.length > 0 && nonEmpty.every((q) => !isNaN(parseQty(q)));
      let numericTotal = null;
      let rawDisplay = "";
      if (allNumeric && nonEmpty.length === it.quantities.length) {
        numericTotal = nonEmpty.reduce((acc, q) => acc + parseQty(q), 0);
      } else if (nonEmpty.length) {
        const unit = pluralizeUnit(it.unit, nonEmpty.length > 1 ? 2 : nonEmpty[0]);
        rawDisplay = [nonEmpty.join(" + "), unit].filter(Boolean).join(" ");
      } else {
        rawDisplay = it.unit;
      }
      return { name: it.name, unit: it.unit, numericTotal, rawDisplay };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return { items, missing };
}

function formatNum(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function showShoppingList({ items, missing }) {
  const bodyHTML = `
    <h3>${icon("cart")} Liste de courses</h3>
    <p style="color:var(--color-ink-muted);font-size:0.82rem;margin-top:-8px;">
      Indique ce que tu as déjà chez toi : la quantité à acheter se recalcule toute seule.
    </p>
    <div style="max-height:52vh;overflow-y:auto;">
      <ul class="shopping-list">
        ${
          items.length
            ? items
                .map((it, i) => {
                  if (it.numericTotal !== null) {
                    return `
                    <li class="shopping-li" data-index="${i}">
                      <span class="s-name">${escapeHTML(it.name)}</span>
                      <span class="have-field">
                        <label for="have-${i}">déjà</label>
                        <input type="number" id="have-${i}" class="have-input" min="0" step="any" placeholder="0" />
                      </span>
                      <span class="qty remaining" id="remaining-${i}">${formatNum(it.numericTotal)} ${escapeHTML(pluralizeUnit(it.unit, it.numericTotal))}</span>
                    </li>`;
                  }
                  return `
                    <li class="shopping-li" data-index="${i}">
                      <span class="s-name">${escapeHTML(it.name)}</span>
                      <label class="have-checkbox">
                        <input type="checkbox" id="covered-${i}" />
                        j'en ai déjà
                      </label>
                      <span class="qty remaining" id="remaining-${i}">${escapeHTML(it.rawDisplay)}</span>
                    </li>`;
                })
                .join("")
            : "<li>Aucun ingrédient à lister pour cette semaine.</li>"
        }
      </ul>
      ${
        missing.length
          ? `<div style="margin-top:var(--space-4);">${missing
              .map((m) => `<p style="color:var(--color-danger);font-weight:600;margin:6px 0;">Manque : ${escapeHTML(m)}</p>`)
              .join("")}</div>`
          : ""
      }
    </div>
    <div class="btn-row">
      <button class="btn btn-outline" id="copy-list-btn" type="button">Copier</button>
      <button class="btn btn-primary" id="close-list-btn" type="button">Fermer</button>
    </div>
  `;

  const { root, close } = openSheet(bodyHTML);
  root.querySelector("#close-list-btn").addEventListener("click", close);

  // ---- Recalcul en direct des quantités restantes ----
  items.forEach((it, i) => {
    const li = root.querySelector(`.shopping-li[data-index="${i}"]`);
    const remainingEl = root.querySelector(`#remaining-${i}`);

    if (it.numericTotal !== null) {
      const haveInput = root.querySelector(`#have-${i}`);
      haveInput.addEventListener("input", () => {
        const have = parseFloat(String(haveInput.value).replace(",", ".")) || 0;
        const remaining = Math.max(0, it.numericTotal - have);
        if (remaining <= 0) {
          remainingEl.textContent = "en stock";
          li.classList.add("covered");
        } else {
          remainingEl.textContent = `${formatNum(remaining)} ${pluralizeUnit(it.unit, remaining)}`;
          li.classList.remove("covered");
        }
      });
    } else {
      const checkbox = root.querySelector(`#covered-${i}`);
      checkbox.addEventListener("change", () => {
        li.classList.toggle("covered", checkbox.checked);
      });
    }
  });

  root.querySelector("#copy-list-btn").addEventListener("click", async () => {
    const lines = ["Liste de courses :"];
    items.forEach((it, i) => {
      const li = root.querySelector(`.shopping-li[data-index="${i}"]`);
      if (li.classList.contains("covered")) return; // déjà en stock, pas besoin d'acheter
      const remainingText = root.querySelector(`#remaining-${i}`).textContent.trim();
      lines.push(`- ${it.name}${remainingText ? ` (${remainingText})` : ""}`);
    });
    if (missing.length) {
      lines.push("");
      missing.forEach((m) => lines.push(`Manque : ${m}`));
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast("Liste copiée");
    } catch {
      toast("Impossible de copier automatiquement sur cet appareil");
    }
  });
}
