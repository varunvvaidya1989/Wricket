// Generated from the canonical app source; run npm run mvp:edge:build.
export function eligibleCompletedMatch(match) {
    const kind = String(match.result?.kind ?? match.result?.result_kind ?? '');
    return match.status === 'COMPLETED' && !['CANCELLED', 'NO_RESULT'].includes(kind);
}
export function matchesInPeriod(matches, period, now = new Date()) {
    return matches.filter(match => {
        if (!eligibleCompletedMatch(match))
            return false;
        if (period === 'career')
            return true;
        const year = new Date(match.scheduled_at ?? match.created_at ?? '').getFullYear();
        return year === now.getFullYear() - (period === 'previousYear' ? 1 : 0);
    });
}
// Corrections target client event IDs. Scope them to their match so imported
// histories with the same client ID cannot erase another match's delivery.
export function activeStatisticsBalls(events) {
    const reversed = new Set(events.filter(event => event.kind === 'BALL_CORRECTED')
        .map(event => `${event.match_id}:${String(event.payload?.target_client_event_id ?? '')}`));
    return events.filter(event => event.kind === 'BALL_RECORDED' &&
        !reversed.has(`${event.match_id}:${event.client_event_id ?? event.id}`))
        .sort((a, b) => a.match_id.localeCompare(b.match_id) || a.sequence - b.sequence || a.id.localeCompare(b.id));
}
export function bowlerCreditedWicket(payload) {
    return Boolean(payload.is_wicket) && ['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET'].includes(String(payload.dismissal_kind));
}
