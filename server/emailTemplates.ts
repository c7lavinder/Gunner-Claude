/**
 * Email Templates for Gunner's 14-Day Onboarding Sequence
 * 
 * These templates are used with Loops.so transactional email API
 * Each template includes the email content and conditions for sending
 */

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  previewText?: string;
  body: string;
  dayTrigger?: number; // Days since signup to send (for time-based emails)
  eventTrigger?: string; // Event name that triggers this email
  condition?: (user: UserEmailContext) => boolean;
}

export interface UserEmailContext {
  email: string;
  firstName: string;
  userId: string;
  tenantId: string;
  tenantName: string;
  daysSinceSignup: number;
  callsGraded: number;
  isSubscribed: boolean;
  trialEndsAt: Date | null;
  planType: string | null;
}

// Base URL for links in emails — configurable via env var
const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || "https://getgunner.ai";

/**
 * Trial Period Emails (Days 0-3)
 */
export const trialEmails: EmailTemplate[] = [
  {
    id: "day0_welcome",
    name: "Day 0 - Welcome to Gunner",
    subject: "Welcome to Gunner - Let's get you started 🎯",
    previewText: "Your AI sales coach is ready",
    dayTrigger: 0,
    body: `Hey {{firstName}},

Welcome to Gunner! We're thrilled to have you on board.

You've just unlocked the power of AI-driven sales coaching. Here's what you can do right now:

**Upload your first call** - Drop in any sales call recording and watch the magic happen. Our AI will analyze your pitch, identify strengths, and pinpoint areas for improvement.

**Get instant feedback** - No more waiting for your manager's review. Get actionable insights in minutes, not days.

**Track your progress** - See your skills improve over time with detailed performance metrics.

Ready to see what Gunner can do?

[Upload Your First Call](${APP_URL}/dashboard)

Your 3-day trial starts now. Make the most of it!

Questions? Just reply to this email - we read every one.

Cheers,
The Gunner Team`,
  },
  {
    id: "day1_first_call",
    name: "Day 1 - First Call Check-in",
    subject: "Ready to grade your first call?",
    previewText: "It only takes 5 minutes",
    dayTrigger: 1,
    condition: (user) => user.callsGraded === 0,
    body: `Hey {{firstName}},

It's been 24 hours since you signed up for Gunner. How's it going?

If you haven't uploaded your first call yet, now's the perfect time. Here's why:

• **Get instant AI feedback** on your sales technique
• **See exactly where you're crushing it** (and where to improve)
• **Start building your performance history**

[Upload a Call Now](${APP_URL}/dashboard)

**Pro tip:** Even a 5-minute call works great for your first analysis.

Questions? Just reply to this email.

The Gunner Team`,
  },
  {
    id: "day2_trial_reminder",
    name: "Day 2 - Trial Ending Tomorrow",
    subject: "Your trial ends tomorrow - here's what you'll miss",
    previewText: "Don't lose access to your AI coach",
    dayTrigger: 2,
    body: `Hey {{firstName}},

Quick heads up - your Gunner trial ends tomorrow.

{{#if callsGraded > 0}}
You've already graded {{callsGraded}} call(s) and seen the power of AI coaching. Imagine having that insight for every single call you make.
{{else}}
You haven't tried grading a call yet - and you're about to miss out on seeing what Gunner can really do.
{{/if}}

**What happens when your trial ends:**
• No more AI call analysis
• No more instant feedback
• No more performance tracking

**What you get when you subscribe:**
• Unlimited call grading
• Detailed coaching insights
• Progress tracking over time
• Priority support

[Upgrade Now - Keep Your AI Coach](${APP_URL}/settings/billing)

Not ready? No worries - but at least try grading one call before your trial ends. You might be surprised.

The Gunner Team`,
  },
  {
    id: "day3_final_reminder",
    name: "Day 3 - Final Trial Day",
    subject: "Last chance: Your trial ends today",
    previewText: "This is it - don't lose your progress",
    dayTrigger: 3,
    body: `Hey {{firstName}},

This is it - your Gunner trial ends today.

{{#if callsGraded > 0}}
You've graded {{callsGraded}} call(s) so far. That data, those insights, your progress - it's all waiting for you to continue building on.
{{else}}
You still have a few hours to try Gunner. One call. That's all it takes to see why sales teams are switching to AI coaching.
{{/if}}

**Upgrade now and get:**
✓ Unlimited call grading
✓ AI-powered coaching insights
✓ Performance tracking
✓ Team analytics (Pro plan)

[Upgrade Before It's Too Late](${APP_URL}/settings/billing)

After today, you'll lose access. But you can always come back - we'll be here when you're ready.

The Gunner Team`,
  },
];

