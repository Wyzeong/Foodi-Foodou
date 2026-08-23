import { icon } from "../icons.js";
import { getRecipe, deleteRecipe } from "../db.js";
import { escapeHTML, confirmSheet, toast, pluralizeUnit } from "../ui.js";

export async function renderRecipeDetail(main, { navigate, params, back }) {
  const recipe = await getRecipe(params.id);

  if (!recipe) {
    main.innerHTML = `<div class="empty-state"><p>Recette introuvable (peut-être supprimée).</p></div>`;
    return;
  }

  const hasImage = !!recipe.image;

  main.innerHTML = `
    ${
      hasImage
        ? `<div class="recipe-photo-tape">
            <span class="tape"></span>
            <div class="frame"><img src="${recipe.image}" alt=""></div>
          </div>`
        : ""
    }

    <h1 class="manuscript-title" style="text-align:center;">${escapeHTML(recipe.title)}</h1>

    ${
      recipe.tags && recipe.tags.length
        ? `<div class="tag-row" style="justify-content:center;">${recipe.tags.map((t) => `<span class="tag">#${escapeHTML(t)}</span>`).join("")}</div>`
        : ""
    }

    <div class="book-spread">
      <div class="manuscript-page page-left">
        <h2 class="manuscript-section-title">Ingrédients</h2>
        <ul class="ingredient-list manuscript-body">
          ${
            (recipe.ingredients || [])
              .map(
                (i) => `<li><span>${escapeHTML(i.name)}</span><span class="qty">${escapeHTML(i.quantity || "")} ${escapeHTML(pluralizeUnit(i.unit, i.quantity))}</span></li>`
              )
              .join("") || "<li>Aucun ingrédient renseigné.</li>"
          }
        </ul>
      </div>

      <div class="manuscript-page page-right">
        <h2 class="manuscript-section-title">Instructions</h2>
        <ul class="step-list manuscript-body">
          ${
            (recipe.steps || [])
              .map((s) => `<li><span class="step-bullet">•</span><span>${escapeHTML(s)}</span></li>`)
              .join("") || "<li>Aucune instruction renseignée.</li>"
          }
        </ul>
      </div>
    </div>

    ${
      recipe.cookingSteps && recipe.cookingSteps.length
        ? `<div class="manuscript-page">
            <h2 class="manuscript-section-title">Cuisson</h2>
            <ul class="step-list manuscript-body">
              ${recipe.cookingSteps.map((s) => `<li><span class="step-bullet">•</span><span>${escapeHTML(s)}</span></li>`).join("")}
            </ul>
          </div>`
        : ""
    }

    ${
      recipe.notes
        ? `<div class="manuscript-page"><p class="manuscript-note" style="margin:0;">${escapeHTML(recipe.notes)}</p></div>`
        : ""
    }

    ${
      recipe.transcript
        ? `<h2 class="section-title">Transcription (source vidéo)</h2><p style="white-space:pre-wrap;color:var(--color-ink-muted);font-size:0.9rem;">${escapeHTML(recipe.transcript)}</p>`
        : ""
    }
    ${
      recipe.source && recipe.source.url
        ? `<p style="margin-top:var(--space-4);font-size:0.85rem;text-align:center;"><a href="${escapeHTML(recipe.source.url)}" target="_blank" rel="noopener" style="color:var(--color-primary);text-decoration:underline;">Source d'origine ↗</a></p>`
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
