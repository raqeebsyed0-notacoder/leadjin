import { describe, it, expect } from 'vitest';

// Mirror of getSubscriptionStatus from server.ts
function getSubscriptionStatus(user: {
  email: string;
  is_founder?: number;
  subscription_plan?: string;
  subscription_expires_at?: string | null;
  trial_ends_at?: string | null;
}, isFounderEmail: (email: string) => boolean): { status: string; daysLeft: number; isActive: boolean } {
  if (isFounderEmail(user.email) || user.is_founder) {
    return { status: 'founder', daysLeft: -1, isActive: true };
  }
  if (user.subscription_plan === 'pro') {
    if (user.subscription_expires_at) {
      const expires = new Date(user.subscription_expires_at);
      if (expires > new Date()) {
        return { status: 'pro', daysLeft: Math.ceil((expires.getTime() - Date.now()) / 86400000), isActive: true };
      }
    } else {
      return { status: 'pro', daysLeft: -1, isActive: true };
    }
  }
  if (user.trial_ends_at) {
    const trialEnd = new Date(user.trial_ends_at);
    const daysLeft = Math.ceil((trialEnd.getTime() - Date.now()) / 86400000);
    if (daysLeft > 0) {
      return { status: 'trial', daysLeft, isActive: true };
    }
  }
  return { status: 'trial_expired', daysLeft: 0, isActive: false };
}

const notFounder = () => false;
const isFounder = (email: string) => email === 'founder@test.com';

describe('getSubscriptionStatus', () => {
  it('returns founder for founder email', () => {
    expect(getSubscriptionStatus({ email: 'founder@test.com' }, isFounder))
      .toEqual({ status: 'founder', daysLeft: -1, isActive: true });
  });

  it('returns founder for is_founder flag', () => {
    expect(getSubscriptionStatus({ email: 'user@test.com', is_founder: 1 }, notFounder))
      .toEqual({ status: 'founder', daysLeft: -1, isActive: true });
  });

  it('returns pro without expiry', () => {
    expect(getSubscriptionStatus({ email: 'user@test.com', subscription_plan: 'pro' }, notFounder))
      .toEqual({ status: 'pro', daysLeft: -1, isActive: true });
  });

  it('returns pro with future expiry', () => {
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    const result = getSubscriptionStatus({ email: 'user@test.com', subscription_plan: 'pro', subscription_expires_at: future }, notFounder);
    expect(result.status).toBe('pro');
    expect(result.isActive).toBe(true);
    expect(result.daysLeft).toBeGreaterThan(0);
  });

  it('returns expired for pro with past expiry', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(getSubscriptionStatus({ email: 'user@test.com', subscription_plan: 'pro', subscription_expires_at: past }, notFounder))
      .toEqual({ status: 'trial_expired', daysLeft: 0, isActive: false });
  });

  it('returns trial for active trial', () => {
    const future = new Date(Date.now() + 10 * 86400000).toISOString();
    const result = getSubscriptionStatus({ email: 'user@test.com', subscription_plan: 'trial', trial_ends_at: future }, notFounder);
    expect(result.status).toBe('trial');
    expect(result.isActive).toBe(true);
    expect(result.daysLeft).toBeGreaterThan(0);
  });

  it('returns expired for past trial', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(getSubscriptionStatus({ email: 'user@test.com', subscription_plan: 'trial', trial_ends_at: past }, notFounder))
      .toEqual({ status: 'trial_expired', daysLeft: 0, isActive: false });
  });

  it('returns expired for free user with no trial', () => {
    expect(getSubscriptionStatus({ email: 'user@test.com', subscription_plan: 'free' }, notFounder))
      .toEqual({ status: 'trial_expired', daysLeft: 0, isActive: false });
  });
});