/**
 * Post-Conversion Emails (Days 4-14)
 */
export const postConversionEmails: EmailTemplate[] = [
  {
    id: "day4_welcome_paid",
    name: "Day 4 - Welcome to the Team",
    subject: "You're in! Here's how to get the most out of Gunner",
    previewText: "Your AI coach is ready to work",
    eventTrigger: "user_converted",
    body: `Hey {{firstName}},

Welcome to the Gunner family! 🎉

You've made a great decision. Now let's make sure you get maximum value from your subscription.

**Here's your game plan for the first week:**

1. **Grade at least 3 calls** - The more data, the better your insights
2. **Review your Coaching Clips** - These are the key moments that matter
3. **Check your Dashboard** - Watch your metrics improve in real-time

**Quick tip:** The best salespeople grade every call. Make it a habit.

[Go to Your Dashboard](${APP_URL}/dashboard)

Need help? Reply to this email or check out our [Help Center](${APP_URL}/help).

Let's crush it together,
The Gunner Team`,
  },
  {
    id: "day7_week_recap",
    name: "Day 7 - Week 1 Recap",
    subject: "Your first week with Gunner - here's how you did",
    previewText: "Your weekly performance summary",
    dayTrigger: 7,
    condition: (user) => user.isSubscribed,
    body: `Hey {{firstName}},

You've been using Gunner for a week now. Here's your progress:

📊 **Your Week 1 Stats:**
• Calls graded: {{callsGraded}}
• Time invested in improvement: Priceless

{{#if callsGraded >= 5}}
**Amazing work!** You're in the top 20% of Gunner users. Keep that momentum going.
{{else if callsGraded >= 1}}
**Good start!** Try to grade a few more calls this week to see bigger improvements.
{{else}}
**Let's get started!** Grade your first call today and see what Gunner can do for you.
{{/if}}

**This week's focus:** Pay attention to your Coaching Clips. These highlight the exact moments where you can improve.

[View Your Dashboard](${APP_URL}/dashboard)

Here's to an even better Week 2!

The Gunner Team`,
  },
  {
    id: "day10_feature_spotlight",
    name: "Day 10 - Feature Spotlight: Coaching Clips",
    subject: "Are you using this powerful feature?",
    previewText: "Most users miss this game-changer",
    dayTrigger: 10,
    condition: (user) => user.isSubscribed,
    body: `Hey {{firstName}},

Quick question: Are you using Coaching Clips?

If not, you're missing out on one of Gunner's most powerful features.

**What are Coaching Clips?**
They're AI-identified moments from your calls that show exactly where you can improve. Think of them as your personal highlight reel - but for learning.

**How to use them:**
1. After grading a call, scroll to the Coaching Clips section
2. Watch each clip (they're usually 30-60 seconds)
3. Read the AI's feedback on what to do differently
4. Practice the improved approach on your next call

**Pro tip:** Review your clips before important calls. It's like having a coach in your pocket.

[Check Your Coaching Clips](${APP_URL}/dashboard)

The Gunner Team`,
  },
  {
    id: "day14_two_week_checkin",
    name: "Day 14 - Two Week Check-in",
    subject: "Two weeks in - how's Gunner working for you?",
    previewText: "We'd love your feedback",
    dayTrigger: 14,
    condition: (user) => user.isSubscribed,
    body: `Hey {{firstName}},

You've been using Gunner for two weeks now. We'd love to hear how it's going!

**Quick questions:**
• Is Gunner helping you improve your sales calls?
• What feature do you use most?
• What would make Gunner even better for you?

Just reply to this email with your thoughts - we read every response and use your feedback to make Gunner better.

{{#if callsGraded >= 10}}
**By the way:** You've graded {{callsGraded}} calls! That's awesome dedication. You're definitely seeing results.
{{/if}}

Thanks for being part of the Gunner community.

The Gunner Team

P.S. If you're loving Gunner, we'd be grateful if you'd share it with a colleague who could benefit. [Share Gunner](${APP_URL}?ref={{userId}})`,
  },
];

