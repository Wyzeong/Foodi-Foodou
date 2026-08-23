// ============================================================
// Routeur "app-like" basé sur history.pushState / popstate.
//
// Principe : on empile toujours un état racine invisible ("__root__")
// sous l'écran d'accueil ("home"). Ainsi, quand l'utilisateur est sur
// l'accueil et déclenche un retour (bouton/geste Android, ou le bouton
// retour affiché à l'écran sur iOS), on intercepte l'arrivée sur
// "__root__" pour proposer une confirmation avant de quitter,
// plutôt que de laisser l'app se fermer brutalement.
//
// Limite connue et assumée : iOS n'expose aucun geste système de
// retour pour une web app "ajoutée à l'écran d'accueil" (contrairement
// à Android où le geste back déclenche bien popstate). Sur iOS,
// c'est le bouton retour affiché dans l'en-tête qui appelle
// router.back(), reproduisant le même comportement applicatif.
// ============================================================

let onRender = null;
let onExitConfirm = null;
let awaitingExitDecision = false;
let allowRootExit = false;

export function initRouter({ render, confirmExit }) {
  onRender = render;
  onExitConfirm = confirmExit;

  // Empile un état racine, puis l'accueil, au premier chargement.
  history.replaceState({ page: "__root__" }, "", location.pathname + location.search);
  history.pushState({ page: "home", params: {} }, "", location.pathname + location.search);

  window.addEventListener("popstate", handlePopState);

  // Rendu initial.
  onRender("home", {});
}

async function handlePopState(event) {
  const state = event.state;

  if (!state || state.page === "__root__") {
    if (allowRootExit) {
      // L'utilisateur a confirmé : on laisse l'état racine actif.
      // Un back supplémentaire fermera réellement l'app (plus d'historique interne).
      return;
    }
    if (awaitingExitDecision) return; // évite double-déclenchement
    awaitingExitDecision = true;

    // On neutralise visuellement la navigation en repoussant "home",
    // le temps de demander confirmation à l'utilisateur.
    history.pushState({ page: "home", params: {} }, "", location.pathname + location.search);

    const shouldExit = await onExitConfirm();
    awaitingExitDecision = false;

    if (shouldExit) {
      allowRootExit = true;
      history.back(); // repasse sur "__root__", geste suivant = fermeture réelle
    }
    return;
  }

  onRender(state.page, state.params || {});
}

/** Navigue vers une nouvelle page (empile une entrée d'historique). */
export function navigate(page, params = {}) {
  history.pushState({ page, params }, "", location.pathname + location.search);
  onRender(page, params);
}

/** Remplace l'entrée courante sans empiler (ex: bascule d'onglet interne). */
export function replace(page, params = {}) {
  history.replaceState({ page, params }, "", location.pathname + location.search);
  onRender(page, params);
}

/** Revient en arrière — utilisé par le bouton retour visible (iOS) et par tout code interne. */
export function back() {
  history.back();
}
