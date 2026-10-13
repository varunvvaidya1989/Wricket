import { requireHealthyBackend, testEnvironment } from './environment.mjs';

try {
  const config = testEnvironment(process.env, { requireBackend: true });
  await requireHealthyBackend(config);
  console.log('Isolated local Supabase endpoint is reachable. No records were changed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
