import { useCallback, useMemo, useState } from 'react'
import { parseCsvFile } from './lib/csvParser'
import { createBalancedGroups, domainCoverage } from './lib/grouping'
import { downloadGroupsPdf } from './lib/pdfExport'
import type { Group, Participant } from './lib/types'

const DEFAULT_GROUP_COUNT = 4

const DOMAIN_LABELS: { key: 'electronics' | 'programming' | 'cad3d' | 'ai'; label: string }[] = [
  { key: 'electronics', label: 'Élec.' },
  { key: 'programming', label: 'Prog.' },
  { key: 'cad3d', label: '3D' },
  { key: 'ai', label: 'IA' },
]

// Gap (déclaré − mesuré, sur 10) au-delà duquel un candidat est signalé.
const FLAG_THRESHOLD = 3

function LogoMark({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="ANRI">
      <defs>
        <linearGradient id="anriNavy" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#111C33" />
          <stop offset="1" stopColor="#1E3A8A" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="24" fill="url(#anriNavy)" />
      <g fill="none" stroke="#9FC0FF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 42 Q50 22 68 42" />
        <path d="M59.1 39.3 L68 42 L66.2 32.9" />
        <path d="M68 62 Q50 82 32 62" />
        <path d="M40.9 64.7 L32 62 L33.8 71.1" />
      </g>
      <circle cx="32" cy="52" r="12" fill="#3B82F6" />
      <circle cx="68" cy="52" r="12" fill="#F59E0B" />
    </svg>
  )
}

