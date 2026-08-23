import { icon } from "../icons.js";
import { getRecipe, saveRecipe } from "../db.js";
import { escapeHTML, toast } from "../ui.js";
import { getSetting } from "../db.js";

function uid() {
  return Math.random().toString(36).slice(2, 8);
}

// Unités courantes proposées à la saisie (avec repli "Autre..." en texte libre)
const UNIT_OPTIONS = [
  "g", "kg", "mg", "ml", "cl", "l",
  "c. à café", "c. à soupe", "pincée",
  "unité", "tranche", "gousse", "botte", "sachet",
  "verre", "tasse", "pot", "boîte", "feuille", "brin", "bouquet",
];

// Étiquettes suggérées en un clic : gérées par l'utilisateur dans Paramètres
// (aucune liste par défaut imposée — chargées dynamiquement à l'ouverture).

function normalizeTag(t) {
  return String(t || "").trim().replace(/^#+/, "");
}

function stripHTML(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, nav, header, footer, noscript").forEach((n) => n.remove());
  return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

/** Déduit l'URL du service de structuration IA à partir de celle de transcription
 *  (même serveur perso : .../transcribe -> .../structure). */
function deriveStructureEndpoint(transcriptionEndpoint) {
  try {
    const u = new URL(transcriptionEndpoint);
    if (u.pathname.endsWith("/transcribe")) {
      u.pathname = u.pathname.slice(0, -"/transcribe".length) + "/structure";
    } else {
      u.pathname = u.pathname.replace(/\/[^/]*$/, "/structure");
    }
    return u.toString();
  } catch {
    return null;
  }
}

export async function renderRecipeEdit(main, { navigate, replace, params, back }) {
  const existing = params.id ? await getRecipe(params.id) : null;
  const tagPresets = await getSetting("tagPresets", []);

  const state = {
    id: existing?.id || null,
    title: existing?.title || "",
    tags: existing?.tags?.length ? [...existing.tags] : [],
    image: existing?.image || null,
    notes: existing?.notes || "",
    ingredients: existing?.ingredients?.length ? existing.ingredients.map((i) => ({ ...i, _key: uid() })) : [{ name: "", quantity: "", unit: "", _key: uid() }],
    steps: existing?.steps?.length ? existing.steps.map((s) => ({ text: s, _key: uid() })) : [{ text: "", _key: uid() }],
    cookingSteps: existing?.cookingSteps?.length ? existing.cookingSteps.map((s) => ({ text: s, _key: uid() })) : [{ text: "", _key: uid() }],
    source: existing?.source || { type: "manual" },
    transcript: existing?.transcript || "",
  };

  main.innerHTML = `
    <div class="tab-row">
      <button class="tab-btn active" data-tab="manual">Fiche recette</button>
      <button class="tab-btn" data-tab="import">Depuis internet</button>
      <button class="tab-btn" data-tab="video">Vidéo → texte</button>
    </div>

    <div class="tab-panel active" data-panel="manual">
      <div class="field">
        <label>Photo (facultatif)</label>
        <div id="image-preview" style="margin-bottom:8px;"></div>
        <input type="file" accept="image/*" id="image-input" />
      </div>
      <div class="field">
        <label>Titre</label>
        <input type="text" id="f-title" value="${escapeHTML(state.title)}" placeholder="Ex : Tarte aux pommes" />
      </div>

      <div class="field">
        <label>Étiquettes</label>
        <div id="tag-chips" class="chip-row" style="margin-bottom:var(--space-2);"></div>
        <div class="repeat-row">
          <input type="text" id="tag-input" placeholder="Ajouter une étiquette..." />
          <button class="btn btn-outline" id="tag-add-btn" type="button" style="flex-shrink:0;">${icon("plus")}</button>
        </div>
        <div id="tag-suggestions" class="chip-row" style="margin-top:var(--space-2);"></div>
      </div>

      <div class="field">
        <label>Ingrédients</label>
        <div id="ingredients-rows"></div>
        <button class="link-btn" id="add-ingredient" type="button">${icon("plus")} Ajouter un ingrédient</button>
        <p style="font-size:0.78rem;color:var(--color-ink-muted);margin-top:4px;">Chaque ingrédient devient automatiquement une étiquette de recherche.</p>
      </div>

      <div class="field">
        <label>Instructions</label>
        <div id="steps-rows"></div>
        <button class="link-btn" id="add-step" type="button">${icon("plus")} Ajouter une instruction</button>
      </div>

      <div class="field">
        <label>Cuisson</label>
        <div id="cooking-rows"></div>
        <button class="link-btn" id="add-cooking" type="button">${icon("plus")} Ajouter une étape de cuisson</button>
      </div>

      <div class="field">
        <label>Notes (facultatif)</label>
        <textarea id="f-notes" placeholder="Astuces, variantes...">${escapeHTML(state.notes)}</textarea>
      </div>

      ${state.transcript ? `<p style="font-size:0.82rem;color:var(--color-ink-muted);">Une transcription vidéo est associée à cette recette (visible sur sa fiche).</p>` : ""}
    </div>

    <div class="tab-panel" data-panel="import">
      <p style="color:var(--color-ink-muted);font-size:0.9rem;">Colle l'adresse d'une recette trouvée en ligne. L'app tente de récupérer le texte de la page ; si le site bloque la récupération (CORS), colle directement le texte à la main ci-dessous.</p>
      <div class="field">
        <label>URL de la recette</label>
        <input type="url" id="import-url" placeholder="https://..." />
      </div>
      <button class="btn btn-outline" id="fetch-url">${icon("link")} Récupérer le texte de la page</button>
      <div id="import-status" style="margin-top:var(--space-3);"></div>
      <div class="field" style="margin-top:var(--space-4);">
        <label>Texte récupéré / collé manuellement</label>
        <textarea id="import-text" style="min-height:160px;" placeholder="Colle ici le texte de la recette si besoin..."></textarea>
      </div>
      <div class="btn-row" style="margin-top:0;">
        <button class="btn btn-accent" id="use-import-text" type="button">Utiliser ce texte (→ Notes)</button>
        <button class="btn btn-outline" id="structure-import-text" type="button">${icon("check")} Structurer avec l'IA</button>
      </div>
    </div>

    <div class="tab-panel" data-panel="video">
      <p style="color:var(--color-ink-muted);font-size:0.9rem;">La transcription automatique appelle un service tiers de reconnaissance vocale et nécessite ta propre clé API, à renseigner dans <em>Paramètres → Transcription</em>. Sans clé, colle simplement la transcription à la main ci-dessous.</p>
      <div class="field">
        <label>URL de la vidéo</label>
        <input type="url" id="video-url" placeholder="https://..." />
      </div>
      <button class="btn btn-outline" id="transcribe-btn">${icon("video")} Transcrire automatiquement</button>
      <div id="video-status" style="margin-top:var(--space-3);"></div>
      <div class="field" style="margin-top:var(--space-4);">
        <label>Transcription (générée ou collée à la main)</label>
        <textarea id="video-text" style="min-height:160px;">${escapeHTML(state.transcript)}</textarea>
      </div>
      <div class="btn-row" style="margin-top:0;">
        <button class="btn btn-accent" id="use-transcript" type="button">Associer cette transcription</button>
        <button class="btn btn-outline" id="structure-video-text" type="button">${icon("check")} Structurer avec l'IA</button>
      </div>
    </div>

    <div class="btn-row">
      <button class="btn btn-outline" id="cancel-btn" type="button">Annuler</button>
      <button class="btn btn-primary" id="save-btn" type="button">${icon("check")} Enregistrer</button>
    </div>
  `;

  // ---------- Onglets ----------
  main.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      main.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      main.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      main.querySelector(`[data-panel="${btn.dataset.tab}"]`).classList.add("active");
    });
  });

  // ---------- Photo ----------
  const imagePreview = main.querySelector("#image-preview");
  function drawImagePreview() {
    imagePreview.innerHTML = state.image
      ? `<img src="${state.image}" style="width:96px;height:96px;object-fit:cover;border-radius:12px;" />`
      : `<span style="color:var(--color-ink-muted);font-size:0.85rem;">Aucune photo</span>`;
  }
  drawImagePreview();
  main.querySelector("#image-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.image = reader.result; // dataURL, stocké localement dans IndexedDB
      drawImagePreview();
    };
    reader.readAsDataURL(file);
  });

  // ---------- Étiquettes (tags) ----------
  const tagChipsEl = main.querySelector("#tag-chips");
  const tagSuggestEl = main.querySelector("#tag-suggestions");
  const tagInput = main.querySelector("#tag-input");

  function drawTags() {
    tagChipsEl.innerHTML = state.tags.length
      ? state.tags
          .map(
            (t) => `<button type="button" class="chip active" data-remove-tag="${escapeHTML(t)}">#${escapeHTML(t)} ${icon("close", "chip-x")}</button>`
          )
          .join("")
      : `<span style="font-size:0.85rem;color:var(--color-ink-muted);">Aucune étiquette pour l'instant</span>`;

    tagChipsEl.querySelectorAll("[data-remove-tag]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tags = state.tags.filter((t) => t !== btn.dataset.removeTag);
        drawTags();
        drawSuggestions();
      });
    });

    drawSuggestions();
  }

  function drawSuggestions() {
    if (!tagPresets.length) {
      tagSuggestEl.innerHTML = `<span style="font-size:0.8rem;color:var(--color-ink-muted);">Astuce : gère des étiquettes rapides dans Paramètres → Étiquettes suggérées.</span>`;
      return;
    }
    const lowerTags = state.tags.map((t) => t.toLowerCase());
    tagSuggestEl.innerHTML = tagPresets
      .map((s) => `<button type="button" class="chip${lowerTags.includes(s.toLowerCase()) ? " active" : ""}" data-suggest="${escapeHTML(s)}">#${escapeHTML(s)}</button>`)
      .join("");
    tagSuggestEl.querySelectorAll("[data-suggest]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tag = btn.dataset.suggest;
        const already = state.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
        state.tags = already ? state.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()) : [...state.tags, tag];
        drawTags();
      });
    });
  }

  function addTagFromInput() {
    const tag = normalizeTag(tagInput.value);
    if (!tag) return;
    if (!state.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      state.tags.push(tag);
      drawTags();
    }
    tagInput.value = "";
    tagInput.focus();
  }
  main.querySelector("#tag-add-btn").addEventListener("click", addTagFromInput);
  tagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addTagFromInput(); }
  });
  drawTags();

  // ---------- Ingrédients dynamiques ----------
  const ingRows = main.querySelector("#ingredients-rows");
  function drawIngredients() {
    ingRows.innerHTML = state.ingredients
      .map((ing) => {
        const isCustomUnit = ing.unit && !UNIT_OPTIONS.includes(ing.unit);
        return `
      <div class="repeat-row" data-key="${ing._key}">
        <input type="text" class="ing-name" placeholder="Ingrédient" value="${escapeHTML(ing.name)}" />
        <input type="text" class="qty-input ing-qty" placeholder="Qté" value="${escapeHTML(ing.quantity)}" />
        ${
          isCustomUnit || ing._customUnit
            ? `<input type="text" class="unit-input ing-unit-custom" placeholder="Unité" value="${escapeHTML(ing.unit)}" />`
            : `<select class="unit-input ing-unit-select">
                <option value="">Unité</option>
                ${UNIT_OPTIONS.map((u) => `<option value="${u}" ${ing.unit === u ? "selected" : ""}>${u}</option>`).join("")}
                <option value="__custom__">Autre...</option>
              </select>`
        }
        <button class="remove-row-btn" type="button" data-remove="${ing._key}">${icon("close")}</button>
      </div>`;
      })
      .join("");

    ingRows.querySelectorAll(".repeat-row").forEach((row) => {
      const key = row.dataset.key;
      const ing = state.ingredients.find((i) => i._key === key);
      row.querySelector(".ing-name").addEventListener("input", (e) => (ing.name = e.target.value));
      row.querySelector(".ing-qty").addEventListener("input", (e) => (ing.quantity = e.target.value));
      const unitSelect = row.querySelector(".ing-unit-select");
      if (unitSelect) {
        unitSelect.addEventListener("change", (e) => {
          if (e.target.value === "__custom__") {
            ing._customUnit = true;
            ing.unit = "";
            drawIngredients();
          } else {
            ing.unit = e.target.value;
          }
        });
      }
      const unitCustom = row.querySelector(".ing-unit-custom");
      if (unitCustom) {
        unitCustom.addEventListener("input", (e) => (ing.unit = e.target.value));
      }
    });
    ingRows.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.ingredients = state.ingredients.filter((i) => i._key !== btn.dataset.remove);
        if (!state.ingredients.length) state.ingredients.push({ name: "", quantity: "", unit: "", _key: uid() });
        drawIngredients();
      });
    });
  }
  drawIngredients();
  main.querySelector("#add-ingredient").addEventListener("click", () => {
    state.ingredients.push({ name: "", quantity: "", unit: "", _key: uid() });
    drawIngredients();
  });

  // ---------- Instructions dynamiques (puces) ----------
  const stepRows = main.querySelector("#steps-rows");
  function drawSteps() {
    stepRows.innerHTML = state.steps
      .map(
        (s, i) => `
      <div class="repeat-row" data-key="${s._key}">
        <span style="flex-shrink:0;color:var(--color-accent-dark);font-size:1.3em;line-height:2.4;">•</span>
        <textarea class="step-text" style="min-height:44px;" placeholder="Instruction ${i + 1}">${escapeHTML(s.text)}</textarea>
        <button class="remove-row-btn" type="button" data-remove="${s._key}">${icon("close")}</button>
      </div>`
      )
      .join("");
    stepRows.querySelectorAll(".repeat-row").forEach((row) => {
      const key = row.dataset.key;
      const s = state.steps.find((x) => x._key === key);
      row.querySelector(".step-text").addEventListener("input", (e) => (s.text = e.target.value));
    });
    stepRows.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.steps = state.steps.filter((s) => s._key !== btn.dataset.remove);
        if (!state.steps.length) state.steps.push({ text: "", _key: uid() });
        drawSteps();
      });
    });
  }
  drawSteps();
  main.querySelector("#add-step").addEventListener("click", () => {
    state.steps.push({ text: "", _key: uid() });
    drawSteps();
  });

  // ---------- Cuisson dynamique (puces, section séparée) ----------
  const cookingRows = main.querySelector("#cooking-rows");
  function drawCookingSteps() {
    cookingRows.innerHTML = state.cookingSteps
      .map(
        (s, i) => `
      <div class="repeat-row" data-key="${s._key}">
        <span style="flex-shrink:0;color:var(--color-accent-dark);font-size:1.3em;line-height:2.4;">•</span>
        <textarea class="cooking-text" style="min-height:44px;" placeholder="Ex : Four à 180°C, 25 minutes">${escapeHTML(s.text)}</textarea>
        <button class="remove-row-btn" type="button" data-remove="${s._key}">${icon("close")}</button>
      </div>`
      )
      .join("");
    cookingRows.querySelectorAll(".repeat-row").forEach((row) => {
      const key = row.dataset.key;
      const s = state.cookingSteps.find((x) => x._key === key);
      row.querySelector(".cooking-text").addEventListener("input", (e) => (s.text = e.target.value));
    });
    cookingRows.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.cookingSteps = state.cookingSteps.filter((s) => s._key !== btn.dataset.remove);
        if (!state.cookingSteps.length) state.cookingSteps.push({ text: "", _key: uid() });
        drawCookingSteps();
      });
    });
  }
  drawCookingSteps();
  main.querySelector("#add-cooking").addEventListener("click", () => {
    state.cookingSteps.push({ text: "", _key: uid() });
    drawCookingSteps();
  });

  // ---------- Import depuis internet (texte) ----------
  main.querySelector("#fetch-url").addEventListener("click", async () => {
    const url = main.querySelector("#import-url").value.trim();
    const statusEl = main.querySelector("#import-status");
    if (!url) { statusEl.textContent = "Renseigne une URL."; return; }
    if (!navigator.onLine) { statusEl.textContent = "Pas de connexion : colle le texte manuellement ci-dessous."; return; }
    statusEl.innerHTML = `<span class="spinner"></span> Récupération...`;
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const html = await res.text();
      const text = stripHTML(html);
      main.querySelector("#import-text").value = text.slice(0, 8000);
      state.source = { type: "url", url };
      statusEl.textContent = "Texte récupéré. Vérifie et clique sur \"Utiliser ce texte\".";
    } catch (err) {
      statusEl.textContent = "Impossible de récupérer automatiquement (le site bloque probablement l'accès depuis une app). Copie-colle le texte de la recette ci-dessous.";
    }
  });

  main.querySelector("#use-import-text").addEventListener("click", () => {
    const text = main.querySelector("#import-text").value.trim();
    if (!text) { toast("Rien à utiliser"); return; }
    state.notes = state.notes ? state.notes + "\n\n" + text : text;
    main.querySelector("#f-notes").value = state.notes;
    const url = main.querySelector("#import-url").value.trim();
    if (url) state.source = { type: "url", url };
    main.querySelector('[data-tab="manual"]').click();
    toast("Texte ajouté aux notes de la fiche — répartis-le dans les ingrédients/étapes");
  });

  main.querySelector("#structure-import-text").addEventListener("click", () => {
    runStructuring(main.querySelector("#import-text").value, main.querySelector("#import-status"));
  });

  // ---------- Vidéo → transcription ----------
  main.querySelector("#transcribe-btn").addEventListener("click", async () => {
    const url = main.querySelector("#video-url").value.trim();
    const statusEl = main.querySelector("#video-status");
    if (!url) { statusEl.textContent = "Renseigne une URL de vidéo."; return; }
    if (!navigator.onLine) { statusEl.textContent = "Pas de connexion : colle la transcription manuellement."; return; }

    const endpoint = await getSetting("transcriptionEndpoint", "");
    const apiKey = await getSetting("transcriptionApiKey", "");
    if (!endpoint || !apiKey) {
      statusEl.textContent = "Aucun service de transcription configuré. Va dans Paramètres → Transcription pour renseigner une clé API, ou colle le texte à la main ci-dessous.";
      return;
    }

    statusEl.innerHTML = `<span class="spinner"></span> Transcription en cours (peut prendre un moment)...`;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const text = data.text || data.transcript || "";
      if (!text) throw new Error("Réponse vide");
      main.querySelector("#video-text").value = text;
      state.source = { type: "video", url };
      statusEl.textContent = "Transcription obtenue. Clique sur \"Associer cette transcription\".";
    } catch (err) {
      statusEl.textContent = "Échec de la transcription automatique. Vérifie ta clé API dans Paramètres, ou colle le texte manuellement.";
    }
  });

  main.querySelector("#use-transcript").addEventListener("click", () => {
    const text = main.querySelector("#video-text").value.trim();
    if (!text) { toast("Rien à associer"); return; }
    state.transcript = text;
    const url = main.querySelector("#video-url").value.trim();
    if (url) state.source = { type: "video", url };
    toast("Transcription associée à la recette");
  });

  main.querySelector("#structure-video-text").addEventListener("click", () => {
    runStructuring(main.querySelector("#video-text").value, main.querySelector("#video-status"));
  });

  // ---------- Structuration IA (transcript brut -> fiche recette) ----------
  async function runStructuring(rawText, statusEl) {
    const text = (rawText || "").trim();
    if (!text) { toast("Aucun texte à structurer"); return; }
    if (!navigator.onLine) { statusEl.textContent = "Pas de connexion : la structuration IA nécessite d'atteindre ton serveur."; return; }

    const transcriptionEndpoint = await getSetting("transcriptionEndpoint", "");
    const apiKey = await getSetting("transcriptionApiKey", "");
    const structureEndpoint = transcriptionEndpoint ? deriveStructureEndpoint(transcriptionEndpoint) : null;

    if (!structureEndpoint || !apiKey) {
      statusEl.textContent = "Configure d'abord le service dans Paramètres → Transcription (même serveur, l'app déduit automatiquement l'adresse de structuration).";
      return;
    }

    statusEl.innerHTML = `<span class="spinner"></span> Structuration en cours (le modèle local réfléchit)...`;
    try {
      const res = await fetch(structureEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      applyStructuredResult(data);
      statusEl.textContent = "Fiche recette générée — vérifie et ajuste dans l'onglet \"Fiche recette\".";
      toast("Fiche pré-remplie par l'IA — à relire !");
      main.querySelector('[data-tab="manual"]').click();
    } catch (err) {
      statusEl.textContent = `Échec de la structuration : ${err.message}. Tu peux toujours remplir la fiche à la main.`;
    }
  }

  function applyStructuredResult(data) {
    if (data.title) {
      state.title = data.title;
      main.querySelector("#f-title").value = data.title;
    }
    if (Array.isArray(data.tags) && data.tags.length) {
      const existingLower = state.tags.map((t) => t.toLowerCase());
      for (const t of data.tags) {
        const clean = normalizeTag(t);
        if (clean && !existingLower.includes(clean.toLowerCase())) state.tags.push(clean);
      }
      drawTags();
    }
    if (Array.isArray(data.ingredients) && data.ingredients.length) {
      state.ingredients = data.ingredients.map((i) => ({
        name: i.name || "", quantity: i.quantity || "", unit: i.unit || "", _key: uid(),
      }));
      drawIngredients();
    }
    if (Array.isArray(data.steps) && data.steps.length) {
      state.steps = data.steps.map((s) => ({ text: s, _key: uid() }));
      drawSteps();
    }
  }

  // ---------- Enregistrement / Annulation ----------
  main.querySelector("#cancel-btn").addEventListener("click", back);

  main.querySelector("#save-btn").addEventListener("click", async () => {
    const title = main.querySelector("#f-title").value.trim();
    if (!title) {
      toast("Le titre est obligatoire");
      main.querySelector('[data-tab="manual"]').click();
      main.querySelector("#f-title").focus();
      return;
    }
    const tags = state.tags.map(normalizeTag).filter(Boolean);
    const notes = main.querySelector("#f-notes").value;
    const ingredients = state.ingredients
      .filter((i) => i.name.trim())
      .map((i) => ({ name: i.name.trim(), quantity: i.quantity.trim(), unit: i.unit.trim() }));
    const steps = state.steps.map((s) => s.text.trim()).filter(Boolean);
    const cookingSteps = state.cookingSteps.map((s) => s.text.trim()).filter(Boolean);

    const saved = await saveRecipe({
      id: state.id,
      title,
      tags,
      notes,
      ingredients,
      steps,
      cookingSteps,
      image: state.image,
      source: state.source,
      transcript: state.transcript || null,
      createdAt: existing?.createdAt,
    });

    toast("Recette enregistrée");
    replace("recipe-detail", { id: saved.id });
  });
}
