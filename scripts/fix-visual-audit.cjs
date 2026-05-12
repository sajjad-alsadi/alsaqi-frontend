const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (!filePath.includes('node_modules') && !filePath.includes('.git') && !filePath.includes('server')) {
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

// Replacements - order matters (longer patterns first to avoid partial matches)
const replacements = [
  // Bare primary patterns (not already wrapped in var())
  // Be careful not to replace things already in var() context
  ['hover:bg-primary/5', 'hover:bg-[var(--color-primary)]/5'],
  ['hover:bg-primary/10', 'hover:bg-[var(--color-primary)]/10'],
  ['hover:bg-primary/20', 'hover:bg-[var(--color-primary)]/20'],
  ['hover:border-primary/30', 'hover:border-[var(--color-primary)]/30'],
  ['hover:border-primary', 'hover:border-[var(--color-primary)]'],
  ['hover:text-primary', 'hover:text-[var(--color-primary)]'],
  ['focus:ring-primary/20', 'focus:ring-[var(--color-primary)]/20'],
  ['focus:ring-primary', 'focus:ring-[var(--color-primary)]'],
  ['focus:border-primary', 'focus:border-[var(--color-primary)]'],
  ['shadow-primary/20', 'shadow-[var(--color-primary)]/20'],
  ['shadow-primary', 'shadow-[var(--color-primary)]'],
  ['border-primary/20', 'border-[var(--color-primary)]/20'],
  ['border-primary/30', 'border-[var(--color-primary)]/30'],
  ['border-primary', 'border-[var(--color-primary)]'],
  ['bg-primary/5', 'bg-[var(--color-primary)]/5'],
  ['bg-primary/10', 'bg-[var(--color-primary)]/10'],
  ['bg-primary/20', 'bg-[var(--color-primary)]/20'],
  ['bg-primary/80', 'bg-[var(--color-primary)]/80'],
  ['bg-primary/85', 'bg-[var(--color-primary)]/85'],
  ['bg-primary/50', 'bg-[var(--color-primary)]/50'],
  ['bg-primary', 'bg-[var(--color-primary)]'],
  ['text-primary/80', 'text-[var(--color-primary)]/80'],
  ['text-primary', 'text-[var(--color-primary)]'],
  // Gray colors in components (not in server files)
  ['bg-gray-50', 'bg-[var(--color-bg-soft)]'],
  ['bg-gray-100', 'bg-[var(--color-bg-main)]'],
  ['text-gray-900', 'text-[var(--color-text-main)]'],
  ['text-gray-800', 'text-[var(--color-text-main)]'],
  ['text-gray-700', 'text-[var(--color-text-main)]'],
  ['text-gray-600', 'text-[var(--color-text-muted)]'],
  ['text-gray-500', 'text-[var(--color-text-muted)]'],
  ['text-gray-400', 'text-[var(--color-text-muted)]'],
  ['border-gray-300', 'border-[var(--color-border-strong)]'],
  ['border-gray-200', 'border-[var(--color-border-soft)]'],
  ['border-gray-100', 'border-[var(--color-border-soft)]'],
  ['hover:bg-gray-200', 'hover:bg-[var(--color-bg-main)]'],
  ['hover:bg-gray-100', 'hover:bg-[var(--color-bg-soft)]'],
  ['hover:bg-gray-50', 'hover:bg-[var(--color-bg-soft)]'],
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let fileReplacements = 0;
  
  replacements.forEach(([from, to]) => {
    // Only replace if the pattern exists and is NOT already inside a var() context
    // Simple check: if the 'from' string exists in the file
    if (content.includes(from)) {
      const count = content.split(from).length - 1;
      content = content.split(from).join(to);
      fileReplacements += count;
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
