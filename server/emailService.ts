import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";
import { outreachHistory } from "../drizzle/schema";

// Email templates for different notification types
export type EmailType = 
  | "password_reset"
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
function generateEmailContent(type: EmailType, data: Record<string, string>): { subject: string; body: string } {
  switch (type) {
    case "password_reset":
      return {
        subject: `Password Reset Request for ${data.email}`,
        body: `
A password reset was requested for ${data.email}.

Reset Link: ${data.resetLink}

This link expires in 1 hour.

If you didn't request this, please ignore this email.
        `.trim()
      };
    
    case "team_invite":
      return {
        subject: `${data.inviterName} invited ${data.email} to join ${data.tenantName}`,
        body: `
New team invitation sent!

Invited: ${data.email}
Role: ${data.role}
Company: ${data.tenantName}
Invited by: ${data.inviterName}

Login Link: ${data.loginLink}

The user will be automatically added to your team when they sign in.
        `.trim()
      };
    
    case "welcome":
      return {
        subject: `${data.userName} joined ${data.tenantName}`,
        body: `
New team member joined!

Name: ${data.userName}
Email: ${data.email}
Company: ${data.tenantName}
Role: ${data.role}

They accepted their invitation and are now part of your team.
        `.trim()
      };
    
    // 7-day inactivity - Gentle reminder
    case "churn_7_day":
      return {
        subject: `Re-engagement email sent to ${data.tenantName} (7-day gentle reminder)`,
        body: `
Churn outreach email sent (7-day template)!

Tenant: ${data.tenantName}
Contact: ${data.contactEmail}
Days Inactive: ${data.daysInactive}
Last Activity: ${data.lastActivity}

Message sent:
---
Hi ${data.contactName},

Just checking in! We noticed it's been about a week since your last call in Gunner.

Quick reminder of what you can do:
• Upload recent calls to get instant AI coaching feedback
• Review your team's performance on the leaderboard
• Check out new training materials in the Training section

If you have any questions or need help getting started again, just reply to this email.

Best,
The Gunner Team
---
        `.trim()
      };
    
    // 14-day inactivity - Urgent outreach
    case "churn_14_day":
      return {
        subject: `URGENT: Re-engagement email sent to ${data.tenantName} (14-day follow-up)`,
        body: `
Churn outreach email sent (14-day template)!

Tenant: ${data.tenantName}
Contact: ${data.contactEmail}
Days Inactive: ${data.daysInactive}
Last Activity: ${data.lastActivity}

Message sent:
---
Hi ${data.contactName},

We miss you! It's been two weeks since we've seen any activity from ${data.tenantName} in Gunner.

Is something not working for you? We'd love to help:

• Having trouble with the GHL integration? We can help troubleshoot
• Need custom grading criteria for your team? Let us know
• Want a quick refresher on the platform? We can schedule a call

Your success is our priority. Reply to this email and let's get you back on track.

Best,
The Gunner Team

P.S. - Don't forget, your team's call data is waiting to be analyzed!
---
        `.trim()
      };
    
    // 30-day inactivity - Win-back offer
    case "churn_30_day":
      return {
        subject: `CRITICAL: Re-engagement email sent to ${data.tenantName} (30-day win-back)`,
        body: `
Churn outreach email sent (30-day win-back template)!

Tenant: ${data.tenantName}
Contact: ${data.contactEmail}
Days Inactive: ${data.daysInactive}
Last Activity: ${data.lastActivity}

Message sent:
---
Hi ${data.contactName},

It's been a month since we've heard from you, and we wanted to reach out personally.

We understand that things get busy, and sometimes tools don't fit perfectly into your workflow. But before you go, we'd love one more chance to help.

Here's what we can offer:
• FREE 30-minute strategy call to optimize Gunner for your specific needs
• Custom grading rubrics tailored to your sales process
• Priority support for any technical issues

We've also made several improvements recently:
• Faster call processing
• Enhanced AI coaching insights
• Better team analytics

Would you be open to a quick 15-minute call to discuss how we can better serve your team?

Just reply "YES" and we'll set something up.

Best regards,
The Gunner Team

P.S. - We truly believe Gunner can help your team close more deals. Let us prove it.
---
        `.trim()
      };
    
    default:
      return {
        subject: "Gunner Notification",
        body: JSON.stringify(data, null, 2)
      };
  }
}

/**
 * Send an email notification. Currently uses the owner notification system
 * to alert the platform owner. In production, this would integrate with
 * SendGrid, Postmark, or similar transactional email service.
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const { subject, body } = generateEmailContent(options.type, options.data);
  
  // For now, send as owner notification
  // In production, replace with actual email service
  return notifyOwner({
    title: subject,
    content: body
  });
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
