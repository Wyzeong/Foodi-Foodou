import { icon } from "../icons.js";
import { exportAllData, importAllData, getSetting, setSetting } from "../db.js";
import { toast, confirmSheet, openSheet } from "../ui.js";
import { APP_VERSION } from "../version.js";

export async function renderSettings(main) {
  const endpoint = await getSetting("transcriptionEndpoint", "");
  const apiKey = await getSetting("transcriptionApiKey", "");

  main.innerHTML = `
    <h2 class="section-title">Sauvegarde des données</h2>
    <ul class="settings-list">
      <li>
        <div>
          <div class="label">Exporter / Sauvegarder</div>
          <div class="sub">Toutes tes recettes et ton menu, dans un fichier .json</div>
        </div>
        <button class="btn btn-outline" id="export-btn">${icon("upload")} Exporter</button>
      </li>
      <li>
        <div>
          <div class="label">Importer un fichier</div>
          <div class="sub">Restaurer depuis une sauvegarde .json</div>
        </div>
        <label class="btn btn-outline" for="import-file" style="cursor:pointer;">${icon("download")} Importer</label>
        <input type="file" id="import-file" accept="application/json,.json" class="hidden" />
      </li>
    </ul>

    <h2 class="section-title">Transcription vidéo & structuration IA (optionnel)</h2>
    <p style="color:var(--color-ink-muted);font-size:0.88rem;">
      Pour transcrire automatiquement l'audio d'une vidéo depuis son URL, renseigne ici l'accès à un service de
      reconnaissance vocale de ton choix (ex. une fonction que tu héberges toi-même, ou un service tiers compatible).
      Cette clé reste stockée uniquement sur ton téléphone. Sans clé, tu peux toujours coller une transcription à la main.
    </p>
    <p style="color:var(--color-ink-muted);font-size:0.88rem;">
      Si ton serveur expose aussi un endpoint <code>/structure</code> (même serveur, l'app le déduit automatiquement
      de l'URL ci-dessous), tu peux transformer un texte brut (transcription ou texte collé depuis internet) en
      fiche recette structurée d'un clic, via un bouton "Structurer avec l'IA".
    </p>
    <div class="field">
      <label>URL du service (endpoint)</label>
      <input type="url" id="s-endpoint" value="${endpoint}" placeholder="https://mon-service.example.com/transcribe" />
    </div>
    <div class="field">
      <label>Clé API</label>
      <input type="password" id="s-key" value="${apiKey}" placeholder="Clé secrète" />
    </div>
    <button class="btn btn-primary btn-block" id="save-transcription">${icon("key")} Enregistrer ces réglages</button>

    <h2 class="section-title">À propos</h2>
    <ul class="settings-list">
      <li>
        <div class="label">Version installée</div>
        <span class="version-tag">v${APP_VERSION}</span>
      </li>
      <li>
        <div>
          <div class="label">Fonctionnement hors ligne</div>
          <div class="sub">Recettes, menu et stockage fonctionnent sans connexion</div>
        </div>
        ${icon("check")}
      </li>
    </ul>

    <h2 class="section-title">Zone de danger</h2>
    <button class="btn btn-danger btn-block" id="wipe-btn">${icon("trash")} Effacer toutes les données de l'app</button>
  `;

  // Export
  main.querySelector("#export-btn").addEventListener("click", async () => {
    const data = await exportAllData();
    const json = JSON.stringify(data, null, 2);
    const filename = `moncarnet-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([json], filename, { type: "application/json" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Sauvegarde MonCarnet" });
        return;
      } catch (err) {
        // annulé par l'utilisateur ou non supporté : on retombe sur le téléchargement classique
      }
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Fichier téléchargé");
  });

  // Import
  main.querySelector("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const mode = await chooseImportMode();
      if (!mode) return;

      const result = await importAllData(data, mode);
      toast(`${result.recipesCount} recette(s) importée(s)`);
      setTimeout(() => location.reload(), 900);
    } catch (err) {
      toast("Fichier invalide ou illisible");
    } finally {
      e.target.value = "";
    }
  });

  // Transcription settings
  main.querySelector("#save-transcription").addEventListener("click", async () => {
    await setSetting("transcriptionEndpoint", main.querySelector("#s-endpoint").value.trim());
    await setSetting("transcriptionApiKey", main.querySelector("#s-key").value.trim());
    toast("Réglages enregistrés");
  });

  // Wipe
  main.querySelector("#wipe-btn").addEventListener("click", async () => {
    const ok = await confirmSheet({
      title: "Tout effacer ?",
      message: "Toutes les recettes et le menu de la semaine seront définitivement supprimés de cet appareil. Pense à exporter une sauvegarde avant si besoin.",
      confirmLabel: "Tout effacer",
      danger: true,
    });
    if (ok) {
      await importAllData({ recipes: [], weekMenu: [], settings: [] }, "replace");
      toast("Données effacées");
      setTimeout(() => location.reload(), 700);
    }
  });
}

function chooseImportMode() {
  return new Promise((resolve) => {
    const { root, close } = openSheet(
      `<h3>Comment importer ?</h3>
       <p>Fusionner ajoute/écrase par recette. Remplacer efface d'abord tout le carnet actuel.</p>
       <div class="btn-row">
         <button class="btn btn-outline" data-mode="cancel">Annuler</button>
         <button class="btn btn-outline" data-mode="merge">Fusionner</button>
         <button class="btn btn-danger" data-mode="replace">Remplacer</button>
       </div>`,
      { center: true }
    );
    root.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode;
        close();
        resolve(mode === "cancel" ? null : mode);
      });
    });
  });
}
