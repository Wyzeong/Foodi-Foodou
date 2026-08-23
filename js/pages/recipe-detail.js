import { icon } from "../icons.js";
import { getRecipe, deleteRecipe } from "../db.js";
import { escapeHTML, confirmSheet, toast } from "../ui.js";

export async function renderRecipeDetail(main, { navigate, params, back }) {
  const recipe = await getRecipe(params.id);

  if (!recipe) {
    main.innerHTML = `<div class="empty-state"><p>Recette introuvable (peut-être supprimée).</p></div>`;
    return;
  }

  main.innerHTML = `
    <div class="recipe-hero">${recipe.image ? `<img src="${recipe.image}" alt="">` : icon("book")}</div>
    <h1>${escapeHTML(recipe.title)}</h1>
    ${recipe.tags && recipe.tags.length ? `<div class="tag-row">${recipe.tags.map((t) => `<span class="tag">${escapeHTML(t)}</span>`).join("")}</div>` : ""}

    ${recipe.notes ? `<p style="color:var(--color-ink-muted)">${escapeHTML(recipe.notes)}</p>` : ""}

    <h2 class="section-title">Ingrédients</h2>
    <ul class="ingredient-list">
      ${(recipe.ingredients || [])
        .map(
          (i) => `<li><span>${escapeHTML(i.name)}</span><span class="qty">${escapeHTML(i.quantity || "")} ${escapeHTML(i.unit || "")}</span></li>`
        )
        .join("") || "<li>Aucun ingrédient renseigné.</li>"}
    </ul>

    <h2 class="section-title">Étapes</h2>
    <ol class="step-list" style="list-style:none;padding:0;">
      ${(recipe.steps || [])
        .map((s, i) => `<li><span class="step-num">${i + 1}</span><span>${escapeHTML(s)}</span></li>`)
        .join("") || "<li>Aucune étape renseignée.</li>"}
    </ol>

    ${
      recipe.transcript
        ? `<h2 class="section-title">Transcription (source vidéo)</h2><p style="white-space:pre-wrap;color:var(--color-ink-muted);font-size:0.9rem;">${escapeHTML(recipe.transcript)}</p>`
        : ""
    }
    ${
      recipe.source && recipe.source.url
        ? `<p style="margin-top:var(--space-4);font-size:0.85rem;"><a href="${escapeHTML(recipe.source.url)}" target="_blank" rel="noopener" style="color:var(--color-primary);text-decoration:underline;">Source d'origine ↗</a></p>`
        : ""
    }

    <div class="btn-row">
      <button class="btn btn-outline" data-act="edit">${icon("edit")} Modifier</button>
      <button class="btn btn-danger" data-act="delete">${icon("trash")} Supprimer</button>
    </div>
  `;

  main.querySelector('[data-act="edit"]').addEventListener("click", () => {
    navigate("recipe-edit", { id: recipe.id });
  });

  main.querySelector('[data-act="delete"]').addEventListener("click", async () => {
    const ok = await confirmSheet({
      title: "Supprimer cette recette ?",
      message: "Cette action est définitive et retirera aussi la recette du menu de la semaine si elle y est assignée.",
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (ok) {
      await deleteRecipe(recipe.id);
      toast("Recette supprimée");
      back();
    }
  });
}
