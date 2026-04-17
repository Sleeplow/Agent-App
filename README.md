# Agent Pipeline

Pipeline multi-agents Claude avec 3 agents en séquence : **Orchestrator → Dev Agent → QA Agent**

**Live** : https://sleeplow.github.io/Agent-App/

## Utilisation

1. Saisir votre **clé API Anthropic** (sauvegardée automatiquement dans le navigateur)
2. Optionnel : renseigner les **IDs des agents** pour référence
3. Écrire un **brief de projet** dans la zone de texte
4. Cliquer **▶ Lancer le pipeline**

Les 3 agents s'activent en séquence et leurs réponses s'affichent avec un effet typewriter par onglet.

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

## Stack

- React 18 + Vite
- GitHub Pages (via `gh-pages` + GitHub Actions)
- Anthropic API (`claude-sonnet-4-20250514`)
