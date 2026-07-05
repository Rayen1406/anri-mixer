import { useCallback, useMemo, useState } from 'react'
import { parseCsvFile } from './lib/csvParser'
import { createBalancedGroups } from './lib/grouping'
import { downloadGroupsPdf } from './lib/pdfExport'
import type { Group, Participant } from './lib/types'

const DEFAULT_GROUP_COUNT = 4

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
    setGroups(createBalancedGroups(participants, groupCount, newSeed))
  }, [participants, groupCount])

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
        setGroups(createBalancedGroups(participants, clamped, seed))
      }
    },
    [participants, seed],
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-10 text-center">
          <p className="mb-2 text-sm font-medium uppercase tracking-widest text-blue-400">ANRI</p>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Générateur de groupes
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
              💡 Glissez-déposez un participant d'un groupe à l'autre pour ajuster manuellement.
            </p>

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
                    <ul className="space-y-2">
                      {group.members.map((p) => (
                        <li
                          key={p.id}
                          draggable
                          onDragStart={(e) => {
                            setDraggingId(p.id)
                            e.dataTransfer.effectAllowed = 'move'
                          }}
                          onDragEnd={() => {
                            setDraggingId(null)
                            setDragOverGroup(null)
                          }}
                          className={`flex cursor-grab items-center justify-between rounded-lg bg-slate-900/60 px-3 py-2 text-sm active:cursor-grabbing ${
                            draggingId === p.id ? 'opacity-40' : ''
                          }`}
                        >
                          <span className="flex items-center gap-2 font-medium text-white">
                            <span className="text-slate-500">⠿</span>
                            {p.name}
                          </span>
                          <span className="text-xs text-slate-400">
                            {p.age} ans · {p.totalScore.toFixed(1)} pts
                          </span>
                        </li>
                      ))}
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
