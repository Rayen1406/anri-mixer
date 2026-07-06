import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';

const doc = new jsPDF();
const fontBase64 = fs.readFileSync('./src/lib/fonts/amiri.ts', 'utf8').match(/export const amiriRegular = '([^']+)'/)[1];
doc.addFileToVFS('Amiri-Regular.ttf', fontBase64);
doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');

const text = "محفوظ بن سليمان";

autoTable(doc, {
  head: [['Name']],
  body: [[text]],
  styles: { font: 'Amiri' }
});

doc.save('test_auto.pdf');
