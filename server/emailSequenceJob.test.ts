import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module
vi.mock('./db', () => ({
  getEmailSentRecord: vi.fn(),
  recordEmailSent: vi.fn(),
  getUsersForEmailSequence: vi.fn(),
}));

// Mock the loops module
vi.mock('./loops', () => ({
  sendEvent: vi.fn().mockResolvedValue({ success: true }),
  updateContact: vi.fn().mockResolvedValue({ success: true }),
  onNoCallsAfter48Hours: vi.fn().mockResolvedValue({ success: true }),
  onPowerUser: vi.fn().mockResolvedValue({ success: true }),
  onTrialEndingSoon: vi.fn().mockResolvedValue({ success: true }),
  sendTransactionalEmail: vi.fn().mockResolvedValue({ success: true }),
  TRANSACTIONAL_EMAIL_IDS: {
    DAY1_FIRST_CALL: 'day1_first_call_id',
    DAY2_TRIAL_ENDING: 'day2_trial_ending_id',
  },
}));

import { runEmailSequenceJob } from './emailSequenceJob';
import { getEmailSentRecord, recordEmailSent, getUsersForEmailSequence } from './db';
import { sendEvent, onNoCallsAfter48Hours, onPowerUser, onTrialEndingSoon, sendTransactionalEmail } from './loops';

describe('Email Sequence Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process users and return results', async () => {
    // Mock no users to process
    vi.mocked(getUsersForEmailSequence).mockResolvedValue([]);
    
    const result = await runEmailSequenceJob();
    
    expect(result).toEqual({
      usersProcessed: 0,
      emailsSent: 0,
      details: [],
    });
    expect(getUsersForEmailSequence).toHaveBeenCalled();
  });

  it('should send day 1 email to user who signed up yesterday with no calls', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    vi.mocked(getUsersForEmailSequence).mockResolvedValue([{
      id: 1,
      email: 'test@example.com',
      name: 'Test User',
      createdAt: yesterday,
      tenantId: 1,
      tenantName: 'Test Tenant',
      callsGraded: 0,
      isSubscribed: false,
      trialEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      planType: 'trial',
    }]);
    
    vi.mocked(getEmailSentRecord).mockResolvedValue(null);
    vi.mocked(recordEmailSent).mockResolvedValue(undefined);
    
    const result = await runEmailSequenceJob();
    
    expect(result.usersProcessed).toBe(1);
    expect(result.emailsSent).toBeGreaterThan(0);
    // Day 1 now uses sendTransactionalEmail instead of sendEvent
    expect(sendTransactionalEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: 'test@example.com',
    }));
    expect(recordEmailSent).toHaveBeenCalledWith(1, 'day1_first_call');
  });

  it('should not send duplicate emails', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    vi.mocked(getUsersForEmailSequence).mockResolvedValue([{
      id: 1,
      email: 'test@example.com',
      name: 'Test User',
      createdAt: yesterday,
      tenantId: 1,
      tenantName: 'Test Tenant',
      callsGraded: 0,
      isSubscribed: false,
      trialEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      planType: 'trial',
    }]);
    
    // Email was already sent
    vi.mocked(getEmailSentRecord).mockResolvedValue({
      id: 1,
      userId: 1,
      emailId: 'day1_first_call',
      sentAt: new Date(),
      loopsEventId: null,
      status: 'sent',
    });
    
    const result = await runEmailSequenceJob();
    
    expect(result.emailsSent).toBe(0);
    expect(sendEvent).not.toHaveBeenCalled();
  });

  it('should send no_calls_48h email after 48 hours with no calls', async () => {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    vi.mocked(getUsersForEmailSequence).mockResolvedValue([{
      id: 1,
      email: 'test@example.com',
      name: 'Test User',
      createdAt: twoDaysAgo,
      tenantId: 1,
      tenantName: 'Test Tenant',
      callsGraded: 0,
      isSubscribed: false,
      trialEndsAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      planType: 'trial',
    }]);
    
    vi.mocked(getEmailSentRecord).mockResolvedValue(null);
    vi.mocked(recordEmailSent).mockResolvedValue(undefined);
    
    const result = await runEmailSequenceJob();
    
    // Day 2 user with 0 calls triggers both day2_trial_reminder and no_calls_48h
    expect(onNoCallsAfter48Hours).toHaveBeenCalledWith('test@example.com');
    expect(recordEmailSent).toHaveBeenCalledWith(1, 'no_calls_48h');
    // Also sends day2 trial reminder
    expect(sendTransactionalEmail).toHaveBeenCalled();
    expect(recordEmailSent).toHaveBeenCalledWith(1, 'day2_trial_reminder');
  });

  it('should send power_user email for users with 10+ calls in first week', async () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    vi.mocked(getUsersForEmailSequence).mockResolvedValue([{
      id: 1,
      email: 'poweruser@example.com',
      name: 'Power User',
      createdAt: threeDaysAgo,
      tenantId: 1,
      tenantName: 'Test Tenant',
      callsGraded: 12,
      isSubscribed: true,
      trialEndsAt: null,
      planType: 'starter',
    }]);
    
    vi.mocked(getEmailSentRecord).mockResolvedValue(null);
    vi.mocked(recordEmailSent).mockResolvedValue(undefined);
    
    const result = await runEmailSequenceJob();
    
    expect(onPowerUser).toHaveBeenCalledWith('poweruser@example.com', 12);
    expect(recordEmailSent).toHaveBeenCalledWith(1, 'power_user');
  });

  it('should send trial_ending_soon email 24 hours before trial ends', async () => {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    const trialEndsIn12Hours = new Date();
    trialEndsIn12Hours.setHours(trialEndsIn12Hours.getHours() + 12);
    
    vi.mocked(getUsersForEmailSequence).mockResolvedValue([{
      id: 1,
      email: 'trial@example.com',
      name: 'Trial User',
      createdAt: twoDaysAgo,
      tenantId: 1,
      tenantName: 'Test Tenant',
      callsGraded: 2,
      isSubscribed: false,
      trialEndsAt: trialEndsIn12Hours,
      planType: 'trial',
    }]);
    
    vi.mocked(getEmailSentRecord).mockResolvedValue(null);
    vi.mocked(recordEmailSent).mockResolvedValue(undefined);
    
    const result = await runEmailSequenceJob();
    
    // User is day 2, not subscribed, trial ending in 12h, has 2 calls
    // Should trigger: day2_trial_reminder + trial_ending_soon
    expect(onTrialEndingSoon).toHaveBeenCalledWith('trial@example.com');
    expect(recordEmailSent).toHaveBeenCalledWith(1, 'trial_ending_soon');
  });

  it('should send day 7 recap email to subscribed users', async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    vi.mocked(getUsersForEmailSequence).mockResolvedValue([{
      id: 1,
      email: 'subscriber@example.com',
      name: 'Subscribed User',
      createdAt: sevenDaysAgo,
      tenantId: 1,
      tenantName: 'Test Tenant',
      callsGraded: 5,
      isSubscribed: true,
      trialEndsAt: null,
      planType: 'starter',
    }]);
    
    vi.mocked(getEmailSentRecord).mockResolvedValue(null);
    vi.mocked(recordEmailSent).mockResolvedValue(undefined);
    
    const result = await runEmailSequenceJob();
    
    expect(sendEvent).toHaveBeenCalledWith(expect.objectContaining({
      email: 'subscriber@example.com',
      eventName: 'day7_week_recap',
    }));
    expect(recordEmailSent).toHaveBeenCalledWith(1, 'day7_week_recap');
  });
});
