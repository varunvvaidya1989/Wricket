#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const value = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const matchId = value('--match');
const tournamentId = value('--tournament');
const all = args.includes('--all');
const batchSize = Math.max(1, Number(value('--batch-size') ?? 50));
if ([Boolean(matchId), Boolean(tournamentId), all].filter(Boolean).length !== 1) {
  throw new Error('Use exactly one of --match <id>, --tournament <id>, or --all');
}
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
const client = createClient(url, key, { auth: { persistSession: false } });

let ids = matchId ? [matchId] : [];
if (!matchId) {
  let query = client.from('matches').select('id').eq('status', 'COMPLETED').order('id');
  if (tournamentId) query = query.eq('tournament_id', tournamentId);
  const { data, error } = await query;
  if (error) throw error;
  ids = (data ?? []).map(row => row.id);
}
const failures = [];
for (let offset = 0; offset < ids.length; offset += batchSize) {
  for (const id of ids.slice(offset, offset + batchSize)) {
    const { error } = await client.from('match_mvp_calculations').upsert({
      match_id: id, algorithm_version: 'wricket-mvp-v1', status: 'PENDING',
      requested_at: new Date().toISOString(), updated_at: new Date().toISOString(), error: null,
    });
    if (error) {
      failures.push({ id, error: error.message });
      console.error(`${id}: ${error.message}`);
    }
  }
  console.log(`Queued ${Math.min(offset + batchSize, ids.length)}/${ids.length}`);
}
console.log(JSON.stringify({ queued: ids.length - failures.length, failed: failures.length }, null, 2));
process.exitCode = failures.length ? 1 : 0;
