import fs from 'fs';
import path from 'path';

const SRC_DIR = path.join(process.cwd(), 'src/server/routes');

const walk = (dir: string, fileList: string[] = []) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      fileList = walk(path.join(dir, file), fileList);
    } else if (file.endsWith('.ts')) {
      fileList.push(path.join(dir, file));
    }
  }
  return fileList;
};

const constantsStr1 = `['Admin']`;
const constantsStr2 = `['Admin', 'Administrator']`;
const constantsStr3 = `['Admin', 'Administrator', 'Manager']`;
const constantsStr4 = `['Admin', 'Manager']`;
const constantsStr5 = `['Admin', 'Administrator', 'Compliance', 'Compliance Officer']`;
const constantsStr6 = `['Admin', 'Staff']`;

const files = walk(SRC_DIR);

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let originalContent = content;
  
  let needsAdminRoles = false;
  let needsComplianceRoles = false;
  let needsStaffRoles = false;

  content = content.replace(/authorize\(\['Admin'\]\)/g, () => {
    needsAdminRoles = true; return `authorize(ADMIN_ROLES)`;
  });
  content = content.replace(/authorize\(\['Admin', 'Administrator'\]\)/g, () => {
    needsAdminRoles = true; return `authorize(ADMIN_ROLES)`;
  });
  content = content.replace(/authorize\(\['Admin', 'Administrator', 'Manager'\]\)/g, () => {
    needsAdminRoles = true; return `authorize(ADMIN_ROLES)`;
  });
  content = content.replace(/authorize\(\['Admin', 'Manager'\]\)/g, () => {
    needsAdminRoles = true; return `authorize(ADMIN_ROLES)`;
  });

  content = content.replace(/authorize\(\['Admin', 'Administrator', 'Compliance', 'Compliance Officer'\]\)/g, () => {
    needsComplianceRoles = true; return `authorize(COMPLIANCE_ROLES)`;
  });

  content = content.replace(/authorize\(\['Admin', 'Staff'\]\)/g, () => {
    needsStaffRoles = true; return `authorize(STAFF_ROLES)`;
  });

  if (content !== originalContent) {
    // Determine relative path depth
    const depth = filePath.replace(SRC_DIR, '').split(path.sep).length - 1;
    const dotdots = depth > 0 ? '../'.repeat(depth) : './';
    const constantsPath = `${dotdots}../../constants`;

    const imports: string[] = [];
    if (needsAdminRoles && !content.includes('ADMIN_ROLES')) imports.push('ADMIN_ROLES');
    if (needsComplianceRoles && !content.includes('COMPLIANCE_ROLES')) imports.push('COMPLIANCE_ROLES');
    if (needsStaffRoles && !content.includes('STAFF_ROLES')) imports.push('STAFF_ROLES');

    if (imports.length > 0) {
      const importStmt = `import { ${imports.join(', ')} } from '${constantsPath}';\n`;
      content = importStmt + content;
    }
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}
console.log("Refactoring complete.");
