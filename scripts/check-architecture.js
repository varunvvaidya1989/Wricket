const fs = require('fs');
const path = require('path');

const root = process.cwd();
const domainRoot = path.join(root, 'lib', 'domain');
const forbiddenPatterns = [
  /from\s+['"]\.\.\/db\//,
  /from\s+['"]@\/lib\/db\//,
  /from\s+['"]expo(?:-|['"])/,
  /from\s+['"]react(?:\/|['"])/,
  /from\s+['"]react-native(?:\/|['"])/,
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (entry.isFile() && fullPath.endsWith('.ts')) return [fullPath];
    return [];
  });
}

const violations = [];
for (const file of walk(domainRoot)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) {
      violations.push(path.relative(root, file));
      break;
    }
  }
}

if (violations.length > 0) {
  console.error('Domain layer has forbidden framework or persistence imports:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Architecture boundary check passed.');
