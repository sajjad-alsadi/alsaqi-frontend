const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (!filePath.includes('node_modules') && !filePath.includes('.git')) {
        results = results.concat(walk(filePath));
      }
    } else if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      results.push(filePath);
    }
  });
  return results;
}

const files = walk('src');
let totalReplacements = 0;
let filesChanged = 0;

// Replacements for bg-white and text-slate-* patterns
// Only replace in className contexts (not in actual color values or comments)
const replacements = [
  // Background colors
  ['bg-white', 'bg-[var(--color-card)]'],
  ['bg-slate-50/50', 'bg-[var(--color-bg-soft)]/50'],
  ['bg-slate-50', 'bg-[var(--color-bg-soft)]'],
  ['bg-slate-100', 'bg-[var(--color-bg-main)]'],
  
  // Text colors
  ['text-slate-900', 'text-[var(--color-text-main)]'],
  ['text-slate-800', 'text-[var(--color-text-main)]'],
  ['text-slate-700', 'text-[var(--color-text-main)]'],
  ['text-slate-600', 'text-[var(--color-text-muted)]'],
  ['text-slate-500', 'text-[var(--color-text-muted)]'],
  ['text-slate-400', 'text-[var(--color-text-muted)]'],
  ['text-slate-300', 'text-[var(--color-border-strong)]'],
  
  // Border colors
  ['border-slate-200', 'border-[var(--color-border-soft)]'],
  ['border-slate-100', 'border-[var(--color-border-soft)]'],
  ['border-slate-300', 'border-[var(--color-border-strong)]'],
  
  // Hover backgrounds
  ['hover:bg-slate-100', 'hover:bg-[var(--color-bg-soft)]'],
  ['hover:bg-slate-200', 'hover:bg-[var(--color-bg-main)]'],
  ['hover:bg-slate-50', 'hover:bg-[var(--color-bg-soft)]'],
  
  // Hover text
  ['hover:text-slate-800', 'hover:text-[var(--color-text-main)]'],
  ['hover:text-slate-600', 'hover:text-[var(--color-text-muted)]'],
  
  // Focus ring
  ['focus:ring-primary', 'focus:ring-[var(--color-primary)]'],
  ['focus:border-primary', 'focus:border-[var(--color-primary)]'],
  
  // Divide
  ['divide-slate-100', 'divide-[var(--color-border-soft)]'],
  ['divide-slate-50', 'divide-[var(--color-border-soft)]/50'],
  
  // Shadow
  ['shadow-slate-200', 'shadow-[var(--color-border-soft)]'],
  ['hover:shadow-slate-200/50', 'hover:shadow-[var(--color-border-soft)]/50'],
];

// Files to skip (already properly themed or server-side)
const skipPatterns = [
  'src/server/',
  'src/assets/',
  'node_modules',
  'tahoma-base64',
];

files.forEach(f => {
  // Skip server files and assets
  if (skipPatterns.some(p => f.includes(p))) return;
  
  let content = fs.readFileSync(f, 'utf8');
  let fileReplacements = 0;
  
  replacements.forEach(([from, to]) => {
    // Count occurrences
    const regex = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = content.match(regex);
    if (matches) {
      content = content.replace(regex, to);
      fileReplacements += matches.length;
    }
  });
  
  if (fileReplacements > 0) {
    fs.writeFileSync(f, content, 'utf8');
    totalReplacements += fileReplacements;
    filesChanged++;
    console.log(`Fixed ${fileReplacements} in: ${f}`);
  }
});

console.log(`\n--- Summary ---`);
console.log(`Files changed: ${filesChanged}`);
console.log(`Total replacements: ${totalReplacements}`);
