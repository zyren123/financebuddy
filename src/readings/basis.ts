import type { DashboardState } from '../dashboard/types.js'
import type { ReadingsBasis, ReadingsSnapshot } from './model.js'

export const FALLBACK_BASIS: ReadingsBasis = {
  pairs: [
    { numerator: 'VTV', denominator: 'QQQ' },
    { numerator: 'SCHD', denominator: 'QQQ' },
    { numerator: 'CGDV', denominator: 'QQQ' },
  ],
  rocPeriod: 35,
}

export function basisOf(state: DashboardState | null): ReadingsBasis {
  const card = state?.cards.find((c) => c.kind === 'ratioRoc')
  if (card?.kind !== 'ratioRoc') return FALLBACK_BASIS
  return { pairs: card.pairs.length > 0 ? card.pairs : FALLBACK_BASIS.pairs, rocPeriod: card.rocPeriod }
}

export function basisOfSnapshot(snapshot: ReadingsSnapshot): ReadingsBasis {
  return { pairs: snapshot.ratios.map((r) => r.pair), rocPeriod: snapshot.rocPeriod }
}

export function sameBasis(a: ReadingsBasis, b: ReadingsBasis): boolean {
  return (
    a.rocPeriod === b.rocPeriod &&
    a.pairs.length === b.pairs.length &&
    a.pairs.every((p, i) => p.numerator === b.pairs[i]?.numerator && p.denominator === b.pairs[i]?.denominator)
  )
}

export function pairSymbols(basis: ReadingsBasis): string[] {
  return [...new Set(basis.pairs.flatMap((p) => [p.numerator, p.denominator]))]
}

export function symbolsOf(state: DashboardState | null, basis: ReadingsBasis): string[] {
  const fromCards = (state?.cards ?? []).flatMap((c) =>
    c.kind === 'ratioRoc' ? c.pairs.flatMap((p) => [p.numerator, p.denominator]) : [c.symbol],
  )
  return [...new Set([...fromCards, ...pairSymbols(basis)])]
}
