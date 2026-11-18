// Bonus / malus : une manche gagnée amène un malus pour la suivante, une manche perdue un bonus.
// En mode chaos ils s'accumulent : une victoire retire le plus vieux bonus et ajoute un malus, et inversement.

export type MalusId = 'noLock' | 'noPreflop' | 'hiddenHistory' | 'timer' | 'hiddenFlopCard' | 'noSteal' | 'firstLocked' | 'noTurn' | 'roughRiver' | 'ghost' | 'lockedTop' | 'lockedBottom'
export type BonusId = 'swap' | 'reveal' | 'spyglass' | 'mastermind' | 'secondChance' | 'mountain' | 'bilge' | 'deadCards' | 'compass' | 'spy'
export type EffectId = MalusId | BonusId
export type EffectKind = 'malus' | 'bonus'

export interface EffectInfo {
  kind: EffectKind
  emoji: string
  name: string
  description: string
}

export const TIMER_SECONDS_PER_PLAYER = 20
export const DEAD_CARD_COUNT = 4

export const EFFECTS: Record<EffectId, EffectInfo> = {
  noLock: { kind: 'malus', emoji: '🔓', name: 'Pas de blocage', description: 'impossible de bloquer sa position.' },
  noPreflop: { kind: 'malus', emoji: '⏭️', name: 'Pas de pré-flop', description: 'la manche commence directement au flop.' },
  hiddenHistory: { kind: 'malus', emoji: '🙈', name: 'Historique masqué', description: 'les positions des tours précédents restent cachées jusqu\'au résultat.' },
  timer: { kind: 'malus', emoji: '⏱️', name: 'Chrono', description: `${TIMER_SECONDS_PER_PLAYER} s par joueur et par tour. Au bout du temps, ceux qui ne sont pas placés prennent les positions restantes et le tour passe.` },
  hiddenFlopCard: { kind: 'malus', emoji: '🂠', name: 'Carte cachée', description: 'la 1re carte du flop reste face cachée jusqu\'à la river.' },
  noSteal: { kind: 'malus', emoji: '🚫', name: 'Pas de vol', description: 'on ne prend qu\'une position libre. Pour récupérer une position occupée, son titulaire doit d\'abord la rendre.' },
  firstLocked: { kind: 'malus', emoji: '🥇', name: 'Premier verrouillé', description: 'à chaque tour, le premier qui prend une position est bloqué dessus jusqu\'au tour suivant.' },
  noTurn: { kind: 'malus', emoji: '⏭️', name: 'Pas de turn', description: 'pas de classement à la turn : la turn et la river sortent ensemble.' },
  roughRiver: { kind: 'malus', emoji: '🌊', name: 'Rivière agitée', description: 'à la river, une des 4 premières cartes du tableau, tirée au hasard, est remplacée par une nouvelle.' },
  ghost: { kind: 'malus', emoji: '👻', name: 'Joueur fantôme', description: 'un Fantôme reçoit 2 cartes cachées. Il y a une position de plus : celle qui reste vide est la sienne, et elle doit aussi être à la bonne place.' },
  lockedTop: { kind: 'malus', emoji: '⬆️', name: 'Tête verrouillée', description: 'qui prend la position 1 y est bloqué jusqu\'au tour suivant.' },
  lockedBottom: { kind: 'malus', emoji: '⬇️', name: 'Queue verrouillée', description: 'qui prend la dernière position y est bloqué jusqu\'au tour suivant.' },
  swap: { kind: 'bonus', emoji: '🔄', name: 'Échange', description: 'le premier qui clique remplace une de ses cartes.' },
  reveal: { kind: 'bonus', emoji: '👁️', name: 'Révélation', description: 'le premier qui clique montre une de ses cartes à la table.' },
  spyglass: { kind: 'bonus', emoji: '🔭', name: 'Longue-vue', description: 'une fois, le bot annonce la plus haute combinaison parmi toutes les mains, avec le tableau du moment.' },
  mastermind: { kind: 'bonus', emoji: '🎯', name: 'Mastermind', description: 'une fois, à partir du flop, quand tout le monde est placé, le bot dit combien de joueurs sont bien placés avec le tableau du moment, sans dire lesquels.' },
  secondChance: { kind: 'bonus', emoji: '🍀', name: 'Seconde chance', description: 'à la fin, une seule inversion entre deux joueurs voisins est pardonnée.' },
  mountain: { kind: 'bonus', emoji: '⛰️', name: 'Montagne', description: 'une fois, le bot annonce la plus haute carte en main, valeur seulement, sans dire qui l\'a.' },
  bilge: { kind: 'bonus', emoji: '⚓', name: 'Fond de cale', description: 'une fois, le bot annonce la plus basse carte en main, valeur seulement, sans dire qui l\'a.' },
  deadCards: { kind: 'bonus', emoji: '☠️', name: 'Cartes mortes', description: `une fois, le bot brûle ${DEAD_CARD_COUNT} cartes du paquet et les montre : elles ne sont dans aucune main et ne sortiront pas au tableau.` },
  compass: { kind: 'bonus', emoji: '🧭', name: 'Boussole', description: 'une fois, à partir du flop, on choisit un joueur placé et le bot dit s\'il est bien ou mal placé avec le tableau du moment.' },
  spy: { kind: 'bonus', emoji: '🕵️', name: 'Espion', description: 'le premier qui clique choisit un joueur : une de ses cartes, tirée au hasard, est montrée à la table.' },
}

export const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[]

// Effets de la manche suivante, selon le résultat de celle qui vient de finir
export function nextEffects(current: EffectId[], won: boolean, chaos: boolean, random: () => number = Math.random): EffectId[] {
  const added: EffectKind = won ? 'malus' : 'bonus'

  // sans chaos : un seul effet, qui ne dure qu'une manche
  if (!chaos)
    return withDrawn([], added, random)

  // en chaos : on retire le plus vieux effet de l'autre sorte, et on en ajoute un
  const removed: EffectKind = won ? 'bonus' : 'malus'
  const kept = [...current]
  const oldestIndex = kept.findIndex(id => EFFECTS[id].kind === removed)
  if (oldestIndex >= 0)
    kept.splice(oldestIndex, 1)
  return withDrawn(kept, added, random)
}

// Ajoute un effet tiré au hasard parmi ceux de cette sorte pas encore actifs (rien s'ils le sont tous)
function withDrawn(effects: EffectId[], kind: EffectKind, random: () => number): EffectId[] {
  const candidates = EFFECT_IDS.filter(id => EFFECTS[id].kind === kind && !effects.includes(id))
  if (candidates.length === 0)
    return effects
  return [...effects, candidates[Math.floor(random() * candidates.length)]]
}