/**
 * Engagement Trigger Emails
 */
export const engagementEmails: EmailTemplate[] = [
  {
    id: "no_calls_48h",
    name: "No Calls After 48 Hours",
    subject: "Your AI coach is waiting...",
    previewText: "Grade your first call in 2 minutes",
    eventTrigger: "no_calls_48h",
    body: `Hey {{firstName}},

We noticed you haven't graded a call yet. No worries - we get it, life gets busy.

But here's the thing: **Gunner only works if you use it.**

The good news? It takes less than 2 minutes to upload and grade your first call. Here's how:

1. Click the button below
2. Upload any sales call recording (MP3, WAV, or paste a URL)
3. Watch the AI work its magic

That's it. No complicated setup. No learning curve.

[Grade Your First Call](${APP_URL}/dashboard)

**Don't have a recording handy?** Record your next call and upload it right after. Future you will thank present you.

The Gunner Team`,
  },
  {
    id: "power_user",
    name: "Power User Recognition",
    subject: "You're crushing it! 🔥",
    previewText: "10+ calls in your first week - impressive",
    eventTrigger: "power_user",
    body: `Hey {{firstName}},

WOW. {{callCount}} calls graded in your first week?

You're officially a Gunner power user. 💪

This kind of dedication is exactly what separates good salespeople from great ones. You're not just going through the motions - you're actively investing in your improvement.

**Here's what we've noticed about power users like you:**
• They see measurable improvement within 30 days
• They close more deals (on average 15% more)
• They get promoted faster

Keep up the amazing work. You're on the path to sales greatness.

**Quick tip:** Share your progress with your team. A little friendly competition never hurt anyone. 😉

[View Your Stats](${APP_URL}/dashboard)

The Gunner Team`,
  },
  {
    id: "trial_ending_soon",
    name: "Trial Ending Soon",
    subject: "24 hours left on your trial",
    previewText: "Don't lose access to your AI coach",
    eventTrigger: "trial_ending_soon",
    body: `Hey {{firstName}},

Just a heads up - your Gunner trial ends in 24 hours.

{{#if callsGraded > 0}}
You've already seen what Gunner can do. Don't lose access to your AI coach now.
{{else}}
You still have time to try it out! Grade one call before your trial ends.
{{/if}}

[Upgrade Now](${APP_URL}/settings/billing)

Questions about pricing? Just reply to this email.

The Gunner Team`,
  },
  {
    id: "subscription_cancelled",
    name: "Subscription Cancelled",
    subject: "We're sorry to see you go",
    previewText: "Your feedback would mean a lot",
    eventTrigger: "subscription_cancelled",
    body: `Hey {{firstName}},

We're sad to see you go, but we understand.

Your Gunner subscription has been cancelled. You'll have access until the end of your current billing period.

**Quick favor?** Could you tell us why you're leaving? Your feedback helps us improve:

• Was it the price?
• Missing features you needed?
• Not seeing enough value?
• Something else?

Just reply to this email - we read every response.

If you ever want to come back, we'll be here. Your data will be saved for 30 days.

Thanks for giving Gunner a try.

The Gunner Team`,
  },
];

/**
 * Get all email templates
 */
export function getAllTemplates(): EmailTemplate[] {
  return [...trialEmails, ...postConversionEmails, ...engagementEmails];
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): EmailTemplate | undefined {
  return getAllTemplates().find(t => t.id === id);
}

/**
 * Get templates that should be sent on a specific day
 */
export function getTemplatesForDay(day: number): EmailTemplate[] {
  return getAllTemplates().filter(t => t.dayTrigger === day);
}

/**
 * Get templates triggered by a specific event
 */
export function getTemplatesForEvent(eventName: string): EmailTemplate[] {
  return getAllTemplates().filter(t => t.eventTrigger === eventName);
}
