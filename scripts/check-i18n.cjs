// Script to check translation key parity between ar.json and en.json
const fs = require('fs');
const path = require('path');

const ar = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'locales', 'ar.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'locales', 'en.json'), 'utf8'));

const arKeys = new Set();
const enKeys = new Set();

function getKeys(obj, prefix, set) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      getKeys(v, key, set);
    } else {
      set.add(key);
    }
  }
}

getKeys(ar, '', arKeys);
getKeys(en, '', enKeys);

const missingInEn = [];
const missingInAr = [];

for (const k of arKeys) {
  if (!enKeys.has(k)) missingInEn.push(k);
}
for (const k of enKeys) {
  if (!arKeys.has(k)) missingInAr.push(k);
}

console.log(`\n=== i18n Key Parity Check ===`);
console.log(`AR keys: ${arKeys.size} | EN keys: ${enKeys.size}`);
console.log(`Missing in EN: ${missingInEn.length} | Missing in AR: ${missingInAr.length}`);

if (missingInEn.length > 0) {
  console.log(`\n❌ Keys in AR but missing in EN:`);
  missingInEn.forEach(k => console.log(`  - ${k}`));
}

if (missingInAr.length > 0) {
  console.log(`\n❌ Keys in EN but missing in AR:`);
  missingInAr.forEach(k => console.log(`  - ${k}`));
}

if (missingInEn.length === 0 && missingInAr.length === 0) {
  console.log(`\n✅ All keys are synchronized between AR and EN!`);
}

process.exit(missingInEn.length + missingInAr.length > 0 ? 1 : 0);
