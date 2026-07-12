import Papa from 'papaparse'
import type { Participant } from './types'

/**
 * Column detection for a Google Forms CSV export.
 * Headers are the full (bilingual) question text, so we match on the most
 * distinctive Latin fragment of each question. Order matters: the more
 * specific needles are tried first to avoid a shorter needle (e.g. "logiciels")
 * grabbing the wrong question.
 */
function findColumn(headers: string[], ...needles: string[]): string | undefined {
  const lower = headers.map((h) => h.toLowerCase())
  for (const needle of needles) {
    const n = needle.toLowerCase()
    const idx = lower.findIndex((h) => h.includes(n))
    if (idx >= 0) return headers[idx]
  }
  return undefined
}

/**
 * Count how many *distinct known options* are present in a multi-select cell.
 *
 * Google Forms joins selected checkboxes with ", ", but several option labels
 * contain their own commas — e.g. "Arduino (Uno, Nano, Mega...)". Splitting on
 * "," therefore massively over-counts. Instead we look for a distinctive
 * fragment of each option and count how many are present. "None / never"
 * answers simply match nothing and score 0.
 *
 * `options` is a list of options; each option is a list of aliases (any alias
 * matching counts that option once).
 */
export function countOptions(value: string | undefined, options: string[][]): number {
  if (!value) return 0
  const v = value.toLowerCase()
  let count = 0
  for (const aliases of options) {
    if (aliases.some((a) => v.includes(a))) count++
  }
  return count
}

/** Weighted variant: each present option contributes its own weight. */
function scoreOptions(value: string | undefined, options: { aliases: string[]; weight: number }[]): number {
  if (!value) return 0
  const v = value.toLowerCase()
  let total = 0
  for (const { aliases, weight } of options) {
    if (aliases.some((a) => v.includes(a))) total += weight
  }
  return total
}

// ---- Option dictionaries (from the ANRI interview form) --------------------

const DEV_BOARDS: string[][] = [
  ['arduino'],
  ['esp32', 'esp8266', 'esp'],
  ['raspberry'],
  ['stm32'],
]

const SENSORS: string[][] = [
  ['ultrason', 'hc-sr04'],
  ['infrarouge', 'tcrt5000', 'suiveur de ligne', 'capteur de ligne'],
  ['dht11', 'dht22', "température et d'humidité"],
  ['ldr', 'photorésistance', 'capteur de lumière'],
  ['pir', 'capteur de mouvement'],
  ['mpu6050', 'gyroscope', 'accéléromètre'],
  ['empreinte', 'rfid'],
  ['soil', 'humidité du sol', 'capteur de pluie'],
  ['dc motor', 'courant continu'],
  ['servomoteur', 'sg90', 'mg996'],
  ['pas-à-pas', 'stepper', 'nema'],
  ['l298n', 'l293d', 'driver de moteur'],
  ['relais', 'relay'],
  ['lcd', 'oled'],
  ['buzzer', 'led rgb'],
]

const ELEC_SOFTWARE: string[][] = [
  ['arduino ide'],
  ['platformio', 'vs code'],
  ['proteus', 'isis'],
  ['tinkercad'],
]

const CAD_SOFTWARE: string[][] = [
  ['solidworks'],
  ['fusion 360', 'fusion360', 'fusion'],
  ['catia'],
  ['blender'],
]

// Programming languages are weighted: general-purpose languages count for more
// than block-based/other.
const LANGUAGES: { aliases: string[]; weight: number }[] = [
  { aliases: ['c / c++', 'c/c++', 'c++', 'c ++'], weight: 4 },
  { aliases: ['python'], weight: 4 },
  { aliases: ['scratch', 'par blocs'], weight: 1.5 },
  { aliases: ['autre'], weight: 1.5 },
]

/**
 * Map a single-choice experience answer to a 0..3 level.
 * 3 = strong/hands-on, 1 = basic/observer, 0 = none.
 */
function experienceLevel(value: string | undefined): number {
  if (!value) return 0
  const v = value.toLowerCase()
  if (v.includes('régulièrement') || v.includes('codé des modèles') || v.includes("j'ai préparé")) return 3
  if (
    v.includes('juste') ||
    v.includes('de loin') ||
    v.includes('connais le principe') ||
    v.includes('chatgpt') ||
    v.includes('midjourney') ||
    v.includes('bases')
  ) {
    return 1
  }
  if (v.includes('aucun') || v.includes('jamais') || v.trim() === 'non' || v.includes('aucune expérience')) return 0
  if (v.includes('oui')) return 2
  return 0
}

