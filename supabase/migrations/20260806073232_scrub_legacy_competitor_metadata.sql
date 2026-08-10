update public.players
set source_metadata = source_metadata - 'CrickHeroes URL'
where source_system = 'auction_yodha' and source_metadata ? 'CrickHeroes URL';
