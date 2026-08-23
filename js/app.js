import { initRouter, navigate as routerNavigate, replace as routerReplace, back as routerBack } from "./router.js";
import { icon } from "./icons.js";
import { confirmSheet } from "./ui.js";
import { APP_VERSION } from "./version.js";

import { renderHome } from "./pages/home.js";
import { renderWeek } from "./pages/week.js";
import { renderRecipes } from "./pages/recipes.js";
import { renderRecipeDetail } from "./pages/recipe-detail.js";
import { renderRecipeEdit } from "./pages/recipe-edit.js";
import { renderSettings } from "./pages/settings.js";

const PAGE_TITLES = {
  home: "MonCarnet",
  week: "Menu de la semaine",
  recipes: "Recettes",
  "recipe-detail": "Recette",
  "recipe-edit": "Recette",
  settings: "Paramètres",
};

const headerEl = document.getElementById("app-header");
const titleEl = document.getElementById("header-title");
const backBtn = document.getElementById("header-back");
const mainEl = document.getElementById("app-main");

function ctxFor(params) {
  return {
    navigate: routerNavigate,
    replace: routerReplace,
    back: routerBack,
    params,
  };
}

async function render(page, params) {
  // En-tête : bouton retour visible partout sauf sur l'accueil.
  // Nécessaire notamment sur iOS, qui n'offre aucun geste système de retour
  // pour une web app installée sur l'écran d'accueil.
  if (page === "home") {
    backBtn.classList.add("hidden");
  } else {
    backBtn.classList.remove("hidden");
  }
  titleEl.textContent = page === "recipe-edit"
    ? (params.id ? "Modifier la recette" : "Nouvelle recette")
    : (PAGE_TITLES[page] || "MonCarnet");

  mainEl.innerHTML = "";
  mainEl.scrollTop = 0;
  window.scrollTo(0, 0);

  const ctx = ctxFor(params);
  try {
    switch (page) {
      case "home":
        renderHome(mainEl, ctx);
        break;
      case "week":
        await renderWeek(mainEl, ctx);
        break;
      case "recipes":
        await renderRecipes(mainEl, ctx);
        break;
      case "recipe-detail":
        await renderRecipeDetail(mainEl, ctx);
        break;
      case "recipe-edit":
        await renderRecipeEdit(mainEl, ctx);
        break;
      case "settings":
        await renderSettings(mainEl, ctx);
        break;
      default:
        renderHome(mainEl, ctx);
    }
  } catch (err) {
    console.error(err);
    mainEl.innerHTML = `<div class="empty-state"><p>Une erreur est survenue à l'affichage de cette page.</p></div>`;
  }
}

async function confirmExit() {
  return confirmSheet({
    title: "Quitter MonCarnet ?",
    message: "Tu peux revenir quand tu veux, tes données restent sur ton appareil.",
    confirmLabel: "Quitter",
  });
}

backBtn.addEventListener("click", () => routerBack());

initRouter({ render, confirmExit });

// ---------------- Service Worker (fonctionnement hors ligne) ----------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Échec d'enregistrement du Service Worker", err);
    });
  });

  // Si une nouvelle version est installée en arrière-plan, on informe l'utilisateur
  // (rechargement laissé à son initiative pour ne pas perdre une saisie en cours).
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    console.log("MonCarnet : nouvelle version active au prochain chargement.");
  });
}

console.log(`MonCarnet v${APP_VERSION}`);