const clamp10 = (n: number) => Math.max(0, Math.min(10, n))

// ---- Per-domain scores, each normalized to a 0..10 scale -------------------

export function electronicsScore(devBoards?: string, sensors?: string, software?: string): number {
  const boards = countOptions(devBoards, DEV_BOARDS) // 0..4
  const sensorCount = countOptions(sensors, SENSORS) // 0..15
  const sw = countOptions(software, ELEC_SOFTWARE) // 0..4
  // Weighted so a realistic "strong" candidate lands near 10.
  return clamp10(boards * 1.6 + sensorCount * 0.45 + sw * 0.7)
}

export function programmingScore(languages?: string): number {
  return clamp10(scoreOptions(languages, LANGUAGES)) // max 11 -> capped at 10
}

export function cad3dScore(cadExp?: string, cadSoftware?: string, printExp?: string): number {
  const exp = experienceLevel(cadExp) // 0..3
  const sw = countOptions(cadSoftware, CAD_SOFTWARE) // 0..4
  const print = experienceLevel(printExp) // 0..3
  return clamp10(exp * 2 + sw * 1.2 + print * 1.5)
}

export function aiScore(aiExp?: string): number {
  // 0 -> 0, basic tools -> ~3.3, built models/API -> 10
  return clamp10((experienceLevel(aiExp) / 3) * 10)
}

// ---- Age ------------------------------------------------------------------

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

const ENGLISH_MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
}

/**
 * The form asks the birth date via a date picker, so the CSV usually holds a
 * date, not a number. Google Forms exports dates in the form owner's locale,
 * so we accept several layouts. For ambiguous D/M vs M/D we disambiguate by
 * range when possible, otherwise assume the form's own example ("January 7,
 * 2019" -> month first).
 */
export function parseAge(raw: string | undefined): number {
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

  // ISO: YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    return computeAge(new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)))
  }

  // Two numbers then a 4-digit year: A/B/YYYY (A and B are day & month in some order)
  const dmy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (dmy) {
    let a = parseInt(dmy[1], 10)
    let b = parseInt(dmy[2], 10)
    const y = parseInt(dmy[3], 10)
    // Disambiguate by range; default to month-first (matches the form example).
    let month: number
    let day: number
    if (a > 12 && b <= 12) {
      day = a
      month = b
    } else if (b > 12 && a <= 12) {
      month = a
      day = b
    } else {
      month = a // both <=12 -> assume M/D/YYYY per form example
      day = b
    }
    return computeAge(new Date(y, month - 1, day))
  }

  // Text date: "7 janvier 2019" (FR) or "January 7, 2019" (EN)
  const lower = trimmed.toLowerCase()
  const frMatch = lower.match(/^(\d{1,2})\s+([a-zéûî]+)\s+(\d{4})$/)
  if (frMatch) {
    const month = FRENCH_MONTHS[frMatch[2]]
    if (month !== undefined) return computeAge(new Date(parseInt(frMatch[3], 10), month, parseInt(frMatch[1], 10)))
  }
  const enMatch = lower.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/)
  if (enMatch) {
    const month = ENGLISH_MONTHS[enMatch[1]]
    if (month !== undefined) return computeAge(new Date(parseInt(enMatch[3], 10), month, parseInt(enMatch[2], 10)))
  }

  // Plain age number (1-2 digits)
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

// ---- Stealth assessment: self-ratings + hidden-key probes ------------------

/** Parse a 1..5 linear-scale answer into a 0..10 level, or undefined if blank. */
function parseSelfRating(value: string | undefined): number | undefined {
  if (!value) return undefined
  const m = value.trim().match(/[1-5]/)
  if (!m) return undefined
  const n = parseInt(m[0], 10)
  return ((n - 1) / 4) * 10 // 1 -> 0, 5 -> 10
}

interface ProbeOption {
  match: string[]
  pts: number
}

/** Score one single-choice probe answer (0/1/2), or undefined if unanswered.
 *  Options are tried in order, so higher-point matches must come first. */
