// Minimal type declarations for untyped Arabic text-shaping deps.
declare module 'arabic-reshaper' {
  const ArabicReshaper: {
    convertArabic(text: string): string
    convertArabicBack(text: string): string
  }
  export default ArabicReshaper
}

declare module 'bidi-js' {
  interface EmbeddingLevels {
    levels: Uint8Array
    paragraphs: Array<{ start: number; end: number; level: number }>
  }
  interface Bidi {
    getEmbeddingLevels(text: string, baseDirection?: 'ltr' | 'rtl' | 'auto'): EmbeddingLevels
    getReorderedString(text: string, embeddingLevels: EmbeddingLevels): string
    getReorderedIndices(text: string, embeddingLevels: EmbeddingLevels): number[]
  }
  export default function bidiFactory(): Bidi
}
