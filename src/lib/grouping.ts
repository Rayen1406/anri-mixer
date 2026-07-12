import type { Group, Participant } from './types'

/** A participant is "capable" in a domain when their 0..10 score clears this bar. */
export const CAPABLE_THRESHOLD = 5

const DOMAINS = ['electronics', 'programming', 'cad3d', 'ai'] as const
type Domain = (typeof DOMAINS)[number]

/** Deterministic LCG so results are reproducible from a seed. */
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function shuffleInPlace<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ---- Cost model ------------------------------------------------------------

/** Population variance of an array. */
function variance(xs: number[]): number {
  if (xs.length === 0) return 0
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  return xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length
}

/** Scale-free spread: variance normalized by the mean, so metrics on very
 *  different scales (score sums vs. age vs. group size) are comparable. */
function normSpread(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
  return variance(xs) / (mean * mean + 1)
}

/** Herfindahl concentration of maisons within a group: 1.0 = everyone from the
 *  same maison, lower = more mixed. */
function maisonConcentration(members: Participant[]): number {
  if (members.length === 0) return 0
  const counts = new Map<string, number>()
  for (const m of members) counts.set(m.maison, (counts.get(m.maison) ?? 0) + 1)
  let sum = 0
  for (const c of counts.values()) sum += (c / members.length) ** 2
  return sum
}

interface Weights {
  total: number
  domain: number
  age: number
  size: number
  maison: number
  coverage: number
}

const DEFAULT_WEIGHTS: Weights = {
  total: 2,
  domain: 1,
  age: 1.5,
  size: 6,
  maison: 2,
  coverage: 8,
}

function imbalanceCost(groups: Group[], w: Weights = DEFAULT_WEIGHTS): number {
  const sizes = groups.map((g) => g.members.length)
  const totals = groups.map((g) => g.members.reduce((a, p) => a + p.totalScore, 0))
  const ages = groups.map((g) => {
    const n = g.members.length || 1
    return g.members.reduce((a, p) => a + p.age, 0) / n
  })

  let cost = 0
  cost += w.total * normSpread(totals)
  cost += w.size * normSpread(sizes)
  cost += w.age * normSpread(ages)

  // Per-domain balance (equalise each skill across groups) + coverage gaps
  // (every group should have at least one capable person per domain).
  for (const d of DOMAINS) {
    const sums = groups.map((g) => g.members.reduce((a, p) => a + p.scores[d as Domain], 0))
    cost += w.domain * normSpread(sums)

    let gaps = 0
    for (const g of groups) {
      const capable = g.members.filter((p) => p.scores[d as Domain] >= CAPABLE_THRESHOLD).length
      if (capable === 0) gaps += 1
    }
    cost += w.coverage * gaps
  }

  // Maison mixing: average concentration across groups.
  const conc = groups.reduce((a, g) => a + maisonConcentration(g.members), 0) / groups.length
  cost += w.maison * conc

  return cost
}

// ---- Construction + optimization ------------------------------------------

function groupTotal(g: Group): number {
  return g.members.reduce((a, p) => a + p.totalScore, 0)
}

/**
 * Initial assignment. Locked participants are placed in their pinned group
 * first; the rest are distributed with a "largest-processing-time" heuristic
 * (each next-strongest candidate goes to the currently smallest group, ties
 * broken by lowest running total), which gives the annealer a well-balanced,
 * lock-respecting starting point.
 */
function initialAssignment(
  sorted: Participant[],
  groupCount: number,
  locked: Map<number, number>,
): Group[] {
  const groups: Group[] = Array.from({ length: groupCount }, (_, i) => ({ id: i + 1, members: [] }))
  const byId = new Map(groups.map((g) => [g.id, g]))

  for (const p of sorted) {
    const gid = locked.get(p.id)
    if (gid !== undefined) (byId.get(gid) ?? groups[0]).members.push(p)
  }

  for (const p of sorted) {
    if (locked.has(p.id)) continue
    let target = groups[0]
    for (const g of groups) {
      if (
        g.members.length < target.members.length ||
        (g.members.length === target.members.length && groupTotal(g) < groupTotal(target))
      ) {
        target = g
      }
    }
    target.members.push(p)
  }
  return groups
}

function cloneGroups(groups: Group[]): Group[] {
  return groups.map((g) => ({ ...g, members: [...g.members] }))
}

