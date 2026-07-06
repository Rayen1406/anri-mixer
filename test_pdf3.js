import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ArabicReshaper from 'arabic-reshaper';
import bidiFactory from 'bidi-js';
import fs from 'fs';

const amiriRegular = fs.readFileSync('Amiri-Regular.ttf').toString('base64');
const doc = new jsPDF();
doc.addFileToVFS('Amiri-Regular.ttf', amiriRegular);
doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');

const bidi = bidiFactory();

const text = 'محفوظ بن سليمان';
const reshaped = ArabicReshaper.convertArabic(text);

const reordered = bidi.getReorderedString(reshaped, bidi.getEmbeddingLevels(reshaped));
const reversed = reshaped.split('').reverse().join('');

autoTable(doc, {
  head: [['Original', 'Reshaped Only', 'Bidi Reordered', 'Just Reversed']],
  body: [
    [text, reshaped, reordered, reversed]
  ],
  styles: { font: 'Amiri' }
});

doc.save('test3.pdf');
