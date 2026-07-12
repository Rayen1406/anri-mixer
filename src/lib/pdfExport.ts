import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Group } from './types'
import { domainCoverage } from './grouping'
import { transliterateArabic } from './transliterate'

export interface PdfOptions {
  includeScores?: boolean
  filename?: string
}

// jsPDF's built-in Arabic shaping is unreliable, so any Arabic in names or
// venue labels is transliterated to Latin before it reaches the PDF.
const tl = (v: string | number) => transliterateArabic(String(v ?? ''))

export function downloadGroupsPdf(groups: Group[], options: PdfOptions = {}) {
  const { includeScores = false, filename = 'groupes-entretien.pdf' } = options
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Groupes d\'entretien', pageWidth / 2, 20, { align: 'center' })

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Académie Nationale de Robotique et d\'Intelligence Artificielle', pageWidth / 2, 28, { align: 'center' })

  const date = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(date, pageWidth / 2, 35, { align: 'center' })
  doc.setTextColor(0)

  let y = 42

  for (const group of groups) {
    if (y > 250) {
      doc.addPage()
      y = 20
    }

    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text(`Groupe ${group.id}  (${group.members.length} candidats)`, 14, y)
    y += 5

    // Skill coverage line: how many capable profiles per domain (⚠ if none).
    const cov = domainCoverage(group)
    const covParts = [
      `Élec. ${cov.electronics}`,
      `Prog. ${cov.programming}`,
      `3D ${cov.cad3d}`,
      `IA ${cov.ai}`,
    ]
    const gaps = Object.values(cov).filter((n) => n === 0).length
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    if (gaps > 0) doc.setTextColor(190, 60, 60)
    else doc.setTextColor(110, 110, 110)
    doc.text(
      `Couverture: ${covParts.join('  ·  ')}${gaps > 0 ? '   ⚠ domaine(s) non couvert(s)' : ''}`,
      14,
      y,
    )
    doc.setTextColor(0)
    y -= 3

    if (includeScores) {
      const stats = group.members.reduce(
        (acc, p) => ({
          electronics: acc.electronics + p.scores.electronics,
          programming: acc.programming + p.scores.programming,
          cad3d: acc.cad3d + p.scores.cad3d,
          ai: acc.ai + p.scores.ai,
        }),
        { electronics: 0, programming: 0, cad3d: 0, ai: 0 },
      )

      autoTable(doc, {
        startY: y + 4,
        head: [['Nom', 'Âge', 'Maison', 'Élec.', 'Prog.', '3D', 'IA']],
        body: group.members.map((p) => {
          const maison = tl(p.maison)
          const flag = p.overclaim !== undefined && p.overclaim >= 3 ? '  ⚠' : ''
          return [
            tl(p.name) + flag,
            String(p.age),
            maison.length > 22 ? maison.slice(0, 20) + '…' : maison,
            p.scores.electronics.toFixed(1),
            p.scores.programming.toFixed(1),
            p.scores.cad3d.toFixed(1),
            p.scores.ai.toFixed(1),
          ]
        }),
        foot: [[
          'Totaux',
          '',
          '',
          stats.electronics.toFixed(1),
          stats.programming.toFixed(1),
          stats.cad3d.toFixed(1),
          stats.ai.toFixed(1),
        ]],
        theme: 'grid',
        headStyles: { fillColor: [30, 64, 120], fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        footStyles: { fillColor: [240, 240, 245], textColor: [40, 40, 40], fontStyle: 'bold', fontSize: 9 },
        margin: { left: 14, right: 14 },
      })
    } else {
      autoTable(doc, {
        startY: y + 4,
        head: [['Nom', 'Âge', 'Maison']],
        body: group.members.map((p) => {
          const maison = tl(p.maison)
          return [
            tl(p.name),
            String(p.age),
            maison.length > 40 ? maison.slice(0, 38) + '…' : maison,
          ]
        }),
        theme: 'grid',
        headStyles: { fillColor: [30, 64, 120], fontSize: 10 },
        bodyStyles: { fontSize: 10 },
        margin: { left: 14, right: 14 },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { cellWidth: 20, halign: 'center' },
          2: { cellWidth: 'auto' },
        },
      })
    }

    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12
  }

  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text(
    includeScores
      ? '⚠ = niveau déclaré nettement au-dessus du niveau mesuré (à vérifier en entretien). Groupes équilibrés automatiquement.'
      : 'Groupes équilibrés automatiquement (compétences, âge et profils mixtes).',
    pageWidth / 2,
    doc.internal.pageSize.getHeight() - 10,
    { align: 'center' },
  )

  doc.save(filename)
}
