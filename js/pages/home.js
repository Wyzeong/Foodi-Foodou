import { icon } from "../icons.js";

export function renderHome(main, { navigate }) {
  main.innerHTML = `
    <div class="home-hero">
      <span class="stamp">— carnet de cuisine —</span>
      <h1>MonCarnet</h1>
    </div>
    <div class="tile-grid">
      <button class="tile" data-go="week">
        <span class="tile-icon">${icon("calendar")}</span>
        <span class="tile-text">
          <h2>Menu de la semaine</h2>
          <p>Organiser les repas jour par jour</p>
        </span>
      </button>
      <button class="tile" data-go="recipes">
        <span class="tile-icon">${icon("book")}</span>
        <span class="tile-text">
          <h2>Recettes</h2>
          <p>Votre bibliothèque, triable par ingrédient</p>
        </span>
      </button>
      <button class="tile" data-go="settings">
        <span class="tile-icon">${icon("settings")}</span>
        <span class="tile-text">
          <h2>Paramètres</h2>
          <p>Sauvegarde, import/export, version</p>
        </span>
      </button>
    </div>
  `;

  main.querySelectorAll("[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.go));
  });
}
