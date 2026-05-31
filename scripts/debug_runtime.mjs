// Fetch the transformed App.tsx and look for potential issues
const res = await fetch('http://localhost:3000/src/App.tsx');
const code = await res.text();

// Check for any import that might fail
const importLines = code.split('\n').filter(l => l.includes('import '));
console.log('=== App.tsx imports ===');
for (const line of importLines.slice(0, 30)) {
  console.log(line.trim().substring(0, 120));
}

// Check the Login component sub-imports
console.log('\n=== Login.tsx ===');
const loginRes = await fetch('http://localhost:3000/src/components/Login.tsx');
const loginCode = await loginRes.text();
const loginImports = loginCode.split('\n').filter(l => l.includes('import '));
for (const line of loginImports) {
  console.log(line.trim().substring(0, 120));
}

// Check if LoginIllustration exists
console.log('\n=== LoginIllustration ===');
const illRes = await fetch('http://localhost:3000/src/components/Login/LoginIllustration.tsx');
console.log('Status:', illRes.status);
if (illRes.status !== 200) {
  const errText = await illRes.text();
  console.log('Error:', errText.substring(0, 500));
}

// Check LoginHeader
console.log('\n=== LoginHeader ===');
const headerRes = await fetch('http://localhost:3000/src/components/Login/LoginHeader.tsx');
console.log('Status:', headerRes.status);
if (headerRes.status !== 200) {
  const errText = await headerRes.text();
  console.log('Error:', errText.substring(0, 500));
}

// Check LoginForm
console.log('\n=== LoginForm ===');
const formRes = await fetch('http://localhost:3000/src/components/Login/LoginForm.tsx');
console.log('Status:', formRes.status);
if (formRes.status !== 200) {
  const errText = await formRes.text();
  console.log('Error:', errText.substring(0, 500));
}

// Check LoginFooter
console.log('\n=== LoginFooter ===');
const footerRes = await fetch('http://localhost:3000/src/components/Login/LoginFooter.tsx');
console.log('Status:', footerRes.status);
if (footerRes.status !== 200) {
  const errText = await footerRes.text();
  console.log('Error:', errText.substring(0, 500));
}
