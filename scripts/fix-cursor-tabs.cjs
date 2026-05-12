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
    } else if (filePath.endsWith('.tsx')) {
      results.push(filePath);
    }
  });
  return results;
}

const files = walk('src');
let totalReplacements = 0;

// Fix: Add cursor-pointer to tab buttons that are missing it
// Pattern: "rounded-xl text-sm font-bold transition-all" without cursor-pointer
const replacements = [
  // Tab buttons missing cursor-pointer
  ['rounded-xl text-sm font-bold transition-all', 'rounded-xl text-sm font-bold transition-all cursor-pointer'],
  // Also fix the OrgStructure blue-600 issue
  ['text-blue-600', 'text-[var(--color-primary)]'],
  ['bg-blue-50', 'bg-[var(--color-primary-light)]'],
  ['bg-blue-500', 'bg-[var(--color-primary)]'],
  ['text-blue-500', 'text-[var(--color-primary)]'],
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let fileReplacements = 0;
  
  replacements.forEach(([from, to]) => {
    if (content.includes(from) && !content.includes(to)) {
      const count = content.split(from).length - 1;
      content = content.split(from).join(to);
      fileReplacements += count;
    }
  });
  
  if (fileReplacements > 0) {
    fs.writeFileSync(f, content, 'utf8');
    totalReplacements += fileReplacements;
    console.log(`Fixed ${fileReplacements} in: ${f}`);
  }
});

console.log(`\nTotal: ${totalReplacements}`);