function scoreProbe(value: string | undefined, options: ProbeOption[]): number | undefined {
  if (!value || !value.trim()) return undefined
  const v = value.toLowerCase()
  for (const o of options) {
    if (o.match.some((frag) => v.includes(frag))) return o.pts
  }
  return 0 // answered, but not a scoring option
}

// Hidden answer keys (see ASSESSMENT_QUESTIONS.md / FORMULAIRE_COMPLET.md).
const PROBE_KEYS: Record<string, ProbeOption[]> = {
  e1: [
    { match: ['pwm', 'analogwrite'], pts: 2 },
    { match: ['delay'], pts: 1 },
  ],
  e2: [
    { match: ['alimentation', 'courant', 'condensateur'], pts: 2 },
    { match: ['bug', 'code'], pts: 1 },
  ],
  p1: [{ match: ['= 10', 'x = 10', 'x=10'], pts: 2 }],
  p2: [
    { match: ['for (', 'for(', 'i < 10', 'i<10', 'i++'], pts: 2 },
    { match: ['répéter', 'repeter', 'bloc', 'scratch', 'أعد'], pts: 1 },
  ],
  d1: [
    { match: ['0,1', '0.1', '0,3', '0.3'], pts: 2 },
    { match: ['hasard', 'défaut', 'defaut', 'فازة'], pts: 1 },
  ],
  d2: [{ match: ['remplissage', 'infill'], pts: 2 }],
  a1: [
    { match: ['vision', 'cnn', 'modèle', 'modele', 'مدرّب'], pts: 2 },
    { match: ['if/else', 'if / else', 'couleurs'], pts: 1 },
  ],
  a2: [{ match: ['ensemble de données', 'ensemble de donnees', 'entraîner', 'entrainer', 'données pour'], pts: 2 }],
}

const DOMAIN_ASSESS: Record<'electronics' | 'programming' | 'cad3d' | 'ai', { self: string; probes: string[] }> = {
  electronics: { self: 'selfElec', probes: ['e1', 'e2'] },
  programming: { self: 'selfProg', probes: ['p1', 'p2'] },
  cad3d: { self: 'self3d', probes: ['d1', 'd2'] },
  ai: { self: 'selfAi', probes: ['a1', 'a2'] },
}

interface DomainResult {
  measured: number
  overclaim: number
}

/**
 * Combine every available signal into a measured 0..10 level:
 * hidden-key probes (weight 0.60), self-rating (0.25) and the existing
 * checkbox evidence (0.15), renormalized over whatever is present. Falls back
 * to pure checkbox scoring for old CSVs with none of the new questions.
 * Overclaim = how far the self-rating sits *above* the probe evidence.
 */
function computeDomain(
  row: Record<string, string>,
  columns: Record<string, string | undefined>,
  domain: keyof typeof DOMAIN_ASSESS,
  checklistScore: number,
): DomainResult {
  const cfg = DOMAIN_ASSESS[domain]

  let probePts = 0
  let probeMax = 0
  for (const key of cfg.probes) {
    const pts = scoreProbe(row[columns[key] ?? ''], PROBE_KEYS[key])
    if (pts !== undefined) {
      probePts += pts
      probeMax += 2
    }
  }
  const probes10 = probeMax > 0 ? (probePts / probeMax) * 10 : undefined
  const self10 = parseSelfRating(row[columns[cfg.self] ?? ''])

  const signals: { v: number; w: number }[] = []
  if (probes10 !== undefined) signals.push({ v: probes10, w: 0.6 })
  if (self10 !== undefined) signals.push({ v: self10, w: 0.25 })
  signals.push({ v: checklistScore, w: 0.15 })

  const wsum = signals.reduce((a, s) => a + s.w, 0)
  const measured = signals.reduce((a, s) => a + s.w * s.v, 0) / wsum

  const overclaim =
    self10 !== undefined && probes10 !== undefined ? Math.max(0, self10 - probes10) : 0

  return { measured, overclaim }
}

// ---- Row -> Participant ----------------------------------------------------

