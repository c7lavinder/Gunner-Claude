import { Resend } from 'resend';
import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";
import { outreachHistory } from "../drizzle/schema";

// Initialize Resend client
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Email sender configuration — configurable via env var
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Gunner <noreply@getgunner.ai>';
const EMAIL_LOGO_URL = process.env.EMAIL_LOGO_URL || 'https://www.getgunner.ai/gunner-logo.png';

// Email templates for different notification types
export type EmailType = 
  | "password_reset"
  | "email_verification"
  | "team_invite"
  | "welcome"
  | "churn_7_day"
  | "churn_14_day"
  | "churn_30_day"
  | "payment_failed"
  | "payment_failed_final"
  | "trial_ending"
  // 14-day email sequence
  | "sequence_day0_welcome"
  | "sequence_day1_checkin"
  | "sequence_day2_trial_ending"
  | "sequence_day3_final_reminder"
  | "sequence_day4_paid_welcome"
  | "sequence_day7_week1_recap"
  | "sequence_day10_feature_spotlight"
  | "sequence_day14_checkin"
  // Engagement triggers
  | "trigger_no_calls_48h"
  | "trigger_power_user";

// Template type for outreach history
export type OutreachTemplateType = "7_day" | "14_day" | "30_day" | "custom";

interface EmailOptions {
  to: string;
  type: EmailType;
  data: Record<string, string>;
}

