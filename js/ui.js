import { icon } from "./icons.js";

export function toast(message, duration = 2200) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

/**
 * Affiche une feuille modale. `bodyHTML` est le contenu.
 * Retourne { root, close } — `root` permet d'attacher des listeners avant affichage.
 */
export function openSheet(bodyHTML, { center = false } = {}) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal-sheet${center ? " center" : ""}">${bodyHTML}</div>`;
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  return { root: overlay.querySelector(".modal-sheet"), overlay, close };
}

/** Confirmation simple façon "voulez-vous vraiment...". Retourne une Promise<boolean>. */
export function confirmSheet({ title, message, confirmLabel = "Confirmer", danger = false }) {
  return new Promise((resolve) => {
    const { root, close } = openSheet(
      `<h3>${title}</h3>
       <p>${message}</p>
       <div class="btn-row">
         <button class="btn btn-outline" data-act="cancel">Annuler</button>
         <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok">${confirmLabel}</button>
       </div>`,
      { center: true }
    );
    root.querySelector('[data-act="cancel"]').onclick = () => {
      close();
      resolve(false);
    };
    root.querySelector('[data-act="ok"]').onclick = () => {
      close();
      resolve(true);
    };
  });
}

export function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Unités "mot" (par opposition aux abréviations comme g/kg/ml/cl/l/c. à café)
// dont le pluriel français est régulier (ajout d'un simple "s").
const PLURALIZABLE_UNITS = [
  "unité", "tranche", "gousse", "botte", "sachet",
  "verre", "tasse", "pot", "boîte", "feuille", "brin", "bouquet", "pincée",
];

/** Accorde automatiquement une unité au pluriel si la quantité l'exige
 *  (ex: "gousse" + 3 -> "gousses"). N'affecte pas les abréviations
 *  (g, kg, ml, cl, l, c. à café...) ni les unités personnalisées inconnues. */
export function pluralizeUnit(unit, quantity) {
  if (!unit) return unit;
  const num = parseFloat(String(quantity ?? "").replace(",", "."));
  if (isNaN(num) || Math.abs(num) <= 1) return unit;
  const lower = unit.trim().toLowerCase();
  if (!PLURALIZABLE_UNITS.includes(lower)) return unit;
  return unit.endsWith("s") ? unit : unit + "s";
}
