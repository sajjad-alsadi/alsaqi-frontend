import { readFileSync } from 'fs';

const en = JSON.parse(readFileSync('./src/locales/en.json', 'utf-8'));
const ar = JSON.parse(readFileSync('./src/locales/ar.json', 'utf-8'));

const enKeys = Object.keys(en);
const arKeys = Object.keys(ar);

const missingInEn = arKeys.filter(k => !en.hasOwnProperty(k));
const missingInAr = enKeys.filter(k => !ar.hasOwnProperty(k));

console.log('EN top-level keys:', enKeys.length);
console.log('AR top-level keys:', arKeys.length);
console.log('Missing in EN:', missingInEn.length);
if (missingInEn.length > 0) console.log('  ', missingInEn.join(', '));
console.log('Missing in AR:', missingInAr.length);
if (missingInAr.length > 0) console.log('  ', missingInAr.join(', '));

// Check for duplicate permission keys pattern
if (en.permissions) {
  const permKeys = Object.keys(en.permissions);
  const dupes = permKeys.filter(k => permKeys.includes(k.charAt(0).toUpperCase() + k.slice(1)) && k[0] === k[0].toLowerCase());
  if (dupes.length > 0) console.log('\nDuplicate permission keys (lowercase/Uppercase):', dupes);
}
