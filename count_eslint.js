const fs = require('fs');
const data = JSON.parse(fs.readFileSync('eslint_output.json', 'utf-8'));
let errors = 0, warnings = 0;
for (const file of data) {
  errors += file.errorCount || 0;
  warnings += file.warningCount || 0;
}
console.log(`Total errors: ${errors}`);
console.log(`Total warnings: ${warnings}`);
console.log(`Files: ${data.length}`);
