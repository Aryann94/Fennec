# Fennec — Sahara au crépuscule

Scène 3D interactive dans le navigateur : on se promène dans un désert saharien ou sur un littoral herbeux, caméra à hauteur de fennec (26 cm du sol). Le décor est entièrement généré procéduralement, aucun modèle 3D externe n'est chargé.

Un menu de départ propose les deux plateaux : **Désert** et **Littoral**. Le bouton `← Plateaux` (ou la touche `M`) ramène au menu.

## Plateau Désert

- **Terrain** : plan 300 × 300 m déformé par une fonction de bruit sinusoïdal (grandes dunes, ondulations moyennes, rides de sable), coloré par sommet du creux `#a85f38` vers la crête `#eab47c`.
- **Ciel** : dôme shader dégradé du brun-orangé de l'horizon au bleu nuit du zénith, halo de soleil bas, 300 étoiles, brouillard exponentiel couleur horizon.
- **Détails** : 45 rochers (dodécaèdres à facettes), 700 touffes d'herbe sèche en `InstancedMesh`, soleil et lumière directionnelle rasante avec ombres douces (2048²).
- **Déplacement** : marche / course, saut avec gravité, léger balancement de tête, terrain suivi au sol, zone de jeu limitée à un cercle de 130 m de rayon.
- **Collisions** : les rochers sont solides, on les contourne au lieu de les traverser.

## Plateau Littoral

- **Mer** : plan d'eau `MeshStandardMaterial` avec écume animée (trois bandes qui ondulent le long de la plage).
- **Terrain** : plage de sable qui descend sous le niveau de la mer, prairies vallonnées colorées par sommet (sable → vert clair → vert profond), 900 touffes d'herbe et 22 rochers sur le sable.
- **Stade de football** : enceinte compacte (~74 × 56 m, 9 m de haut) ; pelouse 44 × 28 m en bandes de tonte, lignes de jeu, rond central, surfaces de réparation, deux buts avec filets, sept gradins sur les quatre côtés, toiture annulaire et quatre panneaux d'éclairage de 14 m.
- **Couleurs** : sièges et bandeau de façade en jaune `#f4c81c` et vert `#0f7a3d`, en référence à la JS Kabylie.
- **Public** : environ 1 800 spectateurs instanciés (corps colorés et têtes) répartis sur les gradins, aux deux tiers en jaune et vert.
- **Drapeaux** : seize drapeaux algériens (vert à la hampe, blanc à la volée, croissant et étoile rouges) sur le portail, aux quatre coins de la pelouse, le long du bandeau sud et sur des mâts autour du stade ; ils ondulent doucement.
- **Entrée** : la tribune sud est percée d'un portail de 8 m, encadré de deux piliers rouges et surmonté d'une bannière « STADE », prolongé par un tunnel couvert éclairé qui débouche sur la pelouse. Une allée dallée mène de la plage jusqu'au portail.
- **Collisions** : tribunes, piliers du portail, mâts d'éclairage, poteaux de but et rochers sont infranchissables ; seul le portail permet d'entrer dans l'enceinte.
- **Ambiance** : ciel de jour (dégradé bleu), soleil haut, brouillard clair, ombres dynamiques.
- **Déplacement** : le joueur apparaît sur la plage, face au stade ; il est cantonné à la terre ferme (pas de baignade).

## Pile technique

| Élément | Version |
| --- | --- |
| React / React DOM | 19.3 |
| Three.js | 0.187 (`@types/three` fourni) |
| Vite | 8.3 (`@vitejs/plugin-react`) |
| TypeScript | 7.0, `strict`, `noEmit` (le typage est vérifié, Vite fait la compilation) |

## Prérequis

- **Node.js `^20.19.0` ou `>=22.12.0`** (exigence de Vite 8 ; testé ici avec Node 26)
- **npm** (testé avec npm 11.20)

## Installation

```bash
npm install
```

## Lancement en local

```bash
npm run dev
```

Vite affiche `Local: http://localhost:5173/` : ouvre cette adresse (`Ctrl` + clic dans le terminal VS Code). Le serveur recharge la page à chaque modification de fichier.

> **Sous Windows / PowerShell**, si tu obtiens `Impossible de charger le fichier … npm.ps1, car l'exécution de scripts est désactivée`, la politique d'exécution est `Restricted`. Deux issues :
>
> ```powershell
> npm.cmd run dev                                                    # contournement immédiat
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned   # correction durable, sans admin
> ```

