const fs = require('fs');
const path = require('path');

const envExamplePath = path.join(process.cwd(), '.env.example');
const requiredPublicKeys = [
  'EXPO_PUBLIC_ENABLE_NON_CRICKET_SPORTS',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
];
const forbiddenPatterns = [
  /SERVICE_ROLE/i,
  /SECRET/i,
  /SUPABASE_SERVICE/i,
  /sb_secret_/i,
];

function parseEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return index === -1
          ? [line, '']
          : [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

if (!fs.existsSync(envExamplePath)) {
  console.error('.env.example is missing.');
  process.exit(1);
}

const source = fs.readFileSync(envExamplePath, 'utf8');
const env = parseEnv(source);
const missing = requiredPublicKeys.filter((key) => !env[key]);

if (missing.length > 0) {
  console.error(`Missing required public env values: ${missing.join(', ')}`);
  process.exit(1);
}

if (!env.EXPO_PUBLIC_SUPABASE_URL.startsWith('https://')) {
  console.error('EXPO_PUBLIC_SUPABASE_URL must be an https URL.');
  process.exit(1);
}

if (!env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
  console.error('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must use a publishable key.');
  process.exit(1);
}

for (const [key, value] of Object.entries(env)) {
  if (forbiddenPatterns.some((pattern) => pattern.test(key) || pattern.test(value))) {
    console.error(`Forbidden secret-like value found in .env.example: ${key}`);
    process.exit(1);
  }
}

console.log('Environment example check passed.');
