export async function processMvpBatch(client, algorithm, limit = 10) {
  const { data: jobs, error } = await client.rpc('claim_cricket_mvp_work', { p_limit: limit });
  if (error) throw new Error(`Could not claim MVP work: ${error.message}`);
  const totals = { claimed: jobs.length, completed: 0, superseded: 0, failed: 0 };
  for (const job of jobs) {
    try {
      const result = job.snapshot.match.status === 'COMPLETED'
        ? algorithm.calculateMatchMvp(algorithm.cloudMvpInput(job.snapshot))
        : { matchId: job.matchId, algorithmVersion: 'wricket-mvp-v1', rankings: [], calculatedAt: new Date().toISOString() };
      const { data, error: finishError } = await client.rpc('finish_cricket_mvp_work', {
        p_match_id: job.matchId, p_lease_token: job.leaseToken, p_result: result, p_error: null,
      });
      if (finishError) throw new Error(finishError.message);
      totals[data ? 'completed' : 'superseded'] += 1;
    } catch (cause) {
      const { error: failureError } = await client.rpc('finish_cricket_mvp_work', {
        p_match_id: job.matchId, p_lease_token: job.leaseToken, p_result: null,
        p_error: cause instanceof Error ? cause.message : 'MVP calculation failed',
      });
      if (failureError) throw new Error(`Could not persist MVP failure: ${failureError.message}`);
      totals.failed += 1;
    }
  }
  return totals;
}
