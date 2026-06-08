const fs = require('fs');
const data = JSON.parse(fs.readFileSync('eslint_output.json', 'utf-8'));
for (const file of data) {
  if (file.errorCount > 0) {
    console.log(`\nFILE: ${file.filePath}`);
    for (const msg of file.messages) {
      if (msg.severity === 2) {
        console.log(`  Line ${msg.line}:${msg.column} [${msg.ruleId}] ${msg.message}`);
      }
    }
  }
}
