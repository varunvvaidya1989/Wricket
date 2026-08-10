-- The public security-invoker wrappers execute these private functions as the
-- authenticated caller. The private schema is not exposed by the Data API and
-- both functions independently require auth.uid(), so grant only the exact
-- internal calls needed by the wrappers.
grant execute on function app_private.resolve_auction_yodha_link(text) to authenticated;
grant execute on function app_private.confirm_auction_yodha_link(uuid) to authenticated;
