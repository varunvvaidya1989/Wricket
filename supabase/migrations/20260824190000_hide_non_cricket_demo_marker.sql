update public.sport_competitions
set
  rules = rules || jsonb_build_object('mock_seed_batch', 'non_cricket_demo_2026_v1'),
  description = nullif(
    btrim(replace(description, '[SportStage demo:non_cricket_demo_2026_v1]', '')),
    ''
  )
where owner_account_id = 'e9b888ec-f819-4ae1-b6af-914b8613ca4e'
  and description like '%[SportStage demo:non_cricket_demo_2026_v1]%';
