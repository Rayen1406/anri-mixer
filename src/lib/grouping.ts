import type { Group, Participant } from './types'

function shuffle<T>(arr: T[], seed: number): T[] {
  const copy = [...arr]
  let s = seed
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function groupStats(members: Participant[]) {
  const n = members.length || 1
  const sum = (fn: (p: Participant) => number) => members.reduce((a, p) => a + fn(p), 0)
  return {
    count: members.length,
    total: sum((p) => p.totalScore),
    electronics: sum((p) => p.scores.electronics),
    programming: sum((p) => p.scores.programming),
    cad3d: sum((p) => p.scores.cad3d),
    ai: sum((p) => p.scores.ai),
    age: sum((p) => p.age) / n,
    maisons: new Set(members.map((p) => p.maison)).size,
  }
}

function imbalanceCost(groups: Group[]): number {
  const stats = groups.map((g) => groupStats(g.members))
  const avg = (key: keyof ReturnType<typeof groupStats>) =>
    stats.reduce((a, s) => a + (s[key] as number), 0) / stats.length

  const variance = (key: keyof ReturnType<typeof groupStats>) => {
    const mean = avg(key)
    return stats.reduce((a, s) => a + ((s[key] as number) - mean) ** 2, 0)
  }

  return (
    variance('total') * 2 +
    variance('electronics') +
    variance('programming') +
    variance('cad3d') +
    variance('ai') +
    variance('age') * 3 +
    variance('count') * 50 +
    variance('maisons') * 5
  )
}

function snakeDraft(sorted: Participant[], groupCount: number): Group[] {
  const groups: Group[] = Array.from({ length: groupCount }, (_, i) => ({ id: i + 1, members: [] }))

  sorted.forEach((p, i) => {
    const round = Math.floor(i / groupCount)
    const pos = i % groupCount
    const idx = round % 2 === 0 ? pos : groupCount - 1 - pos
    groups[idx].members.push(p)
  })

  return groups
}

function optimizeSwaps(groups: Group[], iterations: number, seed: number): Group[] {
  let current = groups.map((g) => ({ ...g, members: [...g.members] }))
  let cost = imbalanceCost(current)
  let s = seed

  for (let iter = 0; iter < iterations; iter++) {
    s = (s * 1664525 + 1013904223) >>> 0
    const gi = s % current.length
    s = (s * 1664525 + 1013904223) >>> 0
    const gj = s % current.length
    if (gi === gj) continue

    const mi = s % (current[gi].members.length || 1)
    s = (s * 1664525 + 1013904223) >>> 0
    const mj = s % (current[gj].members.length || 1)

    if (!current[gi].members[mi] || !current[gj].members[mj]) continue

    const next = current.map((g) => ({ ...g, members: [...g.members] }))
    const tmp = next[gi].members[mi]
    next[gi].members[mi] = next[gj].members[mj]
    next[gj].members[mj] = tmp

    const nextCost = imbalanceCost(next)
    if (nextCost < cost) {
      current = next
      cost = nextCost
    }
  }

  return current
}

export function suggestGroupCount(participantCount: number): number {
  if (participantCount <= 4) return 2
  if (participantCount <= 9) return 3
  if (participantCount <= 16) return 4
  if (participantCount <= 25) return 5
  return Math.max(4, Math.round(Math.sqrt(participantCount)))
}

export function createBalancedGroups(participants: Participant[], groupCount: number, seed = Date.now()): Group[] {
  const count = Math.max(2, Math.min(groupCount, participants.length))
  const sorted = shuffle([...participants].sort((a, b) => b.totalScore - a.totalScore), seed)
  const drafted = snakeDraft(sorted, count)
  return optimizeSwaps(drafted, 3000, seed + 1)
}
