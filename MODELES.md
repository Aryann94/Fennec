# Modèles 3D : fennec et touareg

Les deux fichiers sont à placer dans `public/models/` : `fennec.glb` et `touareg.glb`.

## Commun aux deux

- Échelle réelle en mètres, Y vers le haut, le personnage regarde vers +Z, les pieds à y = 0.
- Pas de texture : les couleurs sont dans les sommets (COLOR_0). Il ne faut pas toucher à `material.color`.
- Mettre `frustumCulled = false` sur les SkinnedMesh.
- Toutes les animations sont « sur place » : c'est le code qui déplace le personnage.

## fennec.glb (personnage joueur, 0,37 m de haut)

Os : root, spine_01, spine_02, neck, head, ear_L, ear_R, tail_01 à tail_04, upperarm/forearm/paw _L/_R, thigh/shin/foot/toe _L/_R.

| Animation | Durée | Boucle | Calée pour |
| --- | --- | --- | --- |
| idle | 3 s | oui | à l'arrêt |
| walk | 0,67 s | oui | 0,26 m/s |
| trot | 0,42 s | oui | 0,72 m/s |
| run | 0,33 s | oui | 1,25 m/s |
| jump | 0,92 s | non | sur place |

Pour éviter que les pattes glissent : `timeScale = vitesse réelle / vitesse du clip`. Le jeu utilise 1,1 m/s en marche normale (clip trot) et 2,5 m/s avec Maj (clip run).

## touareg.glb (PNJ de dialogue, 1,89 m de haut)

Squelette maison (plus Mixamo) : root, hips, spine, chest, neck, head, shoulder/upper_arm/forearm/hand/thumb _L/_R, thigh/shin/foot/toe _L/_R. La tête s'oriente avec l'os `head` (et un peu `neck`).

| Animation | Durée | Usage |
| --- | --- | --- |
| idle | 4 s | attente, en boucle |
| talk | 4 s | pendant qu'il parle, en boucle |
| nod | 2 s | il acquiesce, une fois |
| wave | 1,2 s | salut, cycle à boucler 2 ou 3 fois |

Pas d'animation de marche : il ne se déplace pas.

## fennec.glb : matériaux

Trois matériaux : `Fennec_Fur` (pelage), `Fennec_Eyes` (yeux seuls), `Fennec_Nose` (truffe). En vue par les yeux, on peut cacher le mesh `Fennec_Eyes` sans perdre la truffe.

## Côté code (fait)

Les personnages sont dans `src/characters/` : `fennec.ts`, `touareg.ts`, `dialogue.ts` et `common.ts` (outils partagés).

- Un AnimationMixer par personnage, avec des fondus d'environ 0,25 s entre les animations.
- Fennec : idle, walk, trot, run ou jump selon la vitesse et la touche de saut ; posé sur le terrain avec `heightAt` et incliné selon la pente. Oreilles et queue animées en code par-dessus les clips.
- Touareg : wave quand le joueur approche (moins de 4,5 m), puis idle ; talk pendant le dialogue, nod quand le joueur répond. Sa tête se tourne vers le fennec. Chaque changement de clip est affiché dans la console (`[Touareg] clip : …`).
- Les rotations ajoutées en code partent toujours de la pose du mixer (classe `MixerPose`) : le mixer ne réécrit un os que si l'animation change sa valeur, donc sans ça les rotations s'accumulent d'une image à l'autre.
- Géométries, matériaux et mixers sont libérés au démontage du composant.

## Caméra et commandes

- **Vue par défaut : par les yeux du fennec.** On aperçoit le bout de la truffe en bas de l'écran, et les pattes avant en regardant vers le bas. La souris tourne la tête du fennec ; au-delà de la limite du cou, le corps suit. Les globes oculaires (`Fennec_Eyes`) sont cachés dans cette vue.
- **Touche C : vue de derrière**, pour voir le fennec en entier. La tête regarde devant elle, ou vers le Touareg quand il est proche.
- **Touche E** près du Touareg : dialogue, réponses avec 1 ou 2. Les répliques sont à écrire dans `src/characters/dialogue.ts` (pour l'instant « [réplique à écrire] »).

## Placement dans le désert

Le joueur part face au soleil. Le Touareg est à 5,7 m, à 90° de la direction du soleil (sur la gauche) : il est éclairé de profil, juste hors de l'écran au départ, et visible en tournant un peu la tête. Sa position est calculée à partir de la direction du soleil dans `src/scenes/desert.ts`.