/**
 * Simulated annealing: proposes a swap (two groups exchange a member) or a move
 * (relocate a member from a larger to a smaller group, which never worsens size
 * balance). Worse states are accepted with probability exp(-Δ/T), letting the
 * search escape the local minima that pure hill-climbing gets stuck in.
 */
function anneal(
  initial: Group[],
  rand: () => number,
  iterations: number,
  locked: Set<number>,
): Group[] {
  let current = cloneGroups(initial)
  let currentCost = imbalanceCost(current)
  let best = cloneGroups(current)
  let bestCost = currentCost

  const T0 = Math.max(currentCost * 0.25, 1)
  const Tend = 0.001

  for (let iter = 0; iter < iterations; iter++) {
    const T = T0 * Math.pow(Tend / T0, iter / iterations)

    const gi = Math.floor(rand() * current.length)
    let gj = Math.floor(rand() * current.length)
    if (gi === gj) gj = (gj + 1) % current.length
    const A = current[gi]
    const B = current[gj]
    if (A.members.length === 0 || B.members.length === 0) continue

    const ai = Math.floor(rand() * A.members.length)
    const bj = Math.floor(rand() * B.members.length)

    // Never disturb a pinned participant.
    if (locked.has(A.members[ai].id) || locked.has(B.members[bj].id)) continue

    const next = cloneGroups(current)
    const move = rand() < 0.3 && next[gi].members.length > next[gj].members.length + 1
    if (move) {
      // Relocate one member from the larger group to the smaller one.
      const [m] = next[gi].members.splice(ai, 1)
      next[gj].members.push(m)
    } else {
      // Swap one member between the two groups.
      const tmp = next[gi].members[ai]
      next[gi].members[ai] = next[gj].members[bj]
      next[gj].members[bj] = tmp
    }

    const nextCost = imbalanceCost(next)
    const delta = nextCost - currentCost
    if (delta < 0 || rand() < Math.exp(-delta / T)) {
      current = next
      currentCost = nextCost
      if (currentCost < bestCost) {
        best = cloneGroups(current)
        bestCost = currentCost
      }
    }
  }

  return best
}

export function suggestGroupCount(participantCount: number): number {
  if (participantCount <= 4) return 2
  if (participantCount <= 9) return 3
  if (participantCount <= 16) return 4
  if (participantCount <= 25) return 5
  return Math.max(4, Math.round(Math.sqrt(participantCount)))
}

/**
 * Build balanced, mixed groups.
 *
 * 1. Sort by total score (shuffling only to break ties) so the snake draft
 *    actually distributes strong candidates evenly.
 * 2. Run several annealing restarts from different seeds and keep the best,
 *    since a single run can settle in a mediocre local minimum.
 */
export function createBalancedGroups(
  participants: Participant[],
  groupCount: number,
  seed = Date.now(),
  options: { restarts?: number; iterations?: number; locked?: Map<number, number> } = {},
): Group[] {
  const count = Math.max(2, Math.min(groupCount, participants.length))
  const restarts = options.restarts ?? 12
  const iterations = options.iterations ?? 2500
  const locked = options.locked ?? new Map<number, number>()
  const lockedIds = new Set(locked.keys())

  // Tie-break shuffle, THEN sort — the sort survives, unlike before.
  const rngSeed = makeRng(seed + 1)
  const tieBroken = shuffleInPlace([...participants], rngSeed)
  const sorted = tieBroken.sort((a, b) => b.totalScore - a.totalScore)

  const start = initialAssignment(sorted, count, locked)

  let best: Group[] | null = null
  let bestCost = Infinity
  for (let r = 0; r < restarts; r++) {
    const rand = makeRng(seed + 101 + r * 7919)
    const result = anneal(start, rand, iterations, lockedIds)
    const cost = imbalanceCost(result)
    if (cost < bestCost) {
      best = result
      bestCost = cost
    }
  }

  return best ?? start
}

/** Per-domain count of "capable" members in a group — used for the UI/PDF
 *  coverage view and to warn when a group lacks a skill entirely. */
export function domainCoverage(group: Group): Record<Domain, number> {
  const out = { electronics: 0, programming: 0, cad3d: 0, ai: 0 }
  for (const p of group.members) {
    for (const d of DOMAINS) {
      if (p.scores[d] >= CAPABLE_THRESHOLD) out[d] += 1
    }
  }
  return out
}
