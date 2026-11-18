import { describe, expect, it } from 'vitest'
import { EFFECTS, type EffectId, nextEffects } from './effects.js'

// toujours le 1er candidat : noLock en malus, swap en bonus
const first = () => 0

describe('nextEffects', () => {
  it('nextEffects_SansChaosVictoire_UnSeulMalus', () => {
    expect(nextEffects(['swap', 'spyglass'], true, false, first)).toEqual(['noLock'])
  })

  it('nextEffects_SansChaosDefaite_UnSeulBonus', () => {
    expect(nextEffects(['noLock', 'timer'], false, false, first)).toEqual(['swap'])
  })

  it('nextEffects_ChaosTroisVictoires_TroisMalusDifferents', () => {
    let effects: EffectId[] = []
    for (let i = 0; i < 3; i++) {
      effects = nextEffects(effects, true, true, first)
    }

    expect(effects).toEqual(['noLock', 'noPreflop', 'hiddenHistory'])
  })

  it('nextEffects_ChaosDefaiteApresTroisMalus_RetireLePlusVieuxEtAjouteUnBonus', () => {
    const effects = nextEffects(['noLock', 'noPreflop', 'hiddenHistory'], false, true, first)

    expect(effects).toEqual(['noPreflop', 'hiddenHistory', 'swap'])
  })

  it('nextEffects_ChaosVictoireAvecBonus_RetireUnBonusEtAjouteUnMalus', () => {
    const effects = nextEffects(['spyglass', 'mastermind'], true, true, first)

    expect(effects).toEqual(['mastermind', 'noLock'])
  })

  it('nextEffects_ChaosTousLesMalusDejaActifs_NAjouteRien', () => {
    const allMalus = (Object.keys(EFFECTS) as EffectId[]).filter(id => EFFECTS[id].kind === 'malus')

    expect(nextEffects(allMalus, true, true, first)).toEqual(allMalus)
  })

  it('nextEffects_Hasard_TireParmiLesCandidats', () => {
    // 0.99 → le dernier malus de la liste
    expect(nextEffects([], true, false, () => 0.99)).toEqual(['ghost'])
  })
})
