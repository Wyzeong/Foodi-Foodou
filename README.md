# MonCarnet — carnet de recettes & menu de la semaine

PWA installable, 100% HTML/CSS/JS natifs, aucune dépendance, aucun backend.
Stockage local via IndexedDB. Fonctionne hors ligne après la première visite.

## Déploiement sur GitHub Pages

1. Crée un dépôt GitHub (public ou privé avec Pages activé sur le plan concerné).
2. Place **tout le contenu de ce dossier** (`index.html`, `manifest.json`, `sw.js`, `css/`, `js/`, `icons/`)
   à la racine du dépôt (ou dans `/docs` si tu préfères cette option).
3. Dans **Settings → Pages**, choisis la branche et le dossier (`/ (root)` ou `/docs`).
4. Attends la publication (URL du type `https://TON-COMPTE.github.io/TON-DEPOT/`).
5. Ouvre cette URL sur ton téléphone :
   - **Android (Chrome)** : menu ⋮ → « Installer l'application » ou « Ajouter à l'écran d'accueil ».
   - **iPhone (Safari)** : bouton Partager → « Sur l'écran d'accueil ».

Tout est en chemins relatifs (`./...`), donc ça fonctionne aussi bien à la racine
d'un domaine que dans un sous-dossier de type `username.github.io/repo/`.

## Mettre à jour l'application

À chaque mise à jour du code, **avant de publier** :

1. Incrémente `APP_VERSION` dans `js/version.js` (ex: `"1.0.0"` → `"1.1.0"`).
2. Incrémente `CACHE_VERSION` dans `sw.js` avec **la même valeur**.
3. Republie (`git push`).

Le nouveau numéro de version force le Service Worker à recréer son cache et à
supprimer l'ancien automatiquement (voir l'événement `activate` dans `sw.js`).
Le numéro s'affiche dans **Paramètres → À propos**.

## Fonctionnement hors ligne

- Le Service Worker (`sw.js`) met en cache tous les fichiers de l'app à l'installation.
- Toutes les données (recettes, menu, réglages) sont stockées **uniquement** dans
  l'IndexedDB du téléphone (`js/db.js`) — rien n'est envoyé à un serveur.
- Les seules fois où l'app appelle Internet, c'est à la demande explicite de
  l'utilisateur, et ça n'est jamais bloquant pour l'usage courant :
  - récupération du texte d'une page recette depuis une URL,
  - transcription d'une vidéo (optionnel, nécessite ta propre clé API),
  - partage du fichier de sauvegarde via la feuille de partage native.

## Sauvegarde / Restauration

- **Paramètres → Exporter** : génère un fichier `.json` complet. Si le téléphone
  le permet, la feuille de partage native s'ouvre (tu peux alors l'envoyer vers
  Google Drive, Fichiers/iCloud, etc.) ; sinon le fichier est simplement téléchargé.
- **Paramètres → Importer** : relit un fichier `.json` exporté, au choix en
  fusion ou en remplacement complet.

Il n'y a pas d'intégration directe à un compte Google Drive/iCloud (cela
nécessiterait un serveur et des identifiants OAuth, contraire à la contrainte
« pas de backend »). La feuille de partage native est le pont vers le cloud
de ton choix, sans dépendance ni compte tiers configuré dans l'app.

## Transcription vidéo — comment ça marche vraiment

Il n'existe pas de service de transcription gratuit et sans clé utilisable
depuis une page web statique. La page **Recettes → Nouvelle recette → onglet
« Vidéo → texte »** permet donc deux choses :

- si tu configures dans **Paramètres → Transcription** l'URL d'un service
  (le tien ou un service tiers compatible, attendant `{ url }` en POST et
  répondant `{ text }`) + sa clé API, l'app l'appelle directement ;
- sinon, tu colles la transcription à la main (ex. récupérée depuis les
  sous-titres YouTube, un autre outil, etc.) — ça reste pleinement fonctionnel.

## Import de recette depuis une URL — limite CORS

Beaucoup de sites bloquent la récupération de leur contenu depuis une autre
origine (politique CORS, hors du contrôle de l'app). L'app tente une
récupération directe ; en cas d'échec, elle t'invite à copier-coller le texte
de la page manuellement, ce qui fonctionne toujours.

## Geste retour Android / iOS — limite connue

- **Android** : le geste/bouton retour du système déclenche la navigation
  interne (History API) exactement comme une vraie app, avec confirmation
  de sortie proposée depuis l'écran d'accueil.
- **iOS** : une web app « Ajoutée à l'écran d'accueil » **n'expose aucun geste
  système de retour** (particularité d'iOS, pas de l'app). C'est pourquoi un
  bouton retour est affiché en haut de chaque écran secondaire : il reproduit
  exactement le même comportement de navigation.

## Structure du projet

```
index.html          Coquille HTML unique
manifest.json        Manifest PWA (nom, icônes, thème, mode standalone)
sw.js                 Service Worker (cache versionné, offline)
css/style.css         Thème visuel (variables CSS posées une fois)
js/
  app.js              Orchestrateur (en-tête, rendu des pages, SW)
  router.js           Navigation History API + confirmation de sortie
  db.js               IndexedDB (recettes, menu, réglages, export/import)
  ui.js               Toast, feuilles modales, confirmation
  icons.js             Icônes SVG inline
  version.js           Numéro de version affiché dans l'app
  pages/
    home.js            Accueil
    week.js             Menu de la semaine (vue hebdomadaire)
    recipes.js          Livre de recettes (recherche, filtre par ingrédient)
    recipe-detail.js     Fiche recette
    recipe-edit.js       Création/édition (manuel, import URL, vidéo→texte)
    settings.js          Paramètres (version, export/import, transcription)
icons/                 Icônes de l'app (192/512, versions maskable, apple-touch-icon)
```