// Generate email content based on type
function generateEmailContent(type: EmailType, data: Record<string, string>): { subject: string; html: string; text: string } {
  switch (type) {
    case "password_reset":
      return {
        subject: `Reset your Gunner password`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #8B1A1A;">Password Reset Request</h2>
            <p>We received a request to reset your password for <strong>${data.email}</strong>.</p>
            <p style="margin: 24px 0;">
              <a href="${data.resetLink}" style="background-color: #8B1A1A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Reset Password
              </a>
            </p>
            <p style="color: #666; font-size: 14px;">This link expires in 1 hour.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 12px;">© Gunner - AI-Powered Call Coaching</p>
          </div>
        `,
        text: `Password Reset Request\n\nWe received a request to reset your password for ${data.email}.\n\nReset Link: ${data.resetLink}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, please ignore this email.`
      };
    
    case "email_verification":
      return {
        subject: `Verify your email for Gunner`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #8B1A1A;">Welcome to Gunner! 🎯</h2>
            <p>Hi ${data.name},</p>
            <p>Thanks for signing up! Please verify your email address to get started with ${data.companyName}.</p>
            <p style="margin: 24px 0;">
              <a href="${data.verificationLink}" style="background-color: #8B1A1A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Verify Email Address
              </a>
            </p>
            <p style="color: #666; font-size: 14px;">This link expires in 24 hours.</p>
            <p style="color: #666; font-size: 14px;">If you didn't create this account, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 12px;">© Gunner - AI-Powered Call Coaching</p>
          </div>
        `,
        text: `Welcome to Gunner!\n\nHi ${data.name},\n\nThanks for signing up! Please verify your email address.\n\nVerification Link: ${data.verificationLink}\n\nThis link expires in 24 hours.\n\nIf you didn't create this account, please ignore this email.`
      };
    
    case "team_invite":
      return {
        subject: `You've been invited to join ${data.tenantName} on Gunner`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #8B1A1A;">You're Invited to Gunner</h2>
            <p><strong>${data.inviterName}</strong> has invited you to join <strong>${data.tenantName}</strong> on Gunner — AI-powered call coaching for real estate teams.</p>
            <p>Your role: <strong>${data.role}</strong></p>
            <p style="margin: 24px 0;">
              <a href="${data.loginLink}" style="background-color: #8B1A1A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Create Your Account
              </a>
            </p>
            <p style="color: #666; font-size: 14px;">Create an account using this email address (<strong>${data.email}</strong>) or sign in with Google to join the team. Already have an account? <a href="${data.loginLink.replace('/signup', '/login')}" style="color: #8B1A1A;">Sign in here</a>.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 12px;">Gunner - AI-Powered Call Coaching for Real Estate Teams</p>
          </div>
        `,
        text: `You're Invited to Gunner!\n\n${data.inviterName} has invited you to join ${data.tenantName} on Gunner — AI-powered call coaching for real estate teams.\n\nYour role: ${data.role}\n\nCreate your account: ${data.loginLink}\n\nSign up using this email address (${data.email}) or sign in with Google to join the team.\n\nAlready have an account? Sign in at: ${data.loginLink.replace('/signup', '/login')}`
      };
    
    case "welcome":
      return {
        subject: `Welcome to ${data.tenantName}!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #8B1A1A;">Welcome Aboard! 🎯</h2>
            <p>Hi ${data.userName},</p>
            <p>You've successfully joined <strong>${data.tenantName}</strong> on Gunner!</p>
            <p>Your role: <strong>${data.role}</strong></p>
            <p>Start uploading calls to get AI-powered coaching feedback and climb the leaderboard.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 12px;">© Gunner - AI-Powered Call Coaching</p>
          </div>
        `,
        text: `Welcome Aboard!\n\nHi ${data.userName},\n\nYou've successfully joined ${data.tenantName} on Gunner!\n\nYour role: ${data.role}\n\nStart uploading calls to get AI-powered coaching feedback and climb the leaderboard.`
      };
    
    case "payment_failed":
      return {
        subject: `Action Required: Payment failed for ${data.tenantName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #8B1A1A;">⚠️ Payment Failed</h2>
            <p>Hi ${data.userName},</p>
            <p>We were unable to process your payment for <strong>${data.tenantName}</strong>'s Gunner subscription.</p>
            <p><strong>Amount:</strong> ${data.amount}</p>
            <p><strong>Attempt:</strong> ${data.attemptNumber} of 4</p>
            <p>Please update your payment method to avoid service interruption:</p>
            <p style="margin: 24px 0;">
              <a href="${data.billingLink}" style="background-color: #8B1A1A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Update Payment Method
              </a>
            </p>
            <p style="color: #666; font-size: 14px;">We'll automatically retry in a few days. If you have questions, reply to this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 12px;">© Gunner - AI-Powered Call Coaching</p>
          </div>
        `,
        text: `Payment Failed\n\nHi ${data.userName},\n\nWe were unable to process your payment for ${data.tenantName}'s Gunner subscription.\n\nAmount: ${data.amount}\nAttempt: ${data.attemptNumber} of 4\n\nPlease update your payment method: ${data.billingLink}\n\nWe'll automatically retry in a few days.`
      };
    
    case "payment_failed_final":
      return {
        subject: `URGENT: Your ${data.tenantName} subscription has been suspended`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #8B1A1A;">🚨 Subscription Suspended</h2>
            <p>Hi ${data.userName},</p>
            <p>After multiple payment attempts, we've had to suspend your <strong>${data.tenantName}</strong> Gunner subscription.</p>
            <p><strong>What this means:</strong></p>
            <ul>
              <li>Your team can no longer access the dashboard</li>
              <li>Call grading has been paused</li>
              <li>Your data is safe and will be restored when you reactivate</li>
            </ul>
            <p>To restore access immediately:</p>
            <p style="margin: 24px 0;">
              <a href="${data.billingLink}" style="background-color: #8B1A1A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Reactivate Subscription
              </a>
            </p>
            <p style="color: #666; font-size: 14px;">Need help? Reply to this email and we'll assist you.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 12px;">© Gunner - AI-Powered Call Coaching</p>
          </div>
        `,
        text: `Subscription Suspended\n\nHi ${data.userName},\n\nAfter multiple payment attempts, we've had to suspend your ${data.tenantName} Gunner subscription.\n\nYour team can no longer access the dashboard. Your data is safe and will be restored when you reactivate.\n\nReactivate: ${data.billingLink}`
      };
    
    case "trial_ending":
      return {
        subject: `Your Gunner trial ends tomorrow!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #8B1A1A;">⏰ Trial Ending Soon</h2>
            <p>Hi ${data.userName},</p>
            <p>Your 3-day free trial for <strong>${data.tenantName}</strong> ends tomorrow.</p>
            <p><strong>What happens next:</strong></p>
            <ul>
              <li>Your card will be charged ${data.amount} for your ${data.planName} plan</li>
              <li>Your team will continue to have full access</li>
              <li>You can cancel anytime from the Billing settings</li>
            </ul>
            <p>Questions about your subscription? Reply to this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 12px;">© Gunner - AI-Powered Call Coaching</p>
          </div>
        `,
        text: `Trial Ending Soon\n\nHi ${data.userName},\n\nYour 3-day free trial for ${data.tenantName} ends tomorrow.\n\nYour card will be charged ${data.amount} for your ${data.planName} plan. You can cancel anytime from the Billing settings.`
      };
    
    // 14-DAY EMAIL SEQUENCE - Real Estate Wholesaler focused
    case "sequence_day0_welcome":
      return {
        subject: `You're in — let's grade your first call`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
            <div style="text-align: center; padding: 24px 0; border-bottom: 3px solid #8B1A1A;">
              <img src="${EMAIL_LOGO_URL}" alt="Gunner" style="height: 40px;">
            </div>
            <div style="padding: 32px 24px;">
              <h1 style="color: #8B1A1A; font-size: 28px; margin: 0 0 16px;">Welcome to Gunner 🎯</h1>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">You just took the first step toward never missing a coachable moment again.</p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Your 3-day trial is active. Here's how to get value fast:</p>
              <div style="background: #f8f8f8; border-left: 4px solid #8B1A1A; padding: 16px 20px; margin: 24px 0;">
                <p style="margin: 0 0 12px; color: #333;"><strong>Step 1:</strong> Connect your GHL or upload your first acquisition call</p>
                <p style="margin: 0 0 12px; color: #333;"><strong>Step 2:</strong> Watch the AI grade it in real-time</p>
                <p style="margin: 0; color: #333;"><strong>Step 3:</strong> See exactly where your rep built rapport, handled objections, and where they left money on the table</p>
              </div>
              <p style="text-align: center; margin: 32px 0;">
                <a href="${data.dashboardLink}" style="background-color: #8B1A1A; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Grade Your First Call →</a>
              </p>
              <p style="color: #666; font-size: 15px; line-height: 1.6;">Most wholesalers find insights in their very first call that would've taken hours to catch manually — like a missed motivation trigger or a weak anchor price.</p>
              <p style="color: #666; font-size: 15px;">Questions? Just reply to this email.</p>
            </div>
            <div style="background: #f8f8f8; padding: 20px 24px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">© Gunner - AI-Powered Call Coaching for Real Estate Teams</p>
            </div>
          </div>
        `,
        text: `Welcome to Gunner!\n\nYou just took the first step toward never missing a coachable moment again.\n\nYour 3-day trial is active. Here's how to get value fast:\n\nStep 1: Connect your GHL or upload your first acquisition call\nStep 2: Watch the AI grade it in real-time\nStep 3: See exactly where your rep built rapport, handled objections, and where they left money on the table\n\nGrade Your First Call: ${data.dashboardLink}\n\nQuestions? Just reply to this email.`
      };
    
    case "sequence_day1_checkin":
      return {
        subject: `Did you catch it?`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
            <div style="text-align: center; padding: 24px 0; border-bottom: 3px solid #8B1A1A;">
              <img src="${EMAIL_LOGO_URL}" alt="Gunner" style="height: 40px;">
            </div>
            <div style="padding: 32px 24px;">
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Hey ${data.firstName},</p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Quick check — have you graded your first call yet?</p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;"><strong>If yes:</strong> You've already seen something your team missed. That's the point.</p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;"><strong>If not:</strong> It takes 2 minutes. Seriously.</p>
              <p style="text-align: center; margin: 32px 0;">
                <a href="${data.dashboardLink}" style="background-color: #8B1A1A; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Grade a Call Now →</a>
              </p>
              <p style="color: #666; font-size: 15px; line-height: 1.6;">The wholesalers who get the most from Gunner grade at least 5 calls in their first week. That's 5 chances to catch a missed follow-up, a weak close, or a rep who's burning leads.</p>
              <p style="color: #666; font-size: 15px;">Start with one.</p>
            </div>
            <div style="background: #f8f8f8; padding: 20px 24px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">© Gunner - AI-Powered Call Coaching for Real Estate Teams</p>
            </div>
          </div>
        `,
        text: `Hey ${data.firstName},\n\nQuick check — have you graded your first call yet?\n\nIf yes: You've already seen something your team missed. That's the point.\n\nIf not: It takes 2 minutes. Seriously.\n\nGrade a Call Now: ${data.dashboardLink}\n\nThe wholesalers who get the most from Gunner grade at least 5 calls in their first week. Start with one.`
      };
    
    case "sequence_day2_trial_ending":
      return {
        subject: `Your trial ends tomorrow`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
            <div style="text-align: center; padding: 24px 0; border-bottom: 3px solid #8B1A1A;">
              <img src="${EMAIL_LOGO_URL}" alt="Gunner" style="height: 40px;">
            </div>
            <div style="padding: 32px 24px;">
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Hey ${data.firstName},</p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Your Gunner trial ends in <strong>24 hours</strong>.</p>
              <div style="background: #f8f8f8; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <p style="color: #333; font-size: 15px; margin: 0 0 8px;"><strong>📊 Your trial stats:</strong></p>
                <p style="color: #666; font-size: 15px; margin: 0 0 4px;">• Calls graded: <strong>${data.callsGraded}</strong></p>
                <p style="color: #666; font-size: 15px; margin: 0 0 4px;">• Insights flagged: <strong>${data.insightsCount}</strong></p>
                <p style="color: #666; font-size: 15px; margin: 0;">• Coaching moments caught: <strong>${data.coachingMoments}</strong></p>
              </div>
              ${data.callsGraded !== '0' ? `<p style="color: #333; font-size: 16px; line-height: 1.6;">You've already seen what Gunner can do. Imagine that across every acquisition call, every disposition call, every week. No more wondering if your reps are saying the right things to motivated sellers.</p>` : `<p style="color: #333; font-size: 16px; line-height: 1.6;">You haven't graded a call yet — try one before your trial ends. Upload your newest rep's last acquisition call. That's where the gold is.</p><p style="text-align: center; margin: 24px 0;"><a href="${data.dashboardLink}" style="background-color: #8B1A1A; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Grade Your First Call →</a></p>`}
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Your card on file will be charged tomorrow unless you cancel. No hard feelings if it's not the right time — but if your team is making calls to motivated sellers, Gunner should be grading them.</p>
              <p style="text-align: center; margin: 32px 0;">
                <a href="${data.dashboardLink}" style="background-color: #8B1A1A; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Keep My Account Active →</a>
              </p>
            </div>
            <div style="background: #f8f8f8; padding: 20px 24px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">© Gunner - AI-Powered Call Coaching for Real Estate Teams</p>
            </div>
          </div>
        `,
        text: `Hey ${data.firstName},\n\nYour Gunner trial ends in 24 hours.\n\nYour trial stats:\n• Calls graded: ${data.callsGraded}\n• Insights flagged: ${data.insightsCount}\n• Coaching moments caught: ${data.coachingMoments}\n\nYour card on file will be charged tomorrow unless you cancel.\n\nKeep My Account Active: ${data.dashboardLink}`
      };
    
    case "sequence_day3_final_reminder":
      return {
        subject: `Trial ends tonight`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
            <div style="text-align: center; padding: 24px 0; border-bottom: 3px solid #8B1A1A;">
              <img src="${EMAIL_LOGO_URL}" alt="Gunner" style="height: 40px;">
            </div>
            <div style="padding: 32px 24px;">
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Hey ${data.firstName},</p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;"><strong>Last call</strong> — your Gunner trial ends at midnight.</p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">After today:</p>
              <ul style="color: #333; font-size: 16px; line-height: 1.8;">
                <li>Your dashboard stays active (you're a paying customer now)</li>
                <li>All your graded calls and insights are saved</li>
                <li>Your team keeps getting better, automatically</li>
              </ul>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">If you're not ready, you can cancel anytime from your account settings. No hassle.</p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">But if your reps are on the phone with motivated sellers, and you want to know what's actually being said — stay with us.</p>
              <p style="text-align: center; margin: 32px 0;">
                <a href="${data.dashboardLink}" style="background-color: #8B1A1A; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">View My Dashboard →</a>
              </p>
            </div>
            <div style="background: #f8f8f8; padding: 20px 24px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">© Gunner - AI-Powered Call Coaching for Real Estate Teams</p>
            </div>
          </div>
        `,
        text: `Hey ${data.firstName},\n\nLast call — your Gunner trial ends at midnight.\n\nAfter today:\n• Your dashboard stays active\n• All your graded calls and insights are saved\n• Your team keeps getting better, automatically\n\nIf you're not ready, cancel anytime. No hassle.\n\nView My Dashboard: ${data.dashboardLink}`
      };
    
    case "sequence_day4_paid_welcome":
      return {
        subject: `You're officially in 🎯`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
            <div style="text-align: center; padding: 24px 0; border-bottom: 3px solid #8B1A1A;">
              <img src="${EMAIL_LOGO_URL}" alt="Gunner" style="height: 40px;">
            </div>
            <div style="padding: 32px 24px;">
              <h1 style="color: #8B1A1A; font-size: 28px; margin: 0 0 16px;">Welcome to Gunner — for real this time.</h1>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Hey ${data.firstName},</p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Your trial converted, which means you're serious about making your acquisitions team better. We're here for it.</p>
              <div style="background: #f8f8f8; border-left: 4px solid #8B1A1A; padding: 16px 20px; margin: 24px 0;">
                <p style="color: #333; font-size: 15px; margin: 0 0 8px;"><strong>What to do this week:</strong></p>
                <p style="color: #666; font-size: 15px; margin: 0 0 8px;">1. <strong>Grade 5+ calls</strong> — Build the habit, spot the patterns</p>
                <p style="color: #666; font-size: 15px; margin: 0 0 8px;">2. <strong>Invite your team</strong> — Every rep should see their own grades</p>
                <p style="color: #666; font-size: 15px; margin: 0;">3. <strong>Check the dashboard daily</strong> — Watch the trends, not just individual calls</p>
              </div>
              <p style="text-align: center; margin: 32px 0;">
                <a href="${data.dashboardLink}" style="background-color: #8B1A1A; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Go to Dashboard →</a>
              </p>
              <p style="color: #666; font-size: 15px; line-height: 1.6;"><strong>Pro tip:</strong> The best wholesaling teams review calls every morning for 10 minutes. Try it — you'll catch issues before they cost you deals.</p>
            </div>
            <div style="background: #f8f8f8; padding: 20px 24px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">© Gunner - AI-Powered Call Coaching for Real Estate Teams</p>
            </div>
          </div>
        `,
        text: `Welcome to Gunner — for real this time.\n\nHey ${data.firstName},\n\nYour trial converted, which means you're serious about making your acquisitions team better.\n\nWhat to do this week:\n1. Grade 5+ calls — Build the habit, spot the patterns\n2. Invite your team — Every rep should see their own grades\n3. Check the dashboard daily — Watch the trends\n\nGo to Dashboard: ${data.dashboardLink}\n\nPro tip: The best wholesaling teams review calls every morning for 10 minutes.`
      };
    
    case "sequence_day7_week1_recap":
      return {
        subject: `Your first week in Gunner`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
            <div style="text-align: center; padding: 24px 0; border-bottom: 3px solid #8B1A1A;">
              <img src="${EMAIL_LOGO_URL}" alt="Gunner" style="height: 40px;">
            </div>
            <div style="padding: 32px 24px;">
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Hey ${data.firstName},</p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">You've been on Gunner for a week. Here's the snapshot:</p>
              <div style="background: linear-gradient(135deg, #8B1A1A 0%, #6B1515 100%); border-radius: 8px; padding: 24px; margin: 24px 0; color: white;">
                <p style="font-size: 18px; margin: 0 0 16px; font-weight: bold;">📊 Your Week 1 Stats</p>
                <p style="font-size: 15px; margin: 0 0 8px;">Calls graded: <strong>${data.callsGradedWeek1}</strong></p>
                <p style="font-size: 15px; margin: 0 0 8px;">Top insight: <strong>${data.topInsight}</strong></p>
                <p style="font-size: 15px; margin: 0;">Team member with most improvement: <strong>${data.topImprover}</strong></p>
              </div>
              ${parseInt(data.callsGradedWeek1) >= 5 ? `<p style="color: #333; font-size: 16px; line-height: 1.6;">You're using Gunner the right way. Keep it up — the patterns get clearer over time. You'll start seeing which reps consistently miss motivation triggers, who's weak on price anchoring, and who's leaving deals on the table.</p>` : `<p style="color: #333; font-size: 16px; line-height: 1.6;">Looks like call volume was light this week. The more calls you grade, the more patterns you'll see. Try to hit 10 next week — that's when the real insights start showing up.</p>`}
              <div style="background: #f8f8f8; border-left: 4px solid #8B1A1A; padding: 16px 20px; margin: 24px 0;">
                <p style="color: #333; font-size: 15px; margin: 0 0 8px;"><strong>Quick wins for Week 2:</strong></p>
                <p style="color: #666; font-size: 15px; margin: 0 0 8px;">• Set a goal: Grade every acquisition call over 5 minutes</p>
                <p style="color: #666; font-size: 15px; margin: 0 0 8px;">• Review the "Missed Opportunities" — these are deals that slipped</p>
                <p style="color: #666; font-size: 15px; margin: 0;">• Share one graded call with your team for coaching</p>
              </div>
              <p style="text-align: center; margin: 32px 0;">
                <a href="${data.dashboardLink}" style="background-color: #8B1A1A; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">View Full Dashboard →</a>
              </p>
            </div>
            <div style="background: #f8f8f8; padding: 20px 24px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">© Gunner - AI-Powered Call Coaching for Real Estate Teams</p>
            </div>
          </div>
        `,
        text: `Hey ${data.firstName},\n\nYou've been on Gunner for a week. Here's the snapshot:\n\nYour Week 1 Stats:\n• Calls graded: ${data.callsGradedWeek1}\n• Top insight: ${data.topInsight}\n• Top improver: ${data.topImprover}\n\nQuick wins for Week 2:\n• Grade every acquisition call over 5 minutes\n• Review the Missed Opportunities\n• Share one graded call with your team\n\nView Full Dashboard: ${data.dashboardLink}`
      };
    
    case "sequence_day10_feature_spotlight":
      return {
        subject: `Are you using this?`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
            <div style="text-align: center; padding: 24px 0; border-bottom: 3px solid #8B1A1A;">
              <img src="${EMAIL_LOGO_URL}" alt="Gunner" style="height: 40px;">
            </div>
            <div style="padding: 32px 24px;">
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Hey ${data.firstName},</p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Most Gunner users miss this feature at first:</p>
              <div style="background: #f8f8f8; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
                <h2 style="color: #8B1A1A; margin: 0 0 12px;">🎬 Coaching Clips</h2>
                <p style="color: #666; font-size: 15px; margin: 0;">Jump straight to the moments that matter</p>
              </div>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Every time Gunner grades a call, it flags specific moments worth reviewing — objection handling, price anchoring, rapport builders, motivation triggers, red flags.</p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Instead of listening to full 30-minute acquisition calls, you can:</p>
              <ul style="color: #333; font-size: 16px; line-height: 1.8;">
                <li>Jump straight to the 30-second clip that matters</li>
                <li>Share clips with reps for targeted coaching</li>
                <li>Build a library of "how it's done" moments from your best closers</li>
              </ul>
              <p style="text-align: center; margin: 32px 0;">
                <a href="${data.dashboardLink}" style="background-color: #8B1A1A; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Check Your Coaching Clips →</a>
              </p>
              <p style="color: #666; font-size: 15px; line-height: 1.6;">This is where training gets specific. Generic advice doesn't stick. Real examples from real calls with real motivated sellers do.</p>
            </div>
            <div style="background: #f8f8f8; padding: 20px 24px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">© Gunner - AI-Powered Call Coaching for Real Estate Teams</p>
            </div>
          </div>
        `,
        text: `Hey ${data.firstName},\n\nMost Gunner users miss this feature at first:\n\nCoaching Clips\n\nEvery time Gunner grades a call, it flags specific moments worth reviewing — objection handling, price anchoring, rapport builders, red flags.\n\nInstead of listening to full calls, you can:\n• Jump straight to the 30-second clip that matters\n• Share clips with reps for targeted coaching\n• Build a library of "how it's done" moments\n\nCheck Your Coaching Clips: ${data.dashboardLink}`
      };
    
    case "sequence_day14_checkin":
      return {
        subject: `How's it going?`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
            <div style="text-align: center; padding: 24px 0; border-bottom: 3px solid #8B1A1A;">
              <img src="${EMAIL_LOGO_URL}" alt="Gunner" style="height: 40px;">
            </div>
            <div style="padding: 32px 24px;">
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Hey ${data.firstName},</p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">You've been on Gunner for two weeks. Quick gut check:</p>
              <h2 style="color: #8B1A1A; font-size: 22px; margin: 24px 0 16px;">Is your team getting better?</h2>
              <p style="color: #333; font-size: 16px; line-height: 1.6;"><strong>If yes</strong> — keep going. The data compounds. Week 4 is when most teams see noticeable improvement in call quality scores and conversion rates.</p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;"><strong>If not sure</strong> — reply to this email. Tell me what's working and what's not. I read every response and we'll make it right.</p>
              <div style="background: linear-gradient(135deg, #8B1A1A 0%, #6B1515 100%); border-radius: 8px; padding: 24px; margin: 24px 0; color: white;">
                <p style="font-size: 18px; margin: 0 0 16px; font-weight: bold;">📊 Your stats so far</p>
                <p style="font-size: 15px; margin: 0 0 8px;">Total calls graded: <strong>${data.totalCalls}</strong></p>
                <p style="font-size: 15px; margin: 0 0 8px;">Average call score: <strong>${data.avgScore}</strong></p>
                <p style="font-size: 15px; margin: 0;">Most common issue flagged: <strong>${data.commonIssue}</strong></p>
              </div>
              <p style="text-align: center; margin: 32px 0;">
                <a href="${data.dashboardLink}" style="background-color: #8B1A1A; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">View Dashboard →</a>
              </p>
              <p style="color: #666; font-size: 15px; line-height: 1.6;">You're investing in your team. We're here to make sure it pays off in closed deals.</p>
              <p style="color: #666; font-size: 14px; line-height: 1.6; margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee;"><strong>P.S.</strong> If Gunner has helped your team close more deals, we'd love a quick testimonial. Just reply with a sentence or two and we'll feature you (with permission).</p>
            </div>
            <div style="background: #f8f8f8; padding: 20px 24px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">© Gunner - AI-Powered Call Coaching for Real Estate Teams</p>
            </div>
          </div>
        `,
        text: `Hey ${data.firstName},\n\nYou've been on Gunner for two weeks. Quick gut check:\n\nIs your team getting better?\n\nIf yes — keep going. Week 4 is when most teams see noticeable improvement.\n\nIf not sure — reply to this email. I read every response.\n\nYour stats so far:\n• Total calls graded: ${data.totalCalls}\n• Average call score: ${data.avgScore}\n• Most common issue: ${data.commonIssue}\n\nView Dashboard: ${data.dashboardLink}\n\nP.S. If Gunner has helped your team, we'd love a quick testimonial.`
      };
    
    // ENGAGEMENT TRIGGERS
    case "trigger_no_calls_48h":
      return {
        subject: `Need help getting started?`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
            <div style="text-align: center; padding: 24px 0; border-bottom: 3px solid #8B1A1A;">
              <img src="${EMAIL_LOGO_URL}" alt="Gunner" style="height: 40px;">
            </div>
            <div style="padding: 32px 24px;">
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Hey ${data.firstName},</p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Noticed you haven't graded a call yet. Totally normal — sometimes the setup takes a minute.</p>
              <h3 style="color: #8B1A1A; font-size: 18px; margin: 24px 0 16px;">Stuck on something?</h3>
              <ul style="color: #333; font-size: 16px; line-height: 2;">
                <li><strong>Connecting GHL:</strong> It takes 60 seconds — just click Connect CRM in settings</li>
                <li><strong>Uploading manually:</strong> Drag and drop any call recording</li>
                <li><strong>Not sure what to grade first:</strong> Start with your newest rep's last acquisition call. That's where the gold is.</li>
              </ul>
              <p style="text-align: center; margin: 32px 0;">
                <a href="${data.dashboardLink}" style="background-color: #8B1A1A; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Grade Your First Call →</a>
              </p>
              <p style="color: #666; font-size: 15px; line-height: 1.6;">Reply to this email if you're stuck. We'll get you unstuck fast.</p>
            </div>
            <div style="background: #f8f8f8; padding: 20px 24px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">© Gunner - AI-Powered Call Coaching for Real Estate Teams</p>
            </div>
          </div>
        `,
        text: `Hey ${data.firstName},\n\nNoticed you haven't graded a call yet. Totally normal — sometimes the setup takes a minute.\n\nStuck on something?\n• Connecting GHL: It takes 60 seconds\n• Uploading manually: Drag and drop any call recording\n• Not sure what to grade first: Start with your newest rep's last acquisition call\n\nGrade Your First Call: ${data.dashboardLink}\n\nReply to this email if you're stuck. We'll get you unstuck fast.`
      };
    
    case "trigger_power_user":
      return {
        subject: `You're a power user 🚀`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
            <div style="text-align: center; padding: 24px 0; border-bottom: 3px solid #8B1A1A;">
              <img src="${EMAIL_LOGO_URL}" alt="Gunner" style="height: 40px;">
            </div>
            <div style="padding: 32px 24px;">
              <div style="background: linear-gradient(135deg, #8B1A1A 0%, #6B1515 100%); border-radius: 8px; padding: 24px; margin: 0 0 24px; color: white; text-align: center;">
                <p style="font-size: 48px; margin: 0;">🚀</p>
                <h2 style="margin: 12px 0 0; font-size: 24px;">Power User Status Unlocked</h2>
              </div>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">Hey ${data.firstName},</p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;"><strong>10+ calls graded in your first week.</strong> You're in the top 5% of Gunner users.</p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">At this pace, you're going to have serious data on your acquisitions team within a month. Here's how to make the most of it:</p>
              <div style="background: #f8f8f8; border-left: 4px solid #8B1A1A; padding: 16px 20px; margin: 24px 0;">
                <p style="color: #333; font-size: 15px; margin: 0 0 12px;"><strong>1. Compare reps:</strong> Who's improving? Who's stuck? Who's burning leads?</p>
                <p style="color: #333; font-size: 15px; margin: 0 0 12px;"><strong>2. Track over time:</strong> Are scores trending up week over week?</p>
                <p style="color: #333; font-size: 15px; margin: 0;"><strong>3. Share the wins:</strong> When a rep nails a call with a motivated seller, show the team. Recognition drives repetition.</p>
              </div>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">You're building a coaching machine. Keep going.</p>
              <p style="text-align: center; margin: 32px 0;">
                <a href="${data.dashboardLink}" style="background-color: #8B1A1A; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">View Team Leaderboard →</a>
              </p>
            </div>
            <div style="background: #f8f8f8; padding: 20px 24px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">© Gunner - AI-Powered Call Coaching for Real Estate Teams</p>
            </div>
          </div>
        `,
        text: `Hey ${data.firstName},\n\n10+ calls graded in your first week. You're in the top 5% of Gunner users.\n\nAt this pace, you're going to have serious data on your acquisitions team within a month.\n\nHow to make the most of it:\n1. Compare reps: Who's improving? Who's stuck?\n2. Track over time: Are scores trending up?\n3. Share the wins: Recognition drives repetition.\n\nYou're building a coaching machine. Keep going.\n\nView Team Leaderboard: ${data.dashboardLink}`
      };
    
    // Churn emails - these still go to owner as notifications
    case "churn_7_day":
    case "churn_14_day":
    case "churn_30_day":
      return generateChurnEmailContent(type, data);
    
    default:
      return {
        subject: "Gunner Notification",
        html: `<pre>${JSON.stringify(data, null, 2)}</pre>`,
        text: JSON.stringify(data, null, 2)
      };
  }
}

