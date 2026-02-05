/**
 * Email Sequence Job
 * 
 * This job runs daily to check all users and send appropriate emails
 * based on their signup date, activity, and subscription status.
 */

import { getEmailSentRecord, recordEmailSent, getUsersForEmailSequence } from "./db";
import { 
  sendEvent, 
  updateContact,
  onNoCallsAfter48Hours,
  onPowerUser,
  onTrialEndingSoon,
} from "./loops";

// Track which emails have been sent to avoid duplicates
// In production, this should be stored in the database
const emailsSentCache = new Map<string, Set<string>>();

interface UserForEmail {
  id: number;
  email: string;
  name: string | null;
  createdAt: Date;
  tenantId: number;
  tenantName: string;
  callsGraded: number;
  isSubscribed: boolean;
  trialEndsAt: Date | null;
  planType: string | null;
}

/**
 * Get the cache key for tracking sent emails
 */
function getEmailCacheKey(userId: number, emailId: string): string {
  return `${userId}:${emailId}`;
}

/**
 * Check if an email has already been sent to a user
 */
async function hasEmailBeenSent(userId: number, emailId: string): Promise<boolean> {
  const sent = await getEmailSentRecord(userId, emailId);
  return sent !== null;
}

/**
 * Calculate days since signup
 */
function getDaysSinceSignup(createdAt: Date): number {
  const now = new Date();
  const diffTime = now.getTime() - createdAt.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Process a single user for email sequence
 */
async function processUserForEmails(user: UserForEmail): Promise<string[]> {
  const emailsSent: string[] = [];
  const daysSinceSignup = getDaysSinceSignup(user.createdAt);
  const firstName = user.name?.split(' ')[0] || 'there';

  console.log(`[EmailJob] Processing user ${user.email}, day ${daysSinceSignup}, calls: ${user.callsGraded}, subscribed: ${user.isSubscribed}`);

  // ============================================
  // Trial Period Emails (Days 0-3)
  // ============================================

  // Day 1: First call check-in (if no calls graded)
  if (daysSinceSignup === 1 && user.callsGraded === 0) {
    if (!(await hasEmailBeenSent(user.id, 'day1_first_call'))) {
      await sendEvent({
        email: user.email,
        eventName: 'day1_first_call',
        eventProperties: {
          firstName,
          callsGraded: user.callsGraded,
        },
      });
      await recordEmailSent(user.id, 'day1_first_call');
      emailsSent.push('day1_first_call');
    }
  }

  // Day 2: Trial ending reminder
  if (daysSinceSignup === 2 && !user.isSubscribed) {
    if (!(await hasEmailBeenSent(user.id, 'day2_trial_reminder'))) {
      await sendEvent({
        email: user.email,
        eventName: 'day2_trial_reminder',
        eventProperties: {
          firstName,
          callsGraded: user.callsGraded,
        },
      });
      await recordEmailSent(user.id, 'day2_trial_reminder');
      emailsSent.push('day2_trial_reminder');
    }
  }

  // Day 3: Final trial day reminder
  if (daysSinceSignup === 3 && !user.isSubscribed) {
    if (!(await hasEmailBeenSent(user.id, 'day3_final_reminder'))) {
      await sendEvent({
        email: user.email,
        eventName: 'day3_final_reminder',
        eventProperties: {
          firstName,
          callsGraded: user.callsGraded,
        },
      });
      await recordEmailSent(user.id, 'day3_final_reminder');
      emailsSent.push('day3_final_reminder');
    }
  }

  // ============================================
  // Post-Conversion Emails (Days 4-14)
  // ============================================

  // Day 7: Week 1 recap (for subscribed users)
  if (daysSinceSignup === 7 && user.isSubscribed) {
    if (!(await hasEmailBeenSent(user.id, 'day7_week_recap'))) {
      await sendEvent({
        email: user.email,
        eventName: 'day7_week_recap',
        eventProperties: {
          firstName,
          callsGraded: user.callsGraded,
        },
      });
      await recordEmailSent(user.id, 'day7_week_recap');
      emailsSent.push('day7_week_recap');
    }
  }

  // Day 10: Feature spotlight (for subscribed users)
  if (daysSinceSignup === 10 && user.isSubscribed) {
    if (!(await hasEmailBeenSent(user.id, 'day10_feature_spotlight'))) {
      await sendEvent({
        email: user.email,
        eventName: 'day10_feature_spotlight',
        eventProperties: {
          firstName,
        },
      });
      await recordEmailSent(user.id, 'day10_feature_spotlight');
      emailsSent.push('day10_feature_spotlight');
    }
  }

  // Day 14: Two week check-in (for subscribed users)
  if (daysSinceSignup === 14 && user.isSubscribed) {
    if (!(await hasEmailBeenSent(user.id, 'day14_two_week_checkin'))) {
      await sendEvent({
        email: user.email,
        eventName: 'day14_two_week_checkin',
        eventProperties: {
          firstName,
          callsGraded: user.callsGraded,
          userId: user.id.toString(),
        },
      });
      await recordEmailSent(user.id, 'day14_two_week_checkin');
      emailsSent.push('day14_two_week_checkin');
    }
  }

  // ============================================
  // Engagement Trigger Emails
  // ============================================

  // No calls after 48 hours
  if (daysSinceSignup >= 2 && user.callsGraded === 0 && !user.isSubscribed) {
    if (!(await hasEmailBeenSent(user.id, 'no_calls_48h'))) {
      await onNoCallsAfter48Hours(user.email);
      await recordEmailSent(user.id, 'no_calls_48h');
      emailsSent.push('no_calls_48h');
    }
  }

  // Power user recognition (10+ calls in first week)
  if (daysSinceSignup <= 7 && user.callsGraded >= 10) {
    if (!(await hasEmailBeenSent(user.id, 'power_user'))) {
      await onPowerUser(user.email, user.callsGraded);
      await recordEmailSent(user.id, 'power_user');
      emailsSent.push('power_user');
    }
  }

  // Trial ending soon (1 day before trial ends)
  if (user.trialEndsAt && !user.isSubscribed) {
    const hoursUntilTrialEnds = (user.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilTrialEnds > 0 && hoursUntilTrialEnds <= 24) {
      if (!(await hasEmailBeenSent(user.id, 'trial_ending_soon'))) {
        await onTrialEndingSoon(user.email);
        await recordEmailSent(user.id, 'trial_ending_soon');
        emailsSent.push('trial_ending_soon');
      }
    }
  }

  return emailsSent;
}

/**
 * Main job function - processes all users for email sequence
 */
export async function runEmailSequenceJob(): Promise<{
  usersProcessed: number;
  emailsSent: number;
  details: Array<{ email: string; emailsSent: string[] }>;
}> {
  console.log('[EmailJob] Starting email sequence job...');
  
  const startTime = Date.now();
  const results: Array<{ email: string; emailsSent: string[] }> = [];
  let totalEmailsSent = 0;

  try {
    // Get all users who need to be processed
    const users = await getUsersForEmailSequence();
    
    console.log(`[EmailJob] Found ${users.length} users to process`);

    for (const user of users) {
      try {
        const emailsSent = await processUserForEmails(user);
        if (emailsSent.length > 0) {
          results.push({ email: user.email, emailsSent });
          totalEmailsSent += emailsSent.length;
        }
      } catch (error) {
        console.error(`[EmailJob] Error processing user ${user.email}:`, error);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[EmailJob] Completed in ${duration}ms. Processed ${users.length} users, sent ${totalEmailsSent} emails.`);

    return {
      usersProcessed: users.length,
      emailsSent: totalEmailsSent,
      details: results,
    };
  } catch (error) {
    console.error('[EmailJob] Job failed:', error);
    throw error;
  }
}

/**
 * Export for use in routers
 */
export { processUserForEmails };
