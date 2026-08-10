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

function legacyContact(metadata) {
  const email = cleanText(metadata.email ?? metadata.Email ?? metadata.email_address ?? metadata['Email Address']);
  const phone = cleanText(metadata.phone ?? metadata.Phone ?? metadata.mobile ?? metadata.Mobile ?? metadata.phone_number ?? metadata['Phone Number']);
  return { email: email?.toLowerCase() ?? null, phone: phone?.replace(/[^0-9+]/g, '') ?? null };
}

function safeMetadata(metadata) {
  const result = { ...metadata };
  for (const key of ['email', 'Email', 'email_address', 'Email Address', 'phone', 'Phone', 'mobile', 'Mobile', 'phone_number', 'Phone Number']) delete result[key];
  const retiredProviderKey = ['crick', 'heroesurl'].join('');
  for (const key of Object.keys(result)) {
    if (key.toLowerCase().replace(/[^a-z]/g, '') === retiredProviderKey) delete result[key];
  }
  return result;
}

function normalizedName(value) {
  return cleanText(value)?.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase() ?? null;
}

function accountContact(user) {
  return {
    email: cleanText(user.email)?.toLowerCase() ?? null,
    phone: cleanText(user.phone)?.replace(/[^0-9+]/g, '') ?? null,
    email_verified: Boolean(user.email_confirmed_at),
    phone_verified: Boolean(user.phone_confirmed_at),
  };
}

function mapPlayer(player, linkedAccount) {
  const metadata = parseMetadata(player.data);
  const metadataContact = legacyContact(metadata);
  return {
    contact: linkedAccount ? accountContact(linkedAccount) : { ...metadataContact, email_verified: false, phone_verified: false },
    player: {
    source_system: SOURCE_SYSTEM,
    source_player_id: String(player.id),
    display_name: cleanText(player.player_name) ?? 'Unknown player',
    batting_hand: cleanText(metadata['Batting Hand'] ?? metadata.batting_hand),
    bowling_style: cleanText(metadata['Bowling Style'] ?? metadata.bowling_style),
    image_url: cleanText(player.image),
    source_metadata: {
      ...safeMetadata(metadata),
      auction_yodha: {
        runs: player.runs ?? null,
        wickets: player.wickets ?? null,
        matches: player.matches ?? null,
        migrated_at: new Date().toISOString(),
      },
    },
    updated_at: new Date().toISOString(),
    },
  };
}

async function readAllAuthUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await source.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`AuctionYodha Auth read failed: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function readAllPlayers() {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await source
      .from('players')
      .select('id, player_name, runs, wickets, matches, image, data')
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
  const sourceAccounts = await readAllAuthUsers();
  const accountsByName = new Map();
  for (const account of sourceAccounts) {
    const metadata = account.user_metadata ?? {};
    const name = normalizedName(metadata.display_name ?? metadata.full_name ?? metadata.name);
    if (!name) continue;
    const matches = accountsByName.get(name) ?? [];
    matches.push(account);
    accountsByName.set(name, matches);
  }
  const playersByName = new Map();
  for (const player of sourcePlayers) {
    const name = normalizedName(player.player_name);
    if (!name) continue;
    const matches = playersByName.get(name) ?? [];
    matches.push(player);
    playersByName.set(name, matches);
  }
  let uniquelyMatchedAccounts = 0;
  const unique = new Map(sourcePlayers.map(player => {
    const name = normalizedName(player.player_name);
    const accountMatches = name ? accountsByName.get(name) ?? [] : [];
    const playerMatches = name ? playersByName.get(name) ?? [] : [];
    const linkedAccount = accountMatches.length === 1 && playerMatches.length === 1 ? accountMatches[0] : undefined;
    if (linkedAccount) uniquelyMatchedAccounts += 1;
    return [String(player.id), mapPlayer(player, linkedAccount)];
  }));
  const records = [...unique.values()];
  console.log(`Read ${sourcePlayers.length} rows; ${records.length} unique player identities.`);
  console.log(`Read ${sourceAccounts.length} AuctionYodha accounts; ${uniquelyMatchedAccounts} unique exact-name player/account matches.`);

  const { count, error: countError } = await destination
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('source_system', SOURCE_SYSTEM);
  if (countError) throw new Error(`SportStage check failed: ${countError.message}`);
  console.log(`SportStage currently has ${count ?? 0} AuctionYodha players.`);

  if (!apply) {
    console.log(`Would upsert ${records.length} players in batches of ${BATCH_SIZE}.`);
    console.table(records.slice(0, 10).map(record => ({
      source_player_id: record.player.source_player_id,
      display_name: record.player.display_name,
      has_contact: Boolean(record.contact.email || record.contact.phone),
    })));
    return;
  }

  let migrated = 0;
  for (let index = 0; index < records.length; index += BATCH_SIZE) {
    const batch = records.slice(index, index + BATCH_SIZE);
    const { data: savedPlayers, error } = await destination
      .from('players')
      .upsert(batch.map(record => record.player), { onConflict: 'source_system,source_player_id' })
      .select('id, source_player_id');
    if (error) throw new Error(`Batch ${index / BATCH_SIZE + 1} failed: ${error.message}`);
    const recordBySourceId = new Map(batch.map(record => [record.player.source_player_id, record]));
    const contacts = savedPlayers.flatMap(saved => {
      const contact = recordBySourceId.get(saved.source_player_id)?.contact;
      return contact && (contact.email || contact.phone) ? [{ player_id: saved.id, ...contact, updated_at: new Date().toISOString() }] : [];
    });
    if (contacts.length) {
      const { error: contactError } = await destination.from('legacy_player_contacts').upsert(contacts, { onConflict: 'player_id' });
      if (contactError) throw new Error(`Contact batch ${index / BATCH_SIZE + 1} failed: ${contactError.message}`);
    }
    migrated += batch.length;
    console.log(`Upserted ${migrated}/${records.length}`);
  }
  console.log(`Migration complete: ${migrated} players upserted.`);
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
