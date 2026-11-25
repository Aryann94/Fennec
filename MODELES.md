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

Pour éviter que les pattes glissent : `timeScale = vitesse réelle / vitesse du clip`. Les vitesses actuelles du jeu (2,6 et 6 m/s) sont trop rapides pour ces clips.

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

## Ce qu'on attend côté code

- Un AnimationMixer par personnage, avec des fondus (environ 0,25 s) entre les animations.
- Fennec : idle, walk, trot, run ou jump selon la vitesse et la touche de saut ; posé sur les dunes avec `heightAt` et incliné selon la pente.
- Par-dessus les clips, en code, après `mixer.update()` : oreilles et queue du fennec qui bougent, tête du touareg qui se tourne vers le joueur. Toujours partir de la rotation posée par le mixer, sinon les rotations s'accumulent.
- Touareg : wave quand le joueur approche, puis idle ; talk pendant le dialogue, nod quand le joueur répond.
- Libérer géométries, matériaux et mixers au démontage du composant.

Point à décider avec le groupe : la caméra est en première personne, donc le fennec n'est jamais visible à l'écran.
