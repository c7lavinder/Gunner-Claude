/**
 * Email Sequence Scheduled Jobs
 * 
 * This file contains the logic for sending time-based emails in the 14-day sequence.
 * These jobs should be run periodically (e.g., every hour) to check for users
 * who need to receive emails based on their signup date.
 */

import { getDb } from "./db";
import { tenants, users, teamMembers, callGrades } from "../drizzle/schema";
import { eq, and, sql, gte, lte, isNull, desc } from "drizzle-orm";
import {
  sendSequenceDay0Welcome,
  sendSequenceDay1Checkin,
  sendSequenceDay2TrialEnding,
  sendSequenceDay3FinalReminder,
  sendSequenceDay4PaidWelcome,
  sendSequenceDay7Week1Recap,
  sendSequenceDay10FeatureSpotlight,
  sendSequenceDay14Checkin,
  sendTriggerNoCalls48h,
  sendTriggerPowerUser
} from "./emailService";

// Track which emails have been sent to avoid duplicates
// In production, this should be stored in the database
interface EmailSentRecord {
  tenantId: number;
  emailType: string;
  sentAt: Date;
}

/**
 * Get the admin user for a tenant (to send emails to)
 */
async function getTenantAdmin(tenantId: number) {
  const db = await getDb();
  if (!db) return null;

  const adminMember = await db
    .select({
      userId: teamMembers.userId,
      email: users.email,
      name: users.name
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(
      and(
        eq(teamMembers.tenantId, tenantId),
        eq(teamMembers.teamRole, "admin")
      )
    )
    .limit(1);

  return adminMember[0] || null;
}

/**
 * Get call statistics for a tenant
 */
async function getTenantCallStats(tenantId: number, sinceDays?: number) {
  const db = await getDb();
  if (!db) return { totalCalls: 0, avgScore: 0, gradedCalls: 0 };

  try {
    const sinceDate = sinceDays ? new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000) : null;
    
    const result = await db
      .select({
        totalCalls: sql<number>`COUNT(*)`,
        avgScore: sql<number>`AVG(${callGrades.overallScore})`,
        gradedCalls: sql<number>`COUNT(*)`
      })
      .from(callGrades)
      .where(
        sinceDate 
          ? and(eq(callGrades.tenantId, tenantId), gte(callGrades.createdAt, sinceDate))
          : eq(callGrades.tenantId, tenantId)
      );

    return {
      totalCalls: result[0]?.totalCalls || 0,
      avgScore: result[0]?.avgScore || 0,
      gradedCalls: result[0]?.gradedCalls || 0
    };
  } catch (error) {
    console.error('[EmailSequence] Error getting call stats:', error);
    return { totalCalls: 0, avgScore: 0, gradedCalls: 0 };
  }
}

/**
 * Check if email has already been sent (using tenant settings JSON)
 */
async function hasEmailBeenSent(tenantId: number, emailType: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return true; // Fail safe - don't send if we can't check

  const tenant = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant[0]) return true;

  try {
    const settings = tenant[0].settings ? JSON.parse(tenant[0].settings) : {};
    const emailsSent = settings.emailsSent || [];
    return emailsSent.includes(emailType);
  } catch {
    return false;
  }
}

/**
 * Mark email as sent (stored in tenant settings JSON)
 */
async function markEmailSent(tenantId: number, emailType: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const tenant = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  try {
    const settings = tenant[0]?.settings ? JSON.parse(tenant[0].settings) : {};
    const emailsSent = settings.emailsSent || [];
    emailsSent.push(emailType);
    settings.emailsSent = emailsSent;

    await db
      .update(tenants)
      .set({ settings: JSON.stringify(settings) })
      .where(eq(tenants.id, tenantId));
  } catch (error) {
    console.error('[EmailSequence] Error marking email sent:', error);
  }
}

/**
 * Calculate days since tenant creation
 */
function daysSinceCreation(createdAt: Date): number {
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - createdAt.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Get hours since tenant creation
 */
function hoursSinceCreation(createdAt: Date): number {
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - createdAt.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60));
}

/**
 * Run all time-based email sequence jobs
 */
