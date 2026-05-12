// Script to find translation keys used in code but missing from locale files
const fs = require('fs');
const path = require('path');

const ar = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'locales', 'ar.json'), 'utf8'));

// Flatten all keys from locale file
const allKeys = new Set();
function getKeys(obj, prefix) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      getKeys(v, key);
    } else {
      allKeys.add(key);
    }
  }
}
getKeys(ar, '');

// Scan source files for t('key') patterns
const srcDir = path.join(__dirname, '..', 'src');
const missingKeys = new Map(); // key -> [files]

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  // Match t('key') and t("key") patterns
  const regex = /t\(['"]([^'"]+)['"]\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const key = match[1];
    // Skip dynamic keys (containing variables like ${...} or template literals)
    if (key.includes('${') || key.includes('+')) continue;
    // Skip keys that are just interpolation patterns
    if (key.includes('{{')) continue;
    
    if (!allKeys.has(key)) {
      if (!missingKeys.has(key)) missingKeys.set(key, []);
      const relPath = path.relative(srcDir, filePath);
      if (!missingKeys.get(key).includes(relPath)) {
        missingKeys.get(key).push(relPath);
      }
    }
  }
}

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules', 'locales', 'assets'].includes(entry.name)) {
      walkDir(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) && !entry.name.endsWith('.d.ts')) {
      scanFile(fullPath);
    }
  }
}

walkDir(srcDir);

console.log(`\n=== Missing Translation Keys ===`);
console.log(`Keys in locale files: ${allKeys.size}`);
console.log(`Missing keys found: ${missingKeys.size}\n`);

if (missingKeys.size > 0) {
  // Sort by frequency
  const sorted = [...missingKeys.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [key, files] of sorted) {
    console.log(`❌ "${key}"`);
    console.log(`   Used in: ${files.join(', ')}`);
  }
} else {
  console.log('✅ All translation keys used in code exist in locale files!');
}
