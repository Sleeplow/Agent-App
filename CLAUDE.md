# Agent-App — Instructions Claude

## Stack
React 18 + Vite · GitHub Pages (`/Agent-App/`) · Anthropic API (browser direct)

---

## Règles obligatoires avant tout commit

### 1. Vérification UI/UX avec UI Pro Max

Avant chaque modification graphique, interroger le skill uipro :

```bash
# Design system complet
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<contexte>" --design-system -p "Agent Pipeline"

# Guidelines UX ciblées
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<sujet>" --domain ux

# Stack React
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<sujet>" --stack react
```

**Checklist UI obligatoire :**
- [ ] Aucun emoji utilisé comme icône UI (utiliser SVG Lucide/Heroicons)
- [ ] `cursor: pointer` sur tous les éléments cliquables
- [ ] `focus-visible` visible sur tous les éléments interactifs
- [ ] Touch targets ≥ 44px de hauteur
- [ ] `aria-label` sur tous les boutons et champs
- [ ] `prefers-reduced-motion` respecté dans les animations
- [ ] Transitions entre 150–300ms
- [ ] Responsive testé : 375px / 768px / 1024px / 1440px

---

### 2. Sanity check — Nettoyage des artefacts

Avant chaque commit, vérifier que le code ne contient pas :

- [ ] `console.log` / `console.error` / `console.warn` oubliés
- [ ] Variables déclarées mais non utilisées
- [ ] Imports inutilisés
- [ ] Commentaires `TODO` / `FIXME` / `HACK` non résolus
- [ ] Code mort (fonctions, branches, états jamais atteints)
- [ ] Clés hardcodées ou secrets dans le code source
- [ ] Valeurs de debug laissées (`true`, `false`, données fictives)
- [ ] Doublons de props ou d'attributs JSX (ex : deux `style={{}}` sur le même élément)

```bash
# Vérifier les imports/variables inutilisés au build
npm run build
```

---

### 3. Revue de sécurité — Expert cybersécurité

Chaque modification touchant l'API, le stockage ou les entrées utilisateur doit passer cette grille :

**Données sensibles**
- [ ] La clé API n'est jamais loggée ni affichée en clair dans le DOM
- [ ] `localStorage` utilisé uniquement pour les préférences (pas de données sensibles au-delà de la clé API choisie par l'utilisateur)
- [ ] Aucune clé API dans le code source, les variables d'env Vite (`VITE_*`) ou les commits

**Entrées utilisateur**
- [ ] Toutes les entrées affichées via React (jamais de `dangerouslySetInnerHTML` non nécessaire)
- [ ] Pas d'injection possible via le brief ou les champs de config
- [ ] Validation côté client présente sur les champs critiques (longueur max, format)

**Appels réseau**
- [ ] Seul `https://api.anthropic.com` est appelé — aucun autre endpoint externe
- [ ] Le header `anthropic-dangerous-direct-browser-access: true` est conscient et documenté
- [ ] Pas de données utilisateur envoyées à des services tiers non déclarés

**Dépendances**
- [ ] Pas de nouvelle dépendance ajoutée sans vérification (`npm audit`)
- [ ] `package-lock.json` toujours commité pour verrouiller les versions

```bash
npm audit
```

---

### 4. Tests et validation fonctionnelle

Avant de déclarer une feature terminée, valider manuellement :

**Pipeline complet**
- [ ] Saisir une clé API valide → sauvegardée en localStorage après rechargement
- [ ] Saisir un brief → bouton "Lancer" s'active
- [ ] Pipeline se lance : les 3 bulles s'activent en séquence avec spinner
- [ ] Chaque onglet affiche le bon résultat avec effet typewriter
- [ ] Bouton "Nouveau brief" remet tout à zéro

**États d'erreur**
- [ ] Clé API invalide → message d'erreur affiché proprement
- [ ] Brief trop court → bouton reste désactivé
- [ ] Erreur réseau → `role="alert"` visible, pipeline revient à `idle`

**Accessibilité clavier**
- [ ] Tous les boutons atteignables à la touche `Tab`
- [ ] `Enter` sur les bulles d'agents fonctionne quand `isDone`
- [ ] Focus visible sur chaque élément interactif

**Persistance**
- [ ] Recharger la page → clé API et IDs agents restaurés depuis localStorage
- [ ] Vider le localStorage → champs vides, app fonctionnelle

---

## Workflow Git

```
feature branch  →  claude/...
merge target    →  main  (déclenche deploy GitHub Pages via Actions)
pages branch    →  gh-pages  (gérée automatiquement par l'Action)
```

- Toujours développer sur une branche feature, jamais directement sur `main`
- Merge dans `main` uniquement après validation des 4 règles ci-dessus
- Message de commit : `type: description courte` (feat / fix / refactor / docs / chore)

---

## Déploiement

Le push sur `main` déclenche automatiquement `.github/workflows/deploy.yml` qui :
1. `npm ci` → `npm run build`
2. Publie `dist/` sur la branche `gh-pages`
3. Live sur `https://sleeplow.github.io/Agent-App/`
