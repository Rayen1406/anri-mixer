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
}

export interface Group {
  id: number
  members: Participant[]
}
