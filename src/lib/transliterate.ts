// Arabic -> Latin (French-style) transliteration for names & venue labels.
// Used so the exported PDF contains only Latin text (jsPDF's built-in Arabic
// shaping is unreliable). Latin input is returned unchanged.

const ARABIC_RE = /[؀-ۿݐ-ݿ]/

// Common Tunisian first names / surnames / particles / place names ->
// conventional Latin spelling. Extend as needed.
const DICT: Record<string, string> = {
  // first names (male)
  'محمد': 'Mohamed', 'أحمد': 'Ahmed', 'احمد': 'Ahmed', 'علي': 'Ali', 'عزيز': 'Aziz', 'محفوظ': 'Mahfoudh',
  'سليمان': 'Slimane', 'مجاهد': 'Mojahed', 'أيوب': 'Ayoub', 'ايوب': 'Ayoub', 'ياسين': 'Yassine', 'أنيس': 'Anis', 'انيس': 'Anis',
  'إياد': 'Iyad', 'اياد': 'Iyad', 'منتصر': 'Montassar', 'يوسف': 'Youssef', 'خليل': 'Khalil', 'طه': 'Taha', 'حمزة': 'Hamza',
  'مهدي': 'Mehdi', 'بلال': 'Bilel', 'رامي': 'Rami', 'وسيم': 'Wassim', 'رايان': 'Rayen', 'ريان': 'Rayen', 'زياد': 'Ziad',
  'آدم': 'Adam', 'ادم': 'Adam', 'فراس': 'Firas', 'عمر': 'Omar', 'طارق': 'Tarek', 'كريم': 'Karim', 'نبيل': 'Nabil',
  // first names (female)
  'مهى': 'Maha', 'ياسمين': 'Yasmine', 'ياسمينة': 'Yasmine', 'فاطمة': 'Fatma', 'سارة': 'Sarra', 'مريم': 'Mariem',
  'نور': 'Nour', 'ملك': 'Malek', 'إيمان': 'Imen', 'ايمان': 'Imen', 'أميرة': 'Amira', 'اميرة': 'Amira', 'سلمى': 'Salma',
  'إيا': 'Eya', 'ايا': 'Eya', 'آية': 'Aya', 'اية': 'Aya', 'هبة': 'Hiba', 'أسماء': 'Asma', 'اسماء': 'Asma', 'رانية': 'Rania',
  // surnames
  'اليرماني': 'El Yermani', 'البجاوي': 'El Bejaoui', 'سعيداني': 'Saidani', 'الزوابي': 'Zouabi', 'زوابي': 'Zouabi',
  'بجاوي': 'Bejaoui', 'يرماني': 'Yermani', 'طرابلسي': 'Trabelsi', 'الطرابلسي': 'Trabelsi', 'حمامي': 'Hammami',
  // particles
  'بن': 'Ben', 'ابن': 'Ben', 'أبو': 'Abou', 'ابو': 'Abou', 'بنت': 'Bent',
  // venue words / place names
  'دار': 'Dar', 'الشباب': 'des Jeunes', 'شباب': 'Jeunes', 'منزل': 'Menzel', 'حي': 'Cité',
  'الكرم': 'Le Kram', 'منوبة': 'Manouba', 'تونس': 'Tunis', 'صفاقس': 'Sfax', 'سوسة': 'Sousse',
  'المنزه': 'El Menzah', 'التضامن': 'Ettadhamen', 'الرياضية': 'Sportif', 'العالية': 'El Alia', 'غزالة': 'Ghazela',
}

// Multi-word phrase replacements applied before tokenizing.
const PHRASES: Array<[RegExp, string]> = [
  [/دار\s+الشباب/g, 'Maison des Jeunes'],
]

// "عبد ال..." compounds written as a single token.
const ABD_COMPOUNDS: Record<string, string> = {
  'له': 'Abdallah', 'لله': 'Abdallah', 'رحمن': 'Abderrahmane', 'رحيم': 'Abderrahim',
  'عزيز': 'Abdelaziz', 'كريم': 'Abdelkarim', 'قادر': 'Abdelkader', 'مجيد': 'Abdelmajid', 'حميد': 'Abdelhamid',
}

// Character-level fallback (French phonetics). Short vowels are unwritten in
// Arabic, so this is approximate but readable.
const CHARMAP: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ٱ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'ch', 'ص': 's', 'ض': 'dh', 'ط': 't', 'ظ': 'dh',
  'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'ou', 'ي': 'i',
  'ى': 'a', 'ة': 'a', 'ء': '', 'ؤ': 'ou', 'ئ': 'i', 'پ': 'p', 'چ': 'tch', 'ڤ': 'v', 'گ': 'g',
}
const DIACRITICS = /[ً-ْٰـ]/g // tashkeel + tatweel

function titleCase(w: string): string {
  return w.replace(/\p{L}[\p{L}']*/gu, (m) => m.charAt(0).toUpperCase() + m.slice(1))
}

function fallback(tok: string): string {
  let out = ''
  for (const ch of tok.replace(DIACRITICS, '')) out += (ch in CHARMAP) ? CHARMAP[ch] : ch
  return titleCase(out)
}

function translitToken(tok: string): string {
  if (DICT[tok]) return DICT[tok]
  if (/^عبد/.test(tok)) {
    const rest = tok.slice(3).replace(/^ال/, '')
    if (ABD_COMPOUNDS[rest]) return ABD_COMPOUNDS[rest]
    return 'Abd' + fallback(tok.slice(3))
  }
  if (/^ال/.test(tok) && tok.length > 3) {
    const base = tok.slice(2)
    if (DICT[base]) return DICT[base]
    return 'El ' + fallback(base)
  }
  return fallback(tok)
}

/** Transliterate any Arabic in `text` to Latin. Latin text is returned as-is. */
export function transliterateArabic(text: string): string {
  const s = String(text ?? '')
  if (!ARABIC_RE.test(s)) return s
  let t = s
  for (const [re, rep] of PHRASES) t = t.replace(re, rep)
  const parts = t.split(/(\s+)/).map((part) => {
    if (/^\s+$/.test(part)) return part
    if (!ARABIC_RE.test(part)) return part
    return titleCase(translitToken(part))
  })
  return parts.join('').replace(/\s+/g, ' ').trim()
}
