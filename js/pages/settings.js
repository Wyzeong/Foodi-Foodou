import { icon } from "../icons.js";
import { exportAllData, importAllData, getSetting, setSetting } from "../db.js";
import { toast, openSheet, confirmSheet, escapeHTML } from "../ui.js";
import { APP_VERSION } from "../version.js";
import * as gdrive from "../gdrive.js";

export async function renderSettings(main) {
  const endpoint = await getSetting("transcriptionEndpoint", "");
  const apiKey = await getSetting("transcriptionApiKey", "");
  const tagPresets = await getSetting("tagPresets", []);
  const driveConnected = await gdrive.isConnected();

  main.innerHTML = `
    <ul class="settings-list" style="margin-bottom:var(--space-6);">
      <li>
        <div class="label">Version installée</div>
        <span class="version-tag">v${APP_VERSION}</span>
      </li>
    </ul>

    <h2 class="section-title">Sauvegarde (Google Drive)</h2>
    <p style="color:var(--color-ink-muted);font-size:0.88rem;">
      Tes recettes et ton menu sont sauvegardés dans un fichier sur ton propre Google Drive
      (accessible uniquement par cette app — pas le reste de ton Drive).
    </p>
    <ul class="settings-list">
      <li>
        <div>
          <div class="label">${driveConnected ? "Connecté à Google Drive" : "Non connecté"}</div>
          <div class="sub" id="drive-status-sub">${driveConnected ? "Prêt à sauvegarder/restaurer" : "Connecte-toi pour activer la sauvegarde"}</div>
        </div>
        <button class="btn ${driveConnected ? "btn-outline" : "btn-primary"}" id="drive-connect-btn">
          ${icon("cloud")} ${driveConnected ? "Déconnecter" : "Connecter à Google Drive"}
        </button>
      </li>
      <li class="${driveConnected ? "" : "hidden"}" id="drive-backup-row">
        <div>
          <div class="label">Sauvegarder maintenant</div>
          <div class="sub">Écrase la sauvegarde précédente sur ton Drive</div>
        </div>
        <button class="btn btn-outline" id="drive-backup-btn">${icon("upload")} Sauvegarder</button>
      </li>
      <li class="${driveConnected ? "" : "hidden"}" id="drive-restore-row">
        <div>
          <div class="label">Restaurer depuis Drive</div>
          <div class="sub">Recharge tes recettes et ton menu sauvegardés</div>
        </div>
        <button class="btn btn-outline" id="drive-restore-btn">${icon("download")} Restaurer</button>
      </li>
    </ul>

    <h2 class="section-title">Étiquettes suggérées</h2>
    <p style="color:var(--color-ink-muted);font-size:0.88rem;">
      Personnalise les étiquettes proposées en un clic lors de la création d'une recette.
      Touche une étiquette pour la modifier, ou la petite croix pour la supprimer directement.
    </p>
    <div id="preset-list" style="margin-bottom:var(--space-3);"></div>
    <div class="repeat-row">
      <input type="text" id="preset-input" placeholder="Nouvelle étiquette (ex : apéritif)" />
      <button class="btn btn-outline" id="preset-add-btn" type="button" style="flex-shrink:0;">${icon("plus")}</button>
    </div>

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
        <div>
          <div class="label">Fonctionnement hors ligne</div>
          <div class="sub">Recettes, menu et stockage fonctionnent sans connexion</div>
        </div>
        ${icon("check")}
      </li>
    </ul>
  `;

  // ---------------- Google Drive ----------------
  main.querySelector("#drive-connect-btn").addEventListener("click", async () => {
    if (driveConnected) {
      await gdrive.disconnect();
      toast("Déconnecté de Google Drive");
      renderSettings(main);
      return;
    }
    const statusSub = main.querySelector("#drive-status-sub");
    statusSub.textContent = "Connexion en cours...";
    try {
      await gdrive.connect();
      toast("Connecté à Google Drive");
      renderSettings(main);
    } catch (err) {
      statusSub.textContent = "Connexion annulée ou impossible.";
      toast("Impossible de se connecter à Google Drive");
    }
  });

  const backupBtn = main.querySelector("#drive-backup-btn");
  if (backupBtn) {
    backupBtn.addEventListener("click", async () => {
      backupBtn.disabled = true;
      backupBtn.innerHTML = `<span class="spinner"></span> Sauvegarde...`;
      try {
        const data = await exportAllData();
        const result = await gdrive.uploadBackup(JSON.stringify(data));
        toast(result.updated ? "Sauvegarde mise à jour sur Drive" : "Sauvegarde créée sur Drive");
      } catch (err) {
        if (err.message === "NOT_CONNECTED") {
          toast("Connexion Drive expirée, reconnecte-toi");
          renderSettings(main);
        } else {
          toast("Échec de la sauvegarde sur Drive");
        }
      } finally {
        backupBtn.disabled = false;
        backupBtn.innerHTML = `${icon("upload")} Sauvegarder`;
      }
    });
  }

  const restoreBtn = main.querySelector("#drive-restore-btn");
  if (restoreBtn) {
    restoreBtn.addEventListener("click", async () => {
      restoreBtn.disabled = true;
      restoreBtn.innerHTML = `<span class="spinner"></span> Recherche...`;
      try {
        const data = await gdrive.downloadBackup();
        const mode = await chooseImportMode();
        if (mode) {
          const result = await importAllData(data, mode);
          toast(`${result.recipesCount} recette(s) restaurée(s)`);
          setTimeout(() => location.reload(), 900);
          return;
        }
      } catch (err) {
        if (err.message === "NOT_FOUND") {
          toast("Aucune sauvegarde trouvée sur ce Drive");
        } else if (err.message === "NOT_CONNECTED") {
          toast("Connexion Drive expirée, reconnecte-toi");
          renderSettings(main);
        } else {
          toast("Échec de la restauration depuis Drive");
        }
      } finally {
        restoreBtn.disabled = false;
        restoreBtn.innerHTML = `${icon("download")} Restaurer`;
      }
    });
  }

  // ---------------- Étiquettes suggérées ----------------
  let presets = [...tagPresets];
  const presetListEl = main.querySelector("#preset-list");

  function drawPresets() {
    presetListEl.innerHTML = presets.length
      ? `<div class="chip-row" style="flex-wrap:wrap;overflow:visible;padding-bottom:0;">
          ${presets
            .map(
              (t, i) => `
            <button type="button" class="chip active" data-edit="${i}">
              #${escapeHTML(t)} ${icon("close", "chip-x")}
            </button>`
            )
            .join("")}
        </div>`
      : `<p style="color:var(--color-ink-muted);font-size:0.88rem;">Aucune étiquette suggérée pour l'instant — ajoutes-en ci-dessous.</p>`;

    presetListEl.querySelectorAll("[data-edit]").forEach((chip) => {
      chip.addEventListener("click", async (e) => {
        const i = Number(chip.dataset.edit);
        // Un clic sur la petite croix supprime directement (après confirmation).
        if (e.target.closest(".chip-x")) {
          const ok = await confirmSheet({
            title: "Supprimer cette étiquette ?",
            message: `"#${presets[i]}" ne sera plus proposée à la création d'une recette.`,
            confirmLabel: "Supprimer",
            danger: true,
          });
          if (ok) {
            presets.splice(i, 1);
            await setSetting("tagPresets", presets);
            drawPresets();
          }
          return;
        }
        openPresetEditor(i);
      });
    });
  }

  function openPresetEditor(index) {
    const current = presets[index];
    const { root, close } = openSheet(
      `<h3>Modifier l'étiquette</h3>
       <div class="field">
         <input type="text" id="preset-edit-input" value="${escapeHTML(current)}" />
       </div>
       <div class="btn-row">
         <button class="btn btn-danger" data-act="delete" type="button">${icon("trash")} Supprimer</button>
         <button class="btn btn-primary" data-act="save" type="button">${icon("check")} Enregistrer</button>
       </div>`,
      { center: true }
    );
    const input = root.querySelector("#preset-edit-input");
    input.focus();
    input.select();

    root.querySelector('[data-act="save"]').addEventListener("click", async () => {
      const val = input.value.trim();
      if (!val) { presets.splice(index, 1); } else { presets[index] = val; }
      await setSetting("tagPresets", presets);
      close();
      drawPresets();
    });
    root.querySelector('[data-act="delete"]').addEventListener("click", async () => {
      close();
      const ok = await confirmSheet({
        title: "Supprimer cette étiquette ?",
        message: `"#${current}" ne sera plus proposée à la création d'une recette.`,
        confirmLabel: "Supprimer",
        danger: true,
      });
      if (ok) {
        presets.splice(index, 1);
        await setSetting("tagPresets", presets);
        drawPresets();
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); root.querySelector('[data-act="save"]').click(); }
    });
  }

  drawPresets();

  main.querySelector("#preset-add-btn").addEventListener("click", async () => {
    const input = main.querySelector("#preset-input");
    const val = input.value.trim();
    if (!val) return;
    if (presets.some((p) => p.toLowerCase() === val.toLowerCase())) { toast("Déjà dans la liste"); return; }
    presets.push(val);
    await setSetting("tagPresets", presets);
    input.value = "";
    drawPresets();
  });
  main.querySelector("#preset-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); main.querySelector("#preset-add-btn").click(); }
  });

  // ---------------- Transcription ----------------
  main.querySelector("#save-transcription").addEventListener("click", async () => {
    await setSetting("transcriptionEndpoint", main.querySelector("#s-endpoint").value.trim());
    await setSetting("transcriptionApiKey", main.querySelector("#s-key").value.trim());
    toast("Réglages enregistrés");
  });
}

function chooseImportMode() {
  return new Promise((resolve) => {
    const { root, close } = openSheet(
      `<h3>Comment restaurer ?</h3>
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
