import { notifyOwner } from "./_core/notification";

// Email templates for different notification types
export type EmailType = 
  | "password_reset"
  | "team_invite"
  | "welcome"
  | "churn_outreach";

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
    
    case "churn_outreach":
      return {
        subject: `Re-engagement email sent to ${data.tenantName}`,
        body: `
Churn outreach email sent!

Tenant: ${data.tenantName}
Contact: ${data.contactEmail}
Days Inactive: ${data.daysInactive}
Last Activity: ${data.lastActivity}

Message sent:
---
Hi ${data.contactName},

We noticed you haven't logged any calls in Gunner recently. Is everything okay?

We'd love to help you get the most out of your AI call grading. Here are some quick wins:

• Upload a few recent calls to see instant AI feedback
• Check out the Training section for role-specific coaching
• Invite your team members to start building your leaderboard

Need help? Just reply to this email and we'll get you sorted.

Best,
The Gunner Team
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
 * Send churn outreach email
 */
export async function sendChurnOutreachEmail(
  tenantName: string,
  contactName: string,
  contactEmail: string,
  daysInactive: number,
  lastActivity: string
): Promise<boolean> {
  return sendEmail({
    to: contactEmail,
    type: "churn_outreach",
    data: {
      tenantName,
      contactName,
      contactEmail,
      daysInactive: daysInactive.toString(),
      lastActivity
    }
  });
}