function App() {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [groupCount, setGroupCount] = useState(DEFAULT_GROUP_COUNT)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOverGroup, setDragOverGroup] = useState<number | null>(null)
  const [seed, setSeed] = useState(() => Date.now())
  const [fileName, setFileName] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locked, setLocked] = useState<Set<number>>(new Set())

  // Map each locked participant to the group they're currently pinned in, so a
  // regenerate keeps them in place while re-optimizing everyone else.
  const buildLockMap = useCallback(
    (currentGroups: Group[]) => {
      const map = new Map<number, number>()
      for (const g of currentGroups) {
        for (const m of g.members) {
          if (locked.has(m.id)) map.set(m.id, g.id)
        }
      }
      return map
    },
    [locked],
  )

  const toggleLock = useCallback((participantId: number) => {
    setLocked((prev) => {
      const next = new Set(prev)
      if (next.has(participantId)) next.delete(participantId)
      else next.add(participantId)
      return next
    })
  }, [])

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Seuls les fichiers .csv sont acceptés.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const parsed = await parseCsvFile(file)
      const count = Math.min(DEFAULT_GROUP_COUNT, parsed.length)
      const newSeed = Date.now()
      setParticipants(parsed)
      setGroupCount(count)
      setSeed(newSeed)
      setLocked(new Set())
      setGroups(createBalancedGroups(parsed, count, newSeed))
      setFileName(file.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la lecture du fichier.')
      setParticipants([])
      setGroups([])
      setFileName(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile],
  )

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
      e.target.value = ''
    },
    [processFile],
  )

  const regenerate = useCallback(() => {
    if (participants.length === 0) return
    const newSeed = Date.now()
    setSeed(newSeed)
    setGroups((prev) =>
      createBalancedGroups(participants, groupCount, newSeed, { locked: buildLockMap(prev) }),
    )
  }, [participants, groupCount, buildLockMap])

  const moveMember = useCallback((participantId: number, targetGroupId: number) => {
    setGroups((prev) => {
      const source = prev.find((g) => g.members.some((m) => m.id === participantId))
      if (!source || source.id === targetGroupId) return prev
      const moved = source.members.find((m) => m.id === participantId)
      if (!moved) return prev
      return prev.map((g) => {
        if (g.id === source.id) {
          return { ...g, members: g.members.filter((m) => m.id !== participantId) }
        }
        if (g.id === targetGroupId) {
          return { ...g, members: [...g.members, moved] }
        }
        return g
      })
    })
  }, [])

  const onGroupCountChange = useCallback(
    (count: number) => {
      const clamped = Math.max(2, Math.min(count, participants.length || 20))
      setGroupCount(clamped)
      if (participants.length > 0) {
        setGroups((prev) =>
          createBalancedGroups(participants, clamped, seed, { locked: buildLockMap(prev) }),
        )
      }
    },
    [participants, seed, buildLockMap],
  )

  const totalParticipants = participants.length

  const balanceSummary = useMemo(() => {
    if (groups.length === 0) return null
    const sizes = groups.map((g) => g.members.length)
    const totals = groups.map((g) => g.members.reduce((s, p) => s + p.totalScore, 0))
    return {
      minSize: Math.min(...sizes),
      maxSize: Math.max(...sizes),
      minTotal: Math.min(...totals).toFixed(1),
      maxTotal: Math.max(...totals).toFixed(1),
    }
  }, [groups])

  // Candidates whose declared level sits well above the measured one — to
  // double-check in person. Sorted worst-first, tagged with their group.
  const flagged = useMemo(() => {
    const out: { p: Participant; groupId: number }[] = []
    for (const g of groups) {
      for (const m of g.members) {
        if ((m.overclaim ?? 0) >= FLAG_THRESHOLD) out.push({ p: m, groupId: g.id })
      }
    }
    return out.sort((a, b) => (b.p.overclaim ?? 0) - (a.p.overclaim ?? 0))
  }, [groups])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-10 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <LogoMark size={56} />
            <div className="text-left leading-tight">
              <p className="text-2xl font-bold tracking-widest text-white">ANRI</p>
              <p className="text-xs uppercase tracking-widest text-blue-400">group mixer</p>
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Mélangeur de groupes
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            Importez le CSV exporté depuis Google Forms et téléchargez un PDF avec des groupes
            équilibrés et mixtes.
          </p>
        </header>

        <section
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`relative rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
            dragOver
              ? 'border-blue-400 bg-blue-500/10'
              : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
          }`}
        >
          <input
            type="file"
            accept=".csv"
            onChange={onFileInput}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Importer un fichier CSV"
          />
          <div className="pointer-events-none">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600/20 text-2xl">
              📄
            </div>
            <p className="text-lg font-medium text-white">
              Glissez votre fichier CSV ici
            </p>
            <p className="mt-1 text-sm text-slate-400">ou cliquez pour parcourir</p>
            {fileName && (
              <p className="mt-4 inline-block rounded-full bg-slate-700 px-4 py-1 text-sm text-blue-300">
                {fileName}
              </p>
            )}
          </div>
        </section>

        {loading && (
          <p className="mt-4 text-center text-blue-300">Analyse du fichier…</p>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-center text-red-300">
            {error}
          </div>
        )}

        {totalParticipants > 0 && (
          <>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-800/60 p-5">
              <div>
                <p className="text-sm text-slate-400">Participants détectés</p>
                <p className="text-2xl font-bold text-white">{totalParticipants}</p>
              </div>

              <div className="flex flex-wrap items-end gap-4">
                <label className="block">
                  <span className="mb-1 block text-sm text-slate-400">Nombre de groupes</span>
                  <input
                    type="number"
                    min={2}
                    max={totalParticipants}
                    value={groupCount}
                    onChange={(e) => onGroupCountChange(parseInt(e.target.value, 10) || 2)}
                    className="w-24 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white"
                  />
                </label>

                <button
                  type="button"
                  onClick={regenerate}
                  className="rounded-lg border border-slate-500 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
                >
                  🔀 Remélanger
                </button>

                <button
                  type="button"
                  onClick={() => downloadGroupsPdf(groups, { includeScores: false })}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:bg-blue-500"
                >
                  ⬇ Télécharger le PDF
                </button>

                <button
                  type="button"
                  onClick={() => downloadGroupsPdf(groups, { includeScores: true, filename: 'groupes-entretien-detaille.pdf' })}
                  className="rounded-lg border border-slate-500 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700"
                  title="Inclut les scores Élec., Prog., 3D, IA"
                >
                  PDF détaillé
                </button>
              </div>
            </div>

            {balanceSummary && (
              <p className="mt-3 text-center text-xs text-slate-500">
                Groupes de {balanceSummary.minSize}–{balanceSummary.maxSize} personnes · scores totaux{' '}
                {balanceSummary.minTotal}–{balanceSummary.maxTotal} (équilibrés)
              </p>
            )}

            <p className="mt-6 text-center text-xs text-slate-500">
              💡 Glissez-déposez un participant d'un groupe à l'autre pour ajuster. Verrouillez (🔒)
              ceux à garder en place avant de remélanger. Les puces de couleur indiquent la couverture
              des compétences (Élec., Prog., 3D, IA) — une puce rouge signale un domaine sans profil confirmé.
            </p>

            {flagged.length > 0 && (
              <section className="mt-6 rounded-xl border border-orange-500/40 bg-orange-500/5 p-5">
                <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-orange-300">
                  ⚠ À vérifier en entretien
                  <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs">{flagged.length}</span>
                </h2>
                <p className="mb-3 text-xs text-slate-400">
                  Niveau déclaré nettement au-dessus du niveau mesuré par les questions. À creuser en personne.
                </p>
                <ul className="space-y-2">
                  {flagged.map(({ p, groupId }) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900/50 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-white">
                        {p.name}
                        <span className="ml-2 text-xs text-slate-500">Groupe {groupId} · {p.maison}</span>
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {DOMAIN_LABELS.map(({ key, label }) => {
                          const gap = p.overclaimByDomain?.[key] ?? 0
                          if (gap < FLAG_THRESHOLD) return null
                          return (
                            <span
                              key={key}
                              title={`${label} : écart déclaré − mesuré de ${gap.toFixed(0)}/10`}
                              className="rounded bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-200"
                            >
                              {label} écart {gap.toFixed(0)}
                            </span>
                          )
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              {groups.map((group) => {
                const total = group.members.reduce((s, p) => s + p.totalScore, 0)
                return (
                  <article
                    key={group.id}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (dragOverGroup !== group.id) setDragOverGroup(group.id)
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDragOverGroup((g) => (g === group.id ? null : g))
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (draggingId !== null) moveMember(draggingId, group.id)
                      setDraggingId(null)
                      setDragOverGroup(null)
                    }}
                    className={`rounded-xl border bg-slate-800/40 p-5 transition-colors ${
                      dragOverGroup === group.id
                        ? 'border-blue-400 bg-blue-500/10'
                        : 'border-slate-700'
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-blue-300">Groupe {group.id}</h2>
                      <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                        {group.members.length} · score {total.toFixed(1)}
                      </span>
                    </div>

                    {(() => {
                      const cov = domainCoverage(group)
                      return (
                        <div className="mb-3 flex flex-wrap gap-1.5">
                          {DOMAIN_LABELS.map(({ key, label }) => {
                            const n = cov[key]
                            const missing = n === 0
                            return (
                              <span
                                key={key}
                                title={
                                  missing
                                    ? `Aucun profil confirmé en ${label}`
                                    : `${n} profil(s) confirmé(s) en ${label}`
                                }
                                className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                                  missing
                                    ? 'bg-red-500/15 text-red-300 ring-1 ring-red-500/40'
                                    : 'bg-emerald-500/10 text-emerald-300'
                                }`}
                              >
                                {missing ? '⚠ ' : ''}
                                {label} {n}
                              </span>
                            )
                          })}
                        </div>
                      )
                    })()}

                    <ul className="space-y-2">
                      {group.members.map((p) => {
                        const isLocked = locked.has(p.id)
                        return (
                          <li
                            key={p.id}
                            draggable={!isLocked}
                            onDragStart={(e) => {
                              if (isLocked) {
                                e.preventDefault()
                                return
                              }
                              setDraggingId(p.id)
                              e.dataTransfer.effectAllowed = 'move'
                            }}
                            onDragEnd={() => {
                              setDraggingId(null)
                              setDragOverGroup(null)
                            }}
                            className={`flex items-center justify-between rounded-lg bg-slate-900/60 px-3 py-2 text-sm ${
                              isLocked ? 'ring-1 ring-amber-500/40' : 'cursor-grab active:cursor-grabbing'
                            } ${draggingId === p.id ? 'opacity-40' : ''}`}
                          >
                            <span className="flex items-center gap-2 font-medium text-white">
                              <span className="text-slate-500">⠿</span>
                              {p.name}
                            </span>
                            <span className="flex items-center gap-2 text-xs text-slate-400">
                              {p.overclaim !== undefined && p.overclaim >= 3 && (
                                <span
                                  title={`Niveau déclaré nettement au-dessus du niveau mesuré (écart ${p.overclaim.toFixed(0)}/10). À vérifier en entretien.`}
                                  className="rounded bg-orange-500/20 px-1.5 py-0.5 font-medium text-orange-300"
                                >
                                  ⚠ à vérifier
                                </span>
                              )}
                              {p.age} ans · {p.totalScore.toFixed(1)} pts
                              <button
                                type="button"
                                onClick={() => toggleLock(p.id)}
                                title={isLocked ? 'Déverrouiller (peut être déplacé)' : 'Verrouiller dans ce groupe'}
                                aria-label={isLocked ? 'Déverrouiller' : 'Verrouiller'}
                                className={`rounded px-1 py-0.5 transition ${
                                  isLocked ? 'text-amber-400' : 'text-slate-600 hover:text-slate-300'
                                }`}
                              >
                                {isLocked ? '🔒' : '🔓'}
                              </button>
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </article>
                )
              })}
            </div>
          </>
        )}

        {totalParticipants === 0 && !loading && !error && (
          <div className="mt-10 rounded-xl bg-slate-800/40 p-6 text-left text-sm text-slate-400">
            <p className="mb-2 font-medium text-slate-300">Comment ça marche ?</p>
            <ol className="list-inside list-decimal space-y-1">
              <li>Dans Google Forms → Réponses → ⋮ → Télécharger les réponses (.csv)</li>
              <li>Glissez le fichier ici</li>
              <li>Ajustez le nombre de groupes si besoin</li>
              <li>Téléchargez le PDF à distribuer aux jurys</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