function rowToParticipant(
  row: Record<string, string>,
  id: number,
  columns: Record<string, string | undefined>,
): Participant | null {
  const name = row[columns.name ?? '']?.trim()
  if (!name) return null

  // Existing checkbox evidence per domain (0..10).
  const checklist = {
    electronics: electronicsScore(row[columns.devBoards ?? ''], row[columns.sensors ?? ''], row[columns.software ?? '']),
    programming: programmingScore(row[columns.languages ?? '']),
    cad3d: cad3dScore(row[columns.cadExp ?? ''], row[columns.cadSoftware ?? ''], row[columns.printExp ?? '']),
    ai: aiScore(row[columns.ai ?? '']),
  }

  const e = computeDomain(row, columns, 'electronics', checklist.electronics)
  const p = computeDomain(row, columns, 'programming', checklist.programming)
  const c = computeDomain(row, columns, 'cad3d', checklist.cad3d)
  const a = computeDomain(row, columns, 'ai', checklist.ai)

  const scores = {
    electronics: e.measured,
    programming: p.measured,
    cad3d: c.measured,
    ai: a.measured,
  }

  return {
    id,
    name,
    age: parseAge(row[columns.age ?? '']),
    maison: row[columns.maison ?? '']?.trim() || '—',
    scores,
    totalScore: scores.electronics + scores.programming + scores.cad3d + scores.ai,
    overclaim: Math.max(e.overclaim, p.overclaim, c.overclaim, a.overclaim),
    overclaimByDomain: {
      electronics: e.overclaim,
      programming: p.overclaim,
      cad3d: c.overclaim,
      ai: a.overclaim,
    },
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
        // The name question is the first "nom"/"prénom" column that is NOT the
        // Google Forms timestamp/email column.
        const nameCol = headers.find((h) => {
          const l = h.toLowerCase()
          if (l.includes('horodat') || l.includes('timestamp') || l.includes('email') || l.includes('adresse e')) return false
          return l.includes('prénom') || l.includes('prenom') || (l.includes('nom') && !l.includes('nombre'))
        })

        const columns = {
          name: nameCol ?? findColumn(headers, 'nom et prénom', 'nom'),
          age: findColumn(headers, 'date de naissance', 'naissance', 'age', 'âge'),
          maison: findColumn(headers, 'maison', 'affiliée', 'dar', 'affilie'),
          devBoards: findColumn(headers, 'cartes de développement', 'développement', 'developpement'),
          sensors: findColumn(headers, 'capteurs', 'actionneurs'),
          // Q6 (programming/sim software) comes before Q8; match Q6 first, then
          // fall back to the generic "logiciels" (Q8 is matched separately below).
          software: findColumn(headers, 'simulation', 'environnements', 'programmation ou la'),
          cadExp: findColumn(headers, 'projets de conception 3d', 'conception 3d (cad)', 'conception 3d'),
          cadSoftware: findColumn(headers, 'logiciels de conception 3d', 'conception 3d maitrisez', 'maitrisez'),
          printExp: findColumn(headers, 'imprimante 3d', 'imprimé une pièce'),
          languages: findColumn(headers, 'langages de programmation', 'langages'),
          ai: findColumn(headers, "basés sur l'ai", 'basés sur l', 'outils basés', 'travaillé sur un projet ou utilisé'),

          // --- New stealth-assessment columns (optional; old CSVs lack them) ---
          selfElec: findColumn(headers, 'niveau en électronique', 'niveau en electronique'),
          selfProg: findColumn(headers, 'niveau en programmation'),
          self3d: findColumn(headers, 'niveau en 3d', 'niveau en 3 d'),
          selfAi: findColumn(headers, 'niveau en ia', 'niveau en intelligence'),
          e1: findColumn(headers, 'moteur dc', "vitesse d'un moteur"),
          e2: findColumn(headers, 'redémarre', 'redemarre', 'bugue'),
          p1: findColumn(headers, 'que vaut', 'vaut `x`', 'vaut x'),
          p2: findColumn(headers, 'répéter une action', 'repeter une action', '10 fois'),
          d1: findColumn(headers, 'hauteur de couche'),
          d2: findColumn(headers, 'plus solide'),
          a1: findColumn(headers, 'reconnaisse des chats', 'reconnaisse'),
          a2: findColumn(headers, '« dataset »', 'dataset'),
        }

        if (!columns.name) {
          reject(new Error('Colonne « Nom et Prénom » introuvable. Exportez bien le CSV depuis Google Forms (Réponses → ⋮ → Télécharger .csv).'))
          return
        }

        const participants = results.data
          .map((row, i) => rowToParticipant(row, i, columns))
          .filter((p): p is Participant => p !== null)

        if (participants.length === 0) {
          reject(new Error('Aucun participant trouvé dans le CSV (aucune ligne avec un nom).'))
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
