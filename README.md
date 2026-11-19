# Fennec

Projet de finalisation de semestre en Master 1 CEN (Création et Expérience Numérique) cours d'éditorialisation de Scène 3D interactive dans la peau du Fennec sur navigateur.

## Pile technique

| Élément | Version |
| --- | --- |
| React / React DOM | 19.3 |
| Three.js | 0.187 (`@types/three` fourni) |
| Vite | 8.3 (`@vitejs/plugin-react`) |
| TypeScript | 7.0, `strict`, `noEmit` |

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

Vite affiche `Local: http://localhost:5173/` : ouvre cette adresse. Le serveur recharge la page à chaque modification de fichier.

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

Les touches sont lues par leur **position physique** (`event.code`), donc `ZQSD` fonctionne tel quel sur un clavier AZERTY sans changer la disposition.

## Structure du projet

```
Fennec/
├── index.html            page hôte (lang="fr", monte /src/main.tsx)
├── src/
│   ├── main.tsx          point d'entrée React (StrictMode)
│   ├── App.tsx           monte <FennecDesert style={{ height: "100vh" }} />
│   ├── FennecDesert.tsx  toute la scène three.js (création, boucle, nettoyage)
│   └── index.css         reset marges / hauteur 100 %
├── vite.config.ts        plugin React
├── tsconfig.json         TypeScript strict, noEmit
└── package.json          scripts et dépendances
```

## Le composant `FennecDesert`

Composant autonome, utilisable n'importe où :

```tsx
import FennecDesert from "./FennecDesert";

<FennecDesert style={{ height: "100vh" }} />
```

Il accepte `className` et `style`, occupe 100 % de son conteneur (minimum 320 px de haut) et gère lui-même le redimensionnement via un `ResizeObserver`.

Points d'implémentation notables :

- **Constantes** : `GROUND_SIZE = 300` (terrain), `LIMIT = 130` (rayon de jeu), `EYE = 0.26` (hauteur de caméra en mètres).
- **`heightAt(x, z)`** : hauteur du sol à une coordonnée, partagée par le terrain, les objets et la caméra, c'est ce qui fait que la promenade suit les dunes.
- **Génération déterministe** : `mulberry32(7)` fournit un générateur pseudo-aléatoire à graine fixe, la scène est donc identique à chaque chargement.
- **Caméra d'ombre** : le frustum est étendu à 80 m et `updateProjectionMatrix()` est appelé après sa configuration, sinon les ombres restaient limitées aux 5 m par défaut.
- **Nettoyage** : au démontage du composant, la boucle `requestAnimationFrame` est annulée, les écouteurs retirés, le pointeur libéré, les géométries et matériaux `.dispose()`, le renderer détruit et le canvas retiré du DOM.

## Limites connues

- Pas de commandes tactiles : la scène est pensée pour clavier + souris.
- Le corps du fennec n'est pas modélisé, la caméra est simplement placée à sa hauteur (pas de museau ni de pattes visibles).
- Aucune persistance : la position n'est pas sauvegardée d'une visite à l'autre.
