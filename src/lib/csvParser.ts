import Papa from 'papaparse'
import type { Participant } from './types'

function findColumn(headers: string[], ...needles: string[]): string | undefined {
  const lower = headers.map((h) => h.toLowerCase())
  for (const needle of needles) {
    const n = needle.toLowerCase()
    const idx = lower.findIndex((h) => h.includes(n))
    if (idx >= 0) return headers[idx]
  }
  return undefined
}

function isEmpty(value: string | undefined): boolean {
  if (!value) return true
  const v = value.trim().toLowerCase()
  return v === '' || v.includes('jamais') || v === 'non' || v.includes('aucun')
}

function countSelections(value: string | undefined): number {
  if (isEmpty(value)) return 0
  return value!.split(',').filter((s) => s.trim() && !isEmpty(s.trim())).length
}

function experienceLevel(value: string | undefined): number {
  if (isEmpty(value)) return 0
  const v = value!.toLowerCase()
  if (v.includes('régulièrement') || v.includes('codé des modèles') || v.includes("j'ai préparé")) return 3
  if (v.includes('juste') || v.includes('de loin') || v.includes('connais le principe') || v.includes('chatgpt')) return 1
  if (v.includes('oui')) return 2
  return 0
}

function electronicsScore(devBoards: string | undefined, sensors: string | undefined, software: string | undefined): number {
  const boards = countSelections(devBoards)
  const sensorCount = countSelections(sensors)
  const sw = countSelections(software)
  return Math.min(10, boards * 1.5 + sensorCount * 0.5 + sw * 0.8)
}

function programmingScore(languages: string | undefined): number {
  return Math.min(6, countSelections(languages) * 2)
}

function cad3dScore(cadExp: string | undefined, cadSoftware: string | undefined, printExp: string | undefined): number {
  return Math.min(10, experienceLevel(cadExp) * 2 + countSelections(cadSoftware) * 1.2 + experienceLevel(printExp) * 2)
}

function aiScore(aiExp: string | undefined): number {
  return experienceLevel(aiExp) * 2
}

function computeAge(birthDate: Date): number {
  if (Number.isNaN(birthDate.getTime())) return 18
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return Math.max(1, Math.min(age, 120))
}

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11, decembre: 11,
}

function parseAge(raw: string | undefined): number {
  if (!raw) return 18
  const trimmed = raw.trim()
  const digits = trimmed.replace(/\D/g, '')

  // Birth date as YYYYMMDD (e.g. 20090222)
  if (digits.length === 8 && (digits.startsWith('19') || digits.startsWith('20'))) {
    const year = parseInt(digits.slice(0, 4), 10)
    const month = parseInt(digits.slice(4, 6), 10) - 1
    const day = parseInt(digits.slice(6, 8), 10)
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return computeAge(new Date(year, month, day))
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (slashMatch) {
    const [, d, m, y] = slashMatch
    return computeAge(new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)))
  }

  // YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    return computeAge(new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)))
  }

  // French text date: "7 janvier 2019"
  const frMatch = trimmed.toLowerCase().match(/^(\d{1,2})\s+([a-zéû]+)\s+(\d{4})$/)
  if (frMatch) {
    const [, d, monthName, y] = frMatch
    const month = FRENCH_MONTHS[monthName]
    if (month !== undefined) {
      return computeAge(new Date(parseInt(y, 10), month, parseInt(d, 10)))
    }
  }

  // Plain age number (1–2 digits)
  if (/^\d{1,2}$/.test(trimmed)) {
    const age = parseInt(trimmed, 10)
    if (age >= 1 && age <= 99) return age
  }

  // Birth year only (e.g. 2009)
  if (/^\d{4}$/.test(trimmed)) {
    const year = parseInt(trimmed, 10)
    if (year >= 1920 && year <= new Date().getFullYear()) {
      return new Date().getFullYear() - year
    }
  }

  return 18
}

function rowToParticipant(row: Record<string, string>, id: number, columns: Record<string, string | undefined>): Participant | null {
  const name = row[columns.name ?? '']?.trim()
  if (!name) return null

  const scores = {
    electronics: electronicsScore(row[columns.devBoards ?? ''], row[columns.sensors ?? ''], row[columns.software ?? '']),
    programming: programmingScore(row[columns.languages ?? '']),
    cad3d: cad3dScore(row[columns.cadExp ?? ''], row[columns.cadSoftware ?? ''], row[columns.printExp ?? '']),
    ai: aiScore(row[columns.ai ?? '']),
  }

  return {
    id,
    name,
    age: parseAge(row[columns.age ?? '']),
    maison: row[columns.maison ?? '']?.trim() || '—',
    scores,
    totalScore: scores.electronics + scores.programming + scores.cad3d + scores.ai,
  }
}

export function parseCsvFile(file: File): Promise<Participant[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        if (results.errors.length > 0 && results.data.length === 0) {
          reject(new Error('Impossible de lire le fichier CSV.'))
          return
        }

        const headers = results.meta.fields ?? Object.keys(results.data[0] ?? {})
        const columns = {
          name: findColumn(headers, 'nom et prénom', 'nom'),
          age: findColumn(headers, 'age', 'âge'),
          maison: findColumn(headers, 'maison', 'affiliée'),
          devBoards: findColumn(headers, 'cartes de développement', 'développement'),
          sensors: findColumn(headers, 'capteurs', 'actionneurs'),
          software: findColumn(headers, 'logiciels', 'environnements'),
          cadExp: findColumn(headers, 'projets de conception 3d', 'conception 3d (cad)'),
          cadSoftware: findColumn(headers, 'logiciels de conception 3d', 'conception 3d maitrisez'),
          printExp: findColumn(headers, 'imprimante 3d'),
          languages: findColumn(headers, 'langages de programmation', 'langages'),
          ai: findColumn(headers, "basés sur l'ai", 'intelligence artificielle'),
        }

        if (!columns.name) {
          reject(new Error('Colonne « Nom et Prénom » introuvable. Exportez bien depuis Google Forms.'))
          return
        }

        const participants = results.data
          .map((row, i) => rowToParticipant(row, i, columns))
          .filter((p): p is Participant => p !== null)

        if (participants.length === 0) {
          reject(new Error('Aucun participant trouvé dans le CSV.'))
          return
        }

        resolve(participants)
      },
      error(err) {
        reject(err)
      },
    })
  })
}