export async function runEmailSequenceJobs(): Promise<{
  processed: number;
  emailsSent: number;
  errors: string[];
}> {
  const db = await getDb();
  if (!db) {
    return { processed: 0, emailsSent: 0, errors: ["Database not available"] };
  }

  const errors: string[] = [];
  let emailsSent = 0;

  // Get all active tenants with trial or active subscription status
  const activeTenants = await db
    .select()
    .from(tenants)
    .where(
      sql`${tenants.subscriptionStatus} IN ('active') OR ${tenants.subscriptionTier} = 'trial'`
    );

  const baseUrl = process.env.VITE_OAUTH_PORTAL_URL?.replace('/oauth', '') || 'https://www.getgunner.ai';
  const dashboardLink = `${baseUrl}/dashboard`;

  for (const tenant of activeTenants) {
    try {
      const admin = await getTenantAdmin(tenant.id);
      if (!admin?.email) continue;

      const firstName = admin.name?.split(' ')[0] || 'there';
      const hoursSince = hoursSinceCreation(tenant.createdAt);
      const daysSince = daysSinceCreation(tenant.createdAt);
      const isTrial = tenant.subscriptionTier === 'trial';
      const isPaid = tenant.subscriptionStatus === 'active' && tenant.subscriptionTier !== 'trial';

      // Day 0: Welcome (immediately - within first hour)
      if (hoursSince <= 1 && !await hasEmailBeenSent(tenant.id, 'day0_welcome')) {
        const success = await sendSequenceDay0Welcome(admin.email, dashboardLink);
        if (success) {
          await markEmailSent(tenant.id, 'day0_welcome');
          emailsSent++;
        }
      }

      // Day 1: Check-in (24 hours)
      if (hoursSince >= 24 && hoursSince < 48 && !await hasEmailBeenSent(tenant.id, 'day1_checkin')) {
        const success = await sendSequenceDay1Checkin(admin.email, firstName, dashboardLink);
        if (success) {
          await markEmailSent(tenant.id, 'day1_checkin');
          emailsSent++;
        }
      }

      // Day 2: Trial Ending (48 hours - for trial users)
      if (isTrial && hoursSince >= 48 && hoursSince < 72 && !await hasEmailBeenSent(tenant.id, 'day2_trial_ending')) {
        const stats = await getTenantCallStats(tenant.id);
        const success = await sendSequenceDay2TrialEnding(
          admin.email,
          firstName,
          dashboardLink,
          stats.gradedCalls,
          Math.floor(stats.gradedCalls * 3), // Approximate insights
          Math.floor(stats.gradedCalls * 2)  // Approximate coaching moments
        );
        if (success) {
          await markEmailSent(tenant.id, 'day2_trial_ending');
          emailsSent++;
        }
      }

      // Day 3: Final Reminder (morning of last trial day - 60-72 hours)
      if (isTrial && hoursSince >= 60 && hoursSince < 72 && !await hasEmailBeenSent(tenant.id, 'day3_final_reminder')) {
        const success = await sendSequenceDay3FinalReminder(admin.email, firstName, dashboardLink);
        if (success) {
          await markEmailSent(tenant.id, 'day3_final_reminder');
          emailsSent++;
        }
      }

      // Day 4: Paid Welcome (first day as paying customer - 72-96 hours for converted users)
      if (isPaid && daysSince >= 3 && daysSince < 5 && !await hasEmailBeenSent(tenant.id, 'day4_paid_welcome')) {
        const success = await sendSequenceDay4PaidWelcome(admin.email, firstName, dashboardLink);
        if (success) {
          await markEmailSent(tenant.id, 'day4_paid_welcome');
          emailsSent++;
        }
      }

      // Day 7: Week 1 Recap
      if (isPaid && daysSince >= 7 && daysSince < 8 && !await hasEmailBeenSent(tenant.id, 'day7_week1_recap')) {
        const stats = await getTenantCallStats(tenant.id, 7);
        const success = await sendSequenceDay7Week1Recap(
          admin.email,
          firstName,
          dashboardLink,
          stats.gradedCalls,
          "Reps are missing follow-up commitments", // TODO: Calculate from actual data
          "Your team" // TODO: Calculate from actual data
        );
        if (success) {
          await markEmailSent(tenant.id, 'day7_week1_recap');
          emailsSent++;
        }
      }

      // Day 10: Feature Spotlight
      if (isPaid && daysSince >= 10 && daysSince < 11 && !await hasEmailBeenSent(tenant.id, 'day10_feature_spotlight')) {
        const success = await sendSequenceDay10FeatureSpotlight(admin.email, firstName, dashboardLink);
        if (success) {
          await markEmailSent(tenant.id, 'day10_feature_spotlight');
          emailsSent++;
        }
      }

      // Day 14: Two-Week Check-in
      if (isPaid && daysSince >= 14 && daysSince < 15 && !await hasEmailBeenSent(tenant.id, 'day14_checkin')) {
        const stats = await getTenantCallStats(tenant.id, 14);
        const success = await sendSequenceDay14Checkin(
          admin.email,
          firstName,
          dashboardLink,
          stats.totalCalls,
          stats.avgScore,
          "Building rapport before discussing price" // TODO: Calculate from actual data
        );
        if (success) {
          await markEmailSent(tenant.id, 'day14_checkin');
          emailsSent++;
        }
      }

      // TRIGGER: No calls after 48 hours
      if (hoursSince >= 48 && !await hasEmailBeenSent(tenant.id, 'trigger_no_calls_48h')) {
        const stats = await getTenantCallStats(tenant.id);
        if (stats.totalCalls === 0) {
          const success = await sendTriggerNoCalls48h(admin.email, firstName, dashboardLink);
          if (success) {
            await markEmailSent(tenant.id, 'trigger_no_calls_48h');
            emailsSent++;
          }
        }
      }

      // TRIGGER: Power user (10+ calls in first week)
      if (daysSince >= 7 && daysSince < 8 && !await hasEmailBeenSent(tenant.id, 'trigger_power_user')) {
        const stats = await getTenantCallStats(tenant.id, 7);
        if (stats.totalCalls >= 10) {
          const success = await sendTriggerPowerUser(admin.email, firstName, dashboardLink);
          if (success) {
            await markEmailSent(tenant.id, 'trigger_power_user');
            emailsSent++;
          }
        }
      }

    } catch (error) {
      errors.push(`Error processing tenant ${tenant.id}: ${error}`);
    }
  }

  return {
    processed: activeTenants.length,
    emailsSent,
    errors
  };
}

/**
 * Send welcome email immediately when a new tenant is created
 * Call this from the signup/onboarding flow
 */
export async function sendWelcomeSequenceEmail(tenantId: number): Promise<boolean> {
  const admin = await getTenantAdmin(tenantId);
  if (!admin?.email) return false;

  const baseUrl = process.env.VITE_OAUTH_PORTAL_URL?.replace('/oauth', '') || 'https://www.getgunner.ai';
  const dashboardLink = `${baseUrl}/dashboard`;

  const success = await sendSequenceDay0Welcome(admin.email, dashboardLink);
  if (success) {
    await markEmailSent(tenantId, 'day0_welcome');
  }
  return success;
}
