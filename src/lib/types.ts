export interface Participant {
  id: number
  name: string
  age: number
  maison: string
  scores: {
    electronics: number
    programming: number
    cad3d: number
    ai: number
  }
  totalScore: number
  /** Largest positive gap (0..10) between a self-rated level and the measured
   *  level across domains. High => the candidate likely over-claimed their
   *  skill. Undefined/0 when no self-ratings were collected. */
  overclaim?: number
  /** Per-domain positive gap (declared − measured), for the interviewer view. */
  overclaimByDomain?: {
    electronics: number
    programming: number
    cad3d: number
    ai: number
  }
}

export interface Group {
  id: number
  members: Participant[]
}
