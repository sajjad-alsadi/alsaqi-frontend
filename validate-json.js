const fs = require('fs');
try {
  JSON.parse(fs.readFileSync('src/locales/ar.json', 'utf8'));
  console.log('ar.json: VALID');
} catch (e) {
  console.log('ar.json: INVALID -', e.message);
}
try {
  JSON.parse(fs.readFileSync('src/locales/en.json', 'utf8'));
  console.log('en.json: VALID');
} catch (e) {
  console.log('en.json: INVALID -', e.message);
}
