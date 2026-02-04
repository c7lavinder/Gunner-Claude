import { Resend } from 'resend';
import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";
import { outreachHistory } from "../drizzle/schema";

// Initialize Resend client
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Email sender configuration
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Gunner <noreply@getgunner.ai>';

// Email templates for different notification types
export type EmailType = 
  | "password_reset"
  | "email_verification"
  | "team_invite"
  | "welcome"
  | "churn_7_day"
  | "churn_14_day"
  | "churn_30_day";

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
            <h2 style="color: #8B1A1A;">You're Invited! 🎯</h2>
            <p><strong>${data.inviterName}</strong> has invited you to join <strong>${data.tenantName}</strong> on Gunner.</p>
            <p>You'll be joining as: <strong>${data.role}</strong></p>
            <p style="margin: 24px 0;">
              <a href="${data.loginLink}" style="background-color: #8B1A1A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Accept Invitation
              </a>
            </p>
            <p style="color: #666; font-size: 14px;">Sign in with Google or create an account using this email address (${data.email}) to join the team.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 12px;">© Gunner - AI-Powered Call Coaching</p>
          </div>
        `,
        text: `You're Invited!\n\n${data.inviterName} has invited you to join ${data.tenantName} on Gunner.\n\nRole: ${data.role}\n\nLogin Link: ${data.loginLink}\n\nSign in with Google or create an account using this email address (${data.email}) to join the team.`
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
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const { subject, html, text } = generateEmailContent(options.type, options.data);
  
  // Churn emails always notify owner (they're internal notifications about outreach)
  const isChurnEmail = options.type.startsWith('churn_');
  
  if (isChurnEmail) {
    // Notify owner about the outreach
    return notifyOwner({
      title: subject,
      content: text
    });
  }
  
  // For user-facing emails, use Resend if configured
  if (resend) {
    try {
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: options.to,
        subject,
        html,
        text,
      });
      
      if (error) {
        console.error('[EmailService] Resend error:', error);
        // Fall back to owner notification
        return notifyOwner({
          title: `[EMAIL FAILED] ${subject}`,
          content: `Failed to send to: ${options.to}\nError: ${error.message}\n\n${text}`
        });
      }
      
      console.log(`[EmailService] Email sent successfully to ${options.to}`);
      return true;
    } catch (err) {
      console.error('[EmailService] Failed to send email:', err);
      // Fall back to owner notification
      return notifyOwner({
        title: `[EMAIL FAILED] ${subject}`,
        content: `Failed to send to: ${options.to}\nError: ${err}\n\n${text}`
      });
    }
  } else {
    // No Resend configured - notify owner instead
    console.warn('[EmailService] Resend not configured, sending to owner instead');
    return notifyOwner({
      title: `[NO EMAIL SERVICE] ${subject}`,
      content: `Would send to: ${options.to}\n\n${text}`
    });
  }
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
  const loginLink = `${baseUrl}/login`;
  
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
