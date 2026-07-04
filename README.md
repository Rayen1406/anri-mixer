# Générateur de groupes — ANRI

Application web simple pour créer des **groupes équilibrés et mixtes** à partir d'un export CSV Google Forms (formulaire d'entretien ANRI), puis télécharger un **PDF** prêt à imprimer.

## Utilisation

```bash
cd group-maker
npm install
npm run dev
```

Ouvrez l'URL affichée (souvent `http://localhost:5173`).

1. Dans **Google Forms** → onglet **Réponses** → menu **⋮** → **Télécharger les réponses (.csv)**
2. Glissez le fichier `.csv` dans la zone ou cliquez pour l'importer
3. Ajustez le **nombre de groupes** si besoin
4. Cliquez sur **Télécharger le PDF**

## Équilibrage

Les groupes sont construits pour être **mixtes et équilibrés** sur :

- Niveau global et par domaine (électronique, programmation, 3D, IA)
- Âge moyen
- Répartition des maisons / affiliations
- Taille des groupes (le plus égal possible)

L'algorithme utilise un **snake draft** (comme pour des équipes sportives) puis des échanges automatiques pour réduire les écarts entre groupes.

## Stack

- React + Vite + TypeScript
- PapaParse (CSV)
- jsPDF + autoTable (PDF)
- Tout tourne **dans le navigateur** — aucune donnée n'est envoyée à un serveur

## Build production

```bash
npm run build
npm run preview
```

Les fichiers statiques sont dans `dist/` — déployables sur Netlify, Vercel, GitHub Pages, etc.
