# Agent Pipeline

Pipeline multi-agents Claude avec 3 agents en séquence : **Orchestrator → Dev Agent → QA Agent**

**Live** : https://sleeplow.github.io/Agent-App/

---

## Installation sur iPhone / Android

### iPhone (iOS Safari)
1. Ouvrir l'app dans Safari : `https://sleeplow.github.io/Agent-App/`
2. Appuyer sur le bouton **Partager** (icône carré avec flèche)
3. Sélectionner **« Sur l'écran d'accueil »**
4. L'app s'ouvre en plein écran, sans barre Safari, comme une app native

### Android (Chrome)
1. Ouvrir l'app dans Chrome
2. Appuyer sur les **⋮ (3 points)** en haut à droite
3. Sélectionner **« Ajouter à l'écran d'accueil »** ou **« Installer l'application »**
4. L'app s'installe avec son icône et tourne en mode standalone

---

## Fonctionnalités PWA

| Fonctionnalité | Détail |
|---|---|
| Installable | Icône sur l'écran d'accueil iOS & Android |
| Mode standalone | Sans barre de navigation du navigateur |
| Safe areas | Support encoche / Dynamic Island / home indicator |
| Offline ready | Service worker + cache Workbox |
| Icône adaptative | Maskable icon pour Android |
| Thème système | Status bar couleur ambre (#f0a500) |
| Langue | Interface en français |

---

## Utilisation

1. Saisir votre **clé API Anthropic** (sauvegardée automatiquement dans le navigateur)
2. Optionnel : renseigner les **IDs des agents** pour référence
3. Écrire un **brief de projet** dans la zone de texte
4. Appuyer sur **▶ Lancer le pipeline**

Les 3 agents s'activent en séquence et leurs réponses s'affichent avec un effet typewriter par onglet.

---

## Développement local

```bash
npm install
npm run dev
```

## Déploiement manuel

```bash
npm run deploy
```

Le déploiement automatique se déclenche à chaque push sur `main` via GitHub Actions.

---

## Stack

- React 18 + Vite 6
- `vite-plugin-pwa` — manifest, service worker, Workbox
- GitHub Pages (via `gh-pages` + GitHub Actions)
- Anthropic API (`claude-sonnet-4-20250514`, appel direct depuis le navigateur)
- localStorage pour la persistance clé API et IDs agents
