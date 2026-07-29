#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const SOURCE_SYSTEM = 'auction_yodha';
const PAGE_SIZE = 500;
const BATCH_SIZE = 100;
const apply = process.argv.includes('--apply');

const required = [
  'AY_SUPABASE_URL',
  'AY_SUPABASE_SERVICE_ROLE_KEY',
  'SPORTSTAGE_SUPABASE_URL',
  'SPORTSTAGE_SUPABASE_SERVICE_ROLE_KEY',
];
const missing = required.filter(name => !process.env[name]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const source = createClient(
  process.env.AY_SUPABASE_URL,
  process.env.AY_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  },
);
const destination = createClient(
  process.env.SPORTSTAGE_SUPABASE_URL,
  process.env.SPORTSTAGE_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  },
);

function cleanText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return { legacy_data: value };
  }
}

function mapPlayer(player) {
  const metadata = parseMetadata(player.data);
  return {
    source_system: SOURCE_SYSTEM,
    source_player_id: String(player.id),
    display_name: cleanText(player.player_name) ?? 'Unknown player',
    batting_hand: cleanText(metadata['Batting Hand'] ?? metadata.batting_hand),
    bowling_style: cleanText(metadata['Bowling Style'] ?? metadata.bowling_style),
    image_url: cleanText(player.image),
    cricheroes_url: cleanText(player.cricheroes_url),
    source_metadata: {
      ...metadata,
      auction_yodha: {
        runs: player.runs ?? null,
        wickets: player.wickets ?? null,
        matches: player.matches ?? null,
        migrated_at: new Date().toISOString(),
      },
    },
    updated_at: new Date().toISOString(),
  };
}

async function readAllPlayers() {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await source
      .from('players')
      .select('id, player_name, cricheroes_url, runs, wickets, matches, image, data')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`AuctionYodha read failed: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

async function run() {
  console.log(apply ? 'APPLY MODE' : 'DRY RUN (pass --apply to write)');
  const sourcePlayers = await readAllPlayers();
  const unique = new Map(sourcePlayers.map(player => [String(player.id), mapPlayer(player)]));
  const records = [...unique.values()];
  console.log(`Read ${sourcePlayers.length} rows; ${records.length} unique player identities.`);

  const { count, error: countError } = await destination
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('source_system', SOURCE_SYSTEM);
  if (countError) throw new Error(`SportStage check failed: ${countError.message}`);
  console.log(`SportStage currently has ${count ?? 0} AuctionYodha players.`);

  if (!apply) {
    console.log(`Would upsert ${records.length} players in batches of ${BATCH_SIZE}.`);
    console.table(records.slice(0, 10).map(player => ({
      source_player_id: player.source_player_id,
      display_name: player.display_name,
      cricheroes_url: player.cricheroes_url,
    })));
    return;
  }

  let migrated = 0;
  for (let index = 0; index < records.length; index += BATCH_SIZE) {
    const batch = records.slice(index, index + BATCH_SIZE);
    const { error } = await destination
      .from('players')
      .upsert(batch, { onConflict: 'source_system,source_player_id' });
    if (error) throw new Error(`Batch ${index / BATCH_SIZE + 1} failed: ${error.message}`);
    migrated += batch.length;
    console.log(`Upserted ${migrated}/${records.length}`);
  }
  console.log(`Migration complete: ${migrated} players upserted.`);
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
