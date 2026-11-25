/**
 * Dialogue du Touareg, à écrire par le groupe.
 *
 * Chaque étape = une réplique du Touareg, puis les réponses possibles du joueur
 * (touches 1, 2, 3…). Après une réponse, le Touareg acquiesce et passe à l'étape suivante.
 * Une étape sans réponse termine le dialogue (touche E pour fermer).
 */
export type DialogueStep = {
  line: string;
  answers: string[];
};

export const TOUAREG_DIALOGUE: DialogueStep[] = [
  { line: "[réplique à écrire]", answers: ["[réponse à écrire]", "[réponse à écrire]"] },
  { line: "[réplique à écrire]", answers: ["[réponse à écrire]", "[réponse à écrire]"] },
  { line: "[réplique à écrire]", answers: [] },
];