// Generate churn email content (sent to users, notification to owner)
function generateChurnEmailContent(type: EmailType, data: Record<string, string>): { subject: string; html: string; text: string } {
  const templates: Record<string, { subject: string; userSubject: string; body: string }> = {
    churn_7_day: {
      subject: `Re-engagement email sent to ${data.tenantName} (7-day gentle reminder)`,
      userSubject: `We miss you at Gunner! 🎯`,
      body: `Hi ${data.contactName},

Just checking in! We noticed it's been about a week since your last call in Gunner.

Quick reminder of what you can do:
• Upload recent calls to get instant AI coaching feedback
• Review your team's performance on the leaderboard
• Check out new training materials in the Training section

If you have any questions or need help getting started again, just reply to this email.

Best,
The Gunner Team`
    },
    churn_14_day: {
      subject: `URGENT: Re-engagement email sent to ${data.tenantName} (14-day follow-up)`,
      userSubject: `We'd love to help you succeed with Gunner`,
      body: `Hi ${data.contactName},

We miss you! It's been two weeks since we've seen any activity from ${data.tenantName} in Gunner.

Is something not working for you? We'd love to help:

• Having trouble with the GHL integration? We can help troubleshoot
• Need custom grading criteria for your team? Let us know
• Want a quick refresher on the platform? We can schedule a call

Your success is our priority. Reply to this email and let's get you back on track.

Best,
The Gunner Team

P.S. - Don't forget, your team's call data is waiting to be analyzed!`
    },
    churn_30_day: {
      subject: `CRITICAL: Re-engagement email sent to ${data.tenantName} (30-day win-back)`,
      userSubject: `One more chance to help your team win`,
      body: `Hi ${data.contactName},

It's been a month since we've heard from you, and we wanted to reach out personally.

We understand that things get busy, and sometimes tools don't fit perfectly into your workflow. But before you go, we'd love one more chance to help.

Here's what we can offer:
• FREE 30-minute strategy call to optimize Gunner for your specific needs
• Custom grading rubrics tailored to your sales process
• Priority support for any technical issues

Would you be open to a quick 15-minute call to discuss how we can better serve your team?

Just reply "YES" and we'll set something up.

Best regards,
The Gunner Team

P.S. - We truly believe Gunner can help your team close more deals. Let us prove it.`
    }
  };

  const template = templates[type] || templates.churn_7_day;
  
  return {
    subject: template.subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <pre style="white-space: pre-wrap; font-family: Arial, sans-serif;">${template.body}</pre>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="color: #999; font-size: 12px;">© Gunner - AI-Powered Call Coaching</p>
      </div>
    `,
    text: template.body
  };
}

/**
 * Send an email using Resend. Falls back to owner notification if Resend is not configured.
 */
export async function sendEmail(options: EmailOptions & { fromEmail?: string }): Promise<boolean> {
  const { subject, html, text } = generateEmailContent(options.type, options.data);
  
  // ⛔ ALL emails disabled including churn notifications
  // const isChurnEmail = options.type.startsWith('churn_');
  
  // ⛔ ALL EMAIL SENDING DISABLED — Resend client is null, no fallback to owner notifications
  // This prevents flooding the owner's inbox with [EMAIL FAILED] notifications
  console.log(`[EmailService] ⛔ Email sending disabled. Would have sent "${subject}" to ${options.to}`);
  return false;
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  baseUrl: string
): Promise<boolean> {
  const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
  
  return sendEmail({
    to: email,
    type: "password_reset",
    data: {
      email,
      resetLink
    }
  });
}

/**
 * Send email verification email
 */
export async function sendEmailVerificationEmail(
  email: string,
  name: string,
  companyName: string,
  verificationToken: string,
  baseUrl: string
): Promise<boolean> {
  const verificationLink = `${baseUrl}/verify-email?token=${verificationToken}`;
  
  return sendEmail({
    to: email,
    type: "email_verification",
    data: {
      email,
      name,
      companyName,
      verificationLink
    }
  });
}

/**
 * Send team invitation email
 */
export async function sendTeamInviteEmail(
  inviteeEmail: string,
  inviterName: string,
  tenantName: string,
  role: string,
  baseUrl: string
): Promise<boolean> {
  // Link to signup page so new users can create an account
  // Existing users can click "Already have an account? Sign in" on the signup page
  const loginLink = `${baseUrl}/signup`;
  
  return sendEmail({
    to: inviteeEmail,
    type: "team_invite",
    data: {
      email: inviteeEmail,
      inviterName,
      tenantName,
      role,
      loginLink
    }
  });
}

/**
 * Send welcome email when user joins a tenant
 */
export async function sendWelcomeEmail(
  userName: string,
  userEmail: string,
  tenantName: string,
  role: string
): Promise<boolean> {
  return sendEmail({
    to: userEmail,
    type: "welcome",
    data: {
      userName,
      email: userEmail,
      tenantName,
      role
    }
  });
}

/**
 * Determine the appropriate email template based on days inactive
 */
export function getOutreachTemplate(daysInactive: number): { type: EmailType; templateType: OutreachTemplateType } {
  if (daysInactive >= 30) {
    return { type: "churn_30_day", templateType: "30_day" };
  } else if (daysInactive >= 14) {
    return { type: "churn_14_day", templateType: "14_day" };
  } else {
    return { type: "churn_7_day", templateType: "7_day" };
  }
}

/**
 * Record outreach in history
 */
export async function recordOutreachHistory(
  tenantId: number,
  templateType: OutreachTemplateType,
  recipientEmail: string,
  recipientName: string | null,
  daysInactive: number,
  lastActivityDate: Date | null,
  sentByUserId: number | null,
  sentByName: string | null
): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    await db.insert(outreachHistory).values({
      tenantId,
      templateType,
      recipientEmail,
      recipientName,
      daysInactive,
      lastActivityDate,
      sentByUserId,
      sentByName,
    });

    return true;
  } catch (error) {
    console.error("[EmailService] Failed to record outreach history:", error);
    return false;
  }
}

/**
 * Send tiered churn outreach email based on days inactive
 * Automatically selects the appropriate template and records history
 */
export async function sendTieredChurnOutreachEmail(
  tenantId: number,
  tenantName: string,
  contactName: string,
  contactEmail: string,
  daysInactive: number,
  lastActivity: string,
  lastActivityDate: Date | null,
  sentByUserId: number | null,
  sentByName: string | null
): Promise<{ success: boolean; templateUsed: OutreachTemplateType }> {
  const { type, templateType } = getOutreachTemplate(daysInactive);
  
  const success = await sendEmail({
    to: contactEmail,
    type,
    data: {
      tenantName,
      contactName,
      contactEmail,
      daysInactive: daysInactive.toString(),
      lastActivity
    }
  });

  if (success) {
    // Record in outreach history
    await recordOutreachHistory(
      tenantId,
      templateType,
      contactEmail,
      contactName,
      daysInactive,
      lastActivityDate,
      sentByUserId,
      sentByName
    );
  }

  return { success, templateUsed: templateType };
}

/**
 * Legacy function for backwards compatibility
 * Now uses tiered templates
 */
export async function sendChurnOutreachEmail(
  tenantName: string,
  contactName: string,
  contactEmail: string,
  daysInactive: number,
  lastActivity: string
): Promise<boolean> {
  const { type } = getOutreachTemplate(daysInactive);
  
  return sendEmail({
    to: contactEmail,
    type,
    data: {
      tenantName,
      contactName,
      contactEmail,
      daysInactive: daysInactive.toString(),
      lastActivity
    }
  });
}

/**
 * Send payment failed email to tenant admin
 */
export async function sendPaymentFailedEmail(
  email: string,
  userName: string,
  tenantName: string,
  amount: string,
  attemptNumber: number,
  billingLink: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    type: "payment_failed",
    data: {
      userName,
      tenantName,
      amount,
      attemptNumber: attemptNumber.toString(),
      billingLink
    }
  });
}

/**
 * Send final payment failed email (subscription suspended)
 */
export async function sendPaymentFailedFinalEmail(
  email: string,
  userName: string,
  tenantName: string,
  billingLink: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    type: "payment_failed_final",
    data: {
      userName,
      tenantName,
      billingLink
    }
  });
}

/**
 * Send trial ending reminder email
 */
export async function sendTrialEndingEmail(
  email: string,
  userName: string,
  tenantName: string,
  planName: string,
  amount: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    type: "trial_ending",
    data: {
      userName,
      tenantName,
      planName,
      amount
    }
  });
}


// ============================================
// 14-DAY EMAIL SEQUENCE HELPER FUNCTIONS
// ============================================

/**
 * Send Day 0 Welcome email (immediately after signup/trial start)
 */
export async function sendSequenceDay0Welcome(
  email: string,
  dashboardLink: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    type: "sequence_day0_welcome",
    data: { dashboardLink }
  });
}

/**
 * Send Day 1 Check-in email (24 hours after signup)
 */
export async function sendSequenceDay1Checkin(
  email: string,
  firstName: string,
  dashboardLink: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    type: "sequence_day1_checkin",
    data: { firstName, dashboardLink }
  });
}

/**
 * Send Day 2 Trial Ending email (48 hours after signup)
 */
export async function sendSequenceDay2TrialEnding(
  email: string,
  firstName: string,
  dashboardLink: string,
  callsGraded: number,
  insightsCount: number,
  coachingMoments: number
): Promise<boolean> {
  return sendEmail({
    to: email,
    type: "sequence_day2_trial_ending",
    data: {
      firstName,
      dashboardLink,
      callsGraded: callsGraded.toString(),
      insightsCount: insightsCount.toString(),
      coachingMoments: coachingMoments.toString()
    }
  });
}

/**
 * Send Day 3 Final Reminder email (morning of last trial day)
 */
export async function sendSequenceDay3FinalReminder(
  email: string,
  firstName: string,
  dashboardLink: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    type: "sequence_day3_final_reminder",
    data: { firstName, dashboardLink }
  });
}

/**
 * Send Day 4 Paid Welcome email (first day as paying customer)
 */
export async function sendSequenceDay4PaidWelcome(
  email: string,
  firstName: string,
  dashboardLink: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    type: "sequence_day4_paid_welcome",
    data: { firstName, dashboardLink }
  });
}

/**
 * Send Day 7 Week 1 Recap email
 */
export async function sendSequenceDay7Week1Recap(
  email: string,
  firstName: string,
  dashboardLink: string,
  callsGradedWeek1: number,
  topInsight: string,
  topImprover: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    type: "sequence_day7_week1_recap",
    data: {
      firstName,
      dashboardLink,
      callsGradedWeek1: callsGradedWeek1.toString(),
      topInsight: topInsight || "Building your baseline",
      topImprover: topImprover || "Data still collecting"
    }
  });
}

/**
 * Send Day 10 Feature Spotlight email
 */
export async function sendSequenceDay10FeatureSpotlight(
  email: string,
  firstName: string,
  dashboardLink: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    type: "sequence_day10_feature_spotlight",
    data: { firstName, dashboardLink }
  });
}

/**
 * Send Day 14 Two-Week Check-in email
 */
export async function sendSequenceDay14Checkin(
  email: string,
  firstName: string,
  dashboardLink: string,
  totalCalls: number,
  avgScore: number,
  commonIssue: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    type: "sequence_day14_checkin",
    data: {
      firstName,
      dashboardLink,
      totalCalls: totalCalls.toString(),
      avgScore: avgScore.toFixed(1),
      commonIssue: commonIssue || "Still analyzing patterns"
    }
  });
}

/**
 * Send No Calls 48h Trigger email
 */
export async function sendTriggerNoCalls48h(
  email: string,
  firstName: string,
  dashboardLink: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    type: "trigger_no_calls_48h",
    data: { firstName, dashboardLink }
  });
}

/**
 * Send Power User Trigger email (10+ calls in first week)
 */
export async function sendTriggerPowerUser(
  email: string,
  firstName: string,
  dashboardLink: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    type: "trigger_power_user",
    data: { firstName, dashboardLink }
  });
}
