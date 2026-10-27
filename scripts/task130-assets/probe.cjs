/** Probe: which component bloats the PDF — font embedding or image? */
const { jsPDF } = require('/home/z/my-project/node_modules/jspdf');
const fs = require('fs');

const fontB64 = fs.readFileSync('/home/z/my-project/scripts/task130-assets/rupee-subset.ttf').toString('base64');
console.log('font b64 chars:', fontB64.length);

// 1. font only
let doc = new jsPDF({ unit: 'mm', format: 'a4' });
doc.addFileToVFS('RupeeSans.ttf', fontB64);
doc.addFont('RupeeSans.ttf', 'RupeeSans', 'normal');
doc.setFont('RupeeSans', 'normal');
doc.setFontSize(9);
doc.text('₹', 20, 20);
let out = Buffer.from(doc.output('arraybuffer'));
console.log('font-only pdf:', out.length);
for (const m of out.toString('latin1').matchAll(/\/Length1 (\d+)/g)) console.log('  Length1:', m[1]);

// 2. font + jpeg image
const jpegB64 = fs.readFileSync('/home/z/my-project/scripts/task130-assets/marq-ai-logo.jpg').toString('base64');
console.log('jpeg b64 chars:', jpegB64.length);
doc = new jsPDF({ unit: 'mm', format: 'a4' });
doc.addImage(jpegB64, 'JPEG', 10, 10, 30, 30);
out = Buffer.from(doc.output('arraybuffer'));
console.log('jpeg-only pdf:', out.length);