## Commandes

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement avec rechargement à chaud |
| `npm run build` | Vérifie les types (`tsc --noEmit`) puis génère le site dans `dist/` |
| `npm run preview` | Sert le contenu de `dist/` (après un `build`) pour tester la version de production |

## Commandes de jeu

| Action | Touche |
| --- | --- |
| Avancer / reculer | `Flèche haut` / `Flèche bas`, ou `Z` / `S` (AZERTY) · `W` / `S` (QWERTY) |
| Tourner | `Flèche gauche` / `Flèche droite` |
| Se déplacer latéralement | `Q` / `D` (AZERTY) · `A` / `D` (QWERTY) |
| Courir | `Maj` (6 m/s au lieu de 2,6 m/s) |
| Sauter | `Espace` |
| Regarder à la souris | Cliquer une fois dans la scène, puis bouger la souris |
| Libérer la souris | `Échap` |
| Revenir au menu des plateaux | `M`, ou le bouton `← Plateaux` en haut à gauche |

Les touches sont lues par leur **position physique** (`event.code`), donc `ZQSD` fonctionne tel quel sur un clavier AZERTY sans changer la disposition.

## Structure du projet

```
Fennec/
├── index.html            page hôte (lang="fr", monte /src/main.tsx)
├── src/
│   ├── main.tsx          point d'entrée React (StrictMode)
│   ├── App.tsx           menu ↔ plateau sélectionné
│   ├── Menu.tsx          écran de choix des plateaux
│   ├── Explorer.tsx      moteur commun : renderer, caméra, entrées, boucle, nettoyage
│   ├── FennecDesert.tsx  plateau désert (wrapper d'Explorer)
│   ├── Littoral.tsx      plateau littoral (wrapper d'Explorer)
│   ├── scenes/
│   │   ├── types.ts      contrat d'un monde (heightAt, spawn, clamp, onFrame, dispose)
│   │   ├── desert.ts     construction de la scène désert
│   │   └── coast.ts      construction de la scène littoral + stade
│   └── index.css         reset, écran de menu et cartes des plateaux
├── vite.config.ts        plugin React
├── tsconfig.json         TypeScript strict, noEmit
└── package.json          scripts et dépendances
```

## Les composants de plateau

`FennecDesert` et `Littoral` sont autonomes et utilisables n'importe où :

```tsx
import FennecDesert from "./FennecDesert";

<FennecDesert style={{ height: "100vh" }} />
```

Ils acceptent `className`, `style` et un `onExit` optionnel (déclenché par `M`), occupent 100 % de leur conteneur (minimum 320 px de haut) et gèrent eux-mêmes le redimensionnement via un `ResizeObserver`. Toute la mécanique est mutualisée dans `Explorer.tsx` : chaque plateau ne fournit qu'une factory de monde (`buildDesert`, `buildCoast`) décrivant son décor, sa hauteur de sol, son point d'apparition et ses limites.

Points d'implémentation notables :

- **Constantes** : `GROUND_SIZE = 300` (terrain), `LIMIT = 130` (rayon de jeu), `EYE = 0.26` (hauteur de caméra en mètres).
- **`heightAt(x, z)`** : hauteur du sol à une coordonnée, partagée par le terrain, les objets et la caméra — c'est ce qui fait que la promenade suit les dunes.
- **Génération déterministe** : `mulberry32(7)` fournit un générateur pseudo-aléatoire à graine fixe, la scène est donc identique à chaque chargement.
- **Caméra d'ombre** : le frustum est étendu à 80 m et `updateProjectionMatrix()` est appelé après sa configuration, sinon les ombres restaient limitées aux 5 m par défaut.
- **Nettoyage** : au démontage du composant, la boucle `requestAnimationFrame` est annulée, les écouteurs retirés, le pointeur libéré, les géométries et matériaux `.dispose()`, le renderer détruit et le canvas retiré du DOM.

## Limites connues

- Pas de commandes tactiles : la scène est pensée pour clavier + souris.
- Vue purement subjective : aucun corps ni patte n'est affiché, même en baissant le regard.
- Aucune persistance : la position n'est pas sauvegardée d'une visite à l'autre.

## Remarque sur `.freebuff/`

Ce dossier contient l'identifiant local du projet pour Freebuff Desktop. Son `.gitignore` interne exclut `project-id`, il n'est donc pas publié sur GitHub et n'a pas besoin d'être versionné.
