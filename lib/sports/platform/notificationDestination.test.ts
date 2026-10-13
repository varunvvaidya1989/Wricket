import { describe, expect, it } from 'vitest';
import { notificationDestination } from './notificationDestination';
import { authReturnDescription } from '@/lib/auth/authExperience';

describe('notification destinations', () => {
  it.each(['/tennis', '/notifications', '/wricket/team/abc-123', '/padel/competition/abc-123', '/badminton/match/abc-123/feed', '/wricket/match/abc-123/score', '/tournament?id=abc-123'])('preserves supported destination %s', destination => {
    expect(notificationDestination(destination)).toBe(destination);
  });
  it.each([undefined, '', '//example.com', 'https://example.com', '/\\example.com', '/tennis/../account', '/tennis/%2e%2e/account', '/tennis#x', '/account?returnTo=https://example.com', '/unknown/private', '/tennis/team/x?redirect=https://example.com', ' /tennis', '/tennis%0a'])('rejects malformed or unknown destination %s', destination => {
    expect(notificationDestination(destination)).toBeUndefined();
  });
});

describe('auth task description', () => {
  it('describes invitation and match returns without revealing tokens', () => {
    expect(authReturnDescription('/wricket/team/join?token=secret')).toBe('Your team invitation');
    expect(authReturnDescription('/wricket/tournament/join?token=secret')).toBe('Your tournament invitation');
    expect(authReturnDescription('/badminton/match/new')).toBe('Your match setup');
    expect(authReturnDescription('/profile')).toBe('Your account');
    expect(authReturnDescription()).toBe('Your sports');
  });
});
