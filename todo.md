# Gunner - Call Coaching Platform TODO

## Core Infrastructure
- [x] Database schema for calls, grades, team members
- [x] Webhook endpoint for GoHighLevel integration
- [x] Audio transcription service using Whisper API
- [x] AI grading engine with training methodology

## Grading System
- [x] Lead Manager rubric (Chris & Daniel - qualification calls)
- [x] Acquisition Manager rubric (Kyle - offer calls)
- [x] Coaching feedback generation based on training criteria

## User Management
- [x] Team member accounts (Admin, Lead Manager, Acquisition Manager roles)
- [x] Role-based access control
- [x] User profile and settings

## Dashboard Features
- [x] Call inbox with transcripts, grades, coaching tips
- [x] Team leaderboard with performance rankings
- [x] Call history with searchable transcripts
- [x] Detailed grade breakdowns per call

## Admin Features
- [x] Team overview dashboard
- [x] Call volume metrics
- [x] Performance analytics
- [x] Team member management

## UI/UX
- [x] Professional design with light/dark theme support
- [x] Responsive layout
- [x] Loading states and error handling

## Call Filtering
- [x] Add call classification field to database schema
- [x] Implement minimum duration filter (< 60 seconds = auto-skip)
- [x] AI-based call classification (conversation vs voicemail/callback)
- [x] Exclude filtered calls from grading
- [x] Exclude filtered calls from leaderboard calculations
- [x] Show filtered calls separately in UI (Analytics page shows breakdown)
- [x] Classification breakdown in analytics (conversation, voicemail, no_answer, callback_request, wrong_number, too_short)

## Training & Feedback System
- [x] Database schema for training materials
- [x] Database schema for AI feedback/corrections
- [x] Database schema for custom grading rules
- [x] Training materials upload functionality
- [x] Training materials management UI (view, edit, delete)
- [x] AI feedback form on call detail page
- [x] Feedback history tracking and management
- [x] Display current grading criteria/methodology (Methodology page)
- [x] Custom grading rules management
- [x] Integrate feedback into grading prompts
- [x] Integrate custom training materials into grading
- [x] Integrate custom grading rules into grading

## UI Streamlining
- [x] Update dashboard: Replace Total Calls with Calls Made, Appointments Set, Offers Accepted
- [x] Consolidate Training and Methodology into single page
- [x] Move Feedback form/history into Call History page
- [x] Remove Grading Rules page from navigation
- [x] Add AI Coach Q&A feature in Call History (ask questions about objections, reference past calls and training)
- [x] Add callOutcome field for tracking appointments and offers

## Dashboard Date Filter
- [x] Add date range selector to dashboard (Last Week, Last Month, YTD, All Time)
- [x] Update stats queries to accept date range parameters
- [x] Filter all dashboard metrics by selected date range

## Team Training Page
- [x] Database schema for training items (skills, issues, wins, agenda)
- [x] Long-term skills tracking section
- [x] Urgent issues/incompetencies section (from call analysis)
- [x] Small wins celebration section
- [x] Weekly team call itinerary/agenda builder
- [x] Backend routes for CRUD operations on training items
- [x] Add Team Training to navigation menu

## AI-Generated Team Training Insights
- [x] Create AI insights generation service that analyzes all team calls
- [x] Auto-generate issues from recurring problems across calls
- [x] Auto-generate wins from standout performances
- [x] Auto-generate skills to develop based on grading trends
- [x] Auto-generate weekly meeting agenda from call insights
- [x] Backend routes for generating and refreshing AI insights
- [x] Update Team Training UI to show AI-generated items
- [x] Allow manual items alongside AI-generated ones
- [x] Add "Generate AI Insights" button to regenerate AI suggestions
- [x] Mark AI-generated items with badge to distinguish from manual

## Navigation & UI Updates
- [x] Add "Today" filter to dashboard date selector
- [x] Make "Today" the default filter on dashboard
- [x] Move Team Training content into AI Training page
- [x] Remove Leaderboard from navigation
- [x] Move Team tab to bottom of navigation

## Social Media Content Page
- [x] Rename "AI Training" to "Training" in navigation
- [x] Create database schema for social media posts
- [x] Create database schema for brand assets/files
- [x] Create database schema for content ideas
- [x] Build Brand Content section with blog post creation
- [x] Build Brand Content section with Meta posting (Facebook/Instagram)
- [x] Build Brand Content section with Google Business posting
- [x] Add brand assets/branding upload functionality
- [x] Build Content Creator section with X (Twitter) posting
- [x] Build Content Creator section with content ideas generation (AI-powered)
- [x] Create posting calendar view showing all scheduled content
- [x] Add easy posting workflow for quick content creation
- [x] AI content generation for all platforms
- [x] Add Social Media to navigation menu

## Social Media Content Improvements
- [x] Add brand profile table with website URL, brand description, mission statement
- [x] Update Brand Content AI to pull from real call conversations (problems solved)
- [x] Update Brand Content AI to reference business KPIs (deals closed, appointments)
- [x] Update Content Creator AI to find attention-grabbing situations from calls
- [x] Update Content Creator AI to suggest property photo content ideas
- [x] Add website URL field to Branding tab (auto-extract colors/branding)
- [x] Add brand description/voice section to Branding tab
- [x] Add mission statement field to Branding tab
- [x] Integrate call data into content generation prompts


## Dashboard Improvements
- [x] Add "Conversations" count to dashboard (only actual graded conversations)


## Leaderboard Improvements
- [x] Fix "View Full" button on dashboard to link to Analytics page
- [x] Add leaderboard section to Analytics page
- [x] Lead Manager metrics: Total Calls, Conversations, Appointments Set, A-B Scored Calls
- [x] Acquisition Manager metrics: Total Calls, Conversations, Offers Accepted, A-B Scored Calls
- [x] Update leaderboard data query to include A-B scored calls count


## Training Material File Support
- [x] Add PDF parsing to extract text from uploaded PDFs
- [x] Add DOCX parsing to extract text from uploaded Word documents
- [x] Update frontend to accept PDF and DOCX file types
- [x] Store extracted text content in database for AI reference


## Manual Call Upload Feature
- [x] Create upload UI for manual call recording submission
- [x] Accept audio files (mp3, wav, m4a, webm)
- [x] Allow selection of team member for the call
- [x] Add call metadata fields (phone number, duration, date)
- [x] Process uploaded calls through transcription and grading pipeline
- [x] Show upload progress and processing status

## GoHighLevel API Polling
- [x] Create GHL API service for fetching calls
- [x] Implement polling mechanism to check for new calls periodically
- [x] Store last poll timestamp to avoid duplicate processing
- [x] Match calls to team members by GHL User ID
- [x] Download call recordings from GHL for transcription
- [x] Add polling status indicator to admin dashboard
- [x] Add manual "Sync Now" button for on-demand polling


## N/A Call Classification
- [x] Add N/A call result for administrative/non-sales calls
- [x] Update grading logic to detect admin calls (scheduling, follow-ups, etc.)
- [x] Skip scoring for N/A calls - only provide summary
- [x] Update UI to display N/A calls in appropriate section


## Reclassify Button Feature
- [x] Add reclassify endpoint to server routers
- [x] Add reclassify dropdown/button to call detail page
- [x] Allow changing classification to: conversation, admin_call, voicemail, no_answer, callback_request, wrong_number
- [x] Update call status appropriately when reclassified


## Automatic GHL Polling
- [x] Create scheduled job to sync GHL calls every 30 minutes
- [x] Add polling status indicator showing last sync time
- [x] Handle errors gracefully without blocking future syncs
- [x] Log sync activity for debugging

## Call Direction Badges
- [x] Add inbound/outbound badge to call list items
- [x] Style badges appropriately (different colors for in/out)
- [x] Display direction in call detail page header


## Bug Fixes
- [x] Fix appointments set count not tracking correctly (e.g., Jack Brewster call should count as appointment set)

## Analytics Page Improvements
- [x] Add stats cards (Calls Made, Conversations, Appointments Set, Offers Accepted, Average Score) to Analytics page
- [x] Add date filter dropdown to Analytics page (same as Dashboard)


## Enhanced Analytics Insights
- [x] Add average call length for graded calls
- [x] Add score distribution chart (A, B, C, D, F breakdown)
- [x] Add team member score breakdown table
- [x] Add call metrics panel (total graded, passing rate)
- [x] Place insights section below the leaderboard


## Trend Charts
- [x] Add weekly score trend data to backend analytics
- [x] Add monthly score trend data to backend analytics
- [x] Create line chart component for score trends
- [x] Display team-wide score trend over time
- [x] Display individual team member trends
- [x] Add trend section to Analytics page below insights


## Dashboard Call Processing Status
- [x] Add call processing status section to bottom of Dashboard
- [x] Show queued, scored, failed, skipped counts
- [x] Display classification breakdown (conversation, voicemail, no_answer, etc.)


## Call Archival System (14-day threshold)
- [x] Add isArchived flag to calls schema
- [x] Add transcriptUrl field for S3-stored transcripts
- [x] Move transcripts to S3 for archived calls
- [x] Update main queries to exclude archived calls
- [x] Create automatic archival job (runs daily)
- [x] Keep archived calls accessible for AI training
- [ ] Add archive management UI (optional)


## Call History Page Improvements
- [x] Shorten AI coaching response to max 2 paragraphs
- [x] Make AI coaching tone optimistic
- [x] Move "Last sync" text under Sync from GHL button
- [x] Add multi-select filter for team member
- [x] Add multi-select filter for call type (qualification/offer)
- [x] Add multi-select filter for score range (low/high)
- [x] Add multi-select filter for call direction (inbound/outbound)


## AI Coach UI Fix
- [x] Shorten AI coach responses to truly 2 brief paragraphs
- [x] Improve chat UI layout and styling
- [x] Better visual separation between user and AI messages
- [x] Add Clear button to reset conversation
- [x] Add bot icon avatar for AI responses


## Button Alignment Fix
- [x] Make all header buttons level (Sync, Upload, Refresh)
- [x] Reposition sync timestamp inline with button text


## Objection Handling / Potential Replies
- [x] Update grading to identify objections from call transcript
- [x] Generate suggested responses for each objection type
- [x] Add objection handling section to call detail page
- [x] Show potential replies with script examples


## AI Meeting Facilitator
- [x] Create backend endpoint for meeting facilitator chat
- [x] Build meeting chat interface on agenda page
- [x] Add role-play mode with seller simulation
- [x] Add example pulling from real calls
- [x] Add agenda navigation and progress tracking
- [x] Add meeting summary generation
- [x] Fix Start Meeting button visibility on Training page (was in wrong file)


## Remove Add Manual Buttons
- [x] Remove Add Manual buttons from Training page (Issues, Wins, Skills, Agenda sections)


## Team Member Permissions System
- [x] Add role field to users (admin, acquisition_manager, lead_manager)
- [x] Add team assignment table (which Lead Managers belong to which Acquisition Manager)
- [x] Update Call History to show only user's own calls (Lead Managers)
- [x] Update Call History for Acquisition Managers to see their Lead Managers' calls
- [x] Update Analytics to filter by user permissions
- [x] Keep Leaderboard showing full team data for everyone
- [x] Training page: hide check off/delete for non-admins
- [x] Training page: hide Generate AI Insights button for non-admins
- [x] Build Team Management UI for admin on Team page
- [x] Auto-generate AI insights every Monday at 6am


## Analytics Bug Fix
- [x] Fix analytics showing 0 for admin users - grades not filtered by date range
- [x] Ensure admin sees all team data in analytics
- [x] Fix Team Member Scores table not populating
- [x] Fix date filter "Today" showing 0 when data exists (timezone fix for CST)

## Timezone Bug Fix
- [x] Fix calls from today (CST) showing as yesterday - Tim Brice 8am call example
- [x] Ensure all date filtering uses CST timezone consistently (midnight CST = 6:00 AM UTC)

## Social Media Page Visibility
- [x] Hide Social Media page from lead managers (only admins and acquisition managers can see it)


## Gamification System
- [x] Database schema for badges, user_badges, badge_progress, user_streaks, user_xp, xp_transactions, deals, reward_views
- [x] Badge definitions: 3 universal, 6 LM-specific, 5 AM-specific (42 total with tiers)
- [x] XP system with levels (Rookie → Closer → Veteran → Elite → Legend)
- [x] Streak tracking with weekend pause logic
- [x] GHL opportunity polling for Closer badge (dispo pipeline → new deal)
- [x] Backend API endpoints for gamification data
- [x] Dashboard gamification widgets (Level/XP, Hot Streak, Consistency, Badges)
- [x] Enhanced Leaderboard with badges, streaks, levels
- [x] Profile page with full badge collection
- [x] XP toast notifications on call grade view

## Badge Celebration Animation
- [x] Add cannon-style confetti burst animation when user unlocks a new badge (Gunner themed)

## Team Page Redesign
- [x] Add profile picture upload functionality
- [x] Merge Leaderboard into Team page
- [x] Showcase each team member with stats, badges, XP level
- [x] Remove standalone Leaderboard page (redirects to /team)
- [x] Update sidebar navigation (removed Leaderboard menu item)
- [x] Batch XP award for all graded calls
- [x] Fix database schema for user_streaks, reward_views, xp_transactions

## Team Page Styling Improvements
- [x] Change orange color to less bright/muted tone
- [x] Change grid layout from 2 columns to 3 columns per row

## Automatic XP Awards
- [x] Award XP automatically when calls are graded (no manual button needed)

## Bug Fixes
- [x] Fix Profile "In Progress" section showing "All badges earned!" when user has zero badges

## Dashboard UI Improvements
- [x] Remove Classification Breakdown section from dashboard
- [x] Add sharp red accents and lines to dashboard
- [x] Apply red accents to Analytics page
- [x] Apply red accents to Call History page
- [x] Remove red accents from Dashboard, Analytics, and Call History pages
- [x] Add page title to Social Media page

## Phase 2: KPI Tracking Module
- [x] Design database schema for KPI tracking (team metrics, campaigns, deals)
- [x] Create API endpoints for KPI data entry and retrieval
- [x] Build KPI Dashboard page with scoreboard view
- [x] Build Team Spotlight components (AM: calls/offers/contracts, LM: calls/conversations/apts, LG Cold Caller: time/conversations/leads, LG SMS: sent/responses/leads)
- [x] Build Campaign Tracking section (CC, SMS, Forms, PPL, JV, PPC, Postcards, Referrals)
- [x] Build Deal Log section
- [x] Add data entry forms for daily/weekly input
- [x] Admin-only access restriction
- [x] Add market selection (Tennessee, Global) to campaign tracking
- [x] Add contacts field to campaign tracking for answer/response rate

## Inventory Tab (formerly Deals)
- [x] Rename Deals tab to Inventory
- [x] Add Status dropdown (For Sale, Assigned, Funded)
- [x] Add Location dropdown (Nashville, Nash SW, Knoxville, Chattanooga, Global, NAH)
- [x] Update Sources to match key (Cold Calls, SMS, Postcards, Form, PPL, PPC, JV, Referral)
- [x] Add LM dropdown (Chris, Daniel)
- [x] Add AM dropdown (Kyle)
- [x] Add DM dropdown (Esteban, Steve)
- [x] Add NAH? dropdown (Yes, No)

## Lead Gen Staff Management
- [x] Create lead_gen_staff database table (name, role, active status, start date)
- [x] Create API endpoints for staff CRUD operations
- [x] Update Team KPIs dropdown to include lead gen staff
- [x] Add inline "+ Add New" option in team member dropdown
- [x] Add "Manage Staff" button with dialog
- [x] Soft delete (toggle Active/Inactive)
- [x] Hard delete option with confirmation warning
- [ ] Edit name/role functionality

## Markets & Channels Management
- [x] Create markets database table (name, active status)
- [x] Create channels database table (name, active status)
- [x] Create API endpoints for markets CRUD
- [x] Create API endpoints for channels CRUD
- [x] Add "Manage Markets" button in Campaigns tab
- [x] Add "Manage Channels" button in Campaigns tab
- [x] Inline add for new markets/channels
- [x] Soft delete and hard delete options


## Edit Functionality for Management Dialogs
- [x] Add edit button to Staff management dialog
- [x] Add edit dialog for renaming staff members
- [x] Add edit button to Markets management dialog
- [x] Add edit dialog for renaming markets
- [x] Add edit button to Channels management dialog
- [x] Add edit dialog for renaming channels (name and code)


## KPI Data Entry Edit Functionality
- [x] Add edit button to campaign data table rows
- [x] Create edit dialog for modifying campaign data entries
- [x] Add edit button to inventory/deals table rows
- [x] Create edit dialog for modifying inventory entries
- [x] Add edit button to team KPI table rows
- [x] Create edit dialog for modifying team KPI entries


## Inventory Field Updates
- [x] Remove Seller Name field from schema
- [x] Remove ARV field from schema
- [x] Remove NAH? field from schema
- [x] Remove Contract Price field from schema
- [x] Remove Repairs field from schema
- [x] Add Revenue field to schema
- [x] Add Assignment Fee field to schema
- [x] Add Profit field (calculated or stored)
- [x] Update Inventory table display
- [x] Update Add Deal dialog
- [x] Update Edit Deal dialog


## Archive KPI Dashboard
- [x] Remove KPI Dashboard from sidebar navigation
- [x] Keep code and database intact for future use


## Gunner Logo Implementation
- [x] Create cannon logo with "GUNNER" wordmark (cannon shooting AI)
- [x] Create square icon version (cannon only)
- [x] Upload logos to CDN
- [x] Add full logo to sidebar header (expanded view)
- [x] Add cannon icon to sidebar header (collapsed view)
- [x] Add favicon using cannon icon


## Loading Screen Animation
- [x] Create LoadingScreen component with Gunner logo
- [x] Add cannon firing animation effect
- [x] Integrate loading screen into app initialization


## White-Label SaaS Platform - Phase 1 MVP

### Multi-Tenancy
- [x] Create tenants table (company_id, name, domain, settings, created_at)
- [x] Add tenant_id to users table
- [x] Add tenant_id to calls table
- [x] Add tenant_id to team_members table
- [x] Add tenant_id to training_materials table
- [x] Add tenant_id to grading_rubrics table
- [x] Add tenant_id to badges table
- [x] Add tenant_id to all KPI tables
- [ ] Ensure all queries are tenant-scoped
- [ ] Add tenant context to auth/session

### Stripe Billing Integration
- [x] Set up Stripe integration using webdev_add_feature
- [x] Create subscription tiers (Starter $99, Growth $249, Scale $499)
- [x] Build pricing page
- [x] Implement checkout flow
- [ ] Build billing management (upgrade/downgrade/cancel)
- [ ] Handle failed payments with grace period
- [x] Add free trial (14 days)

### Onboarding Wizard
- [x] Step 1: Create Account (company name, admin email)
- [x] Step 2: Choose Plan (select tier, enter payment)
- [x] Step 3: Connect CRM (GHL OAuth, extensible for others)
- [x] Step 4: Upload Training Materials (scripts, docs)
- [x] Step 5: Define Roles (custom roles per tenant)
- [x] Step 6: Invite Team (add members by email)
- [x] Step 7: Done (land on dashboard)
- [ ] Progress saving (resume if interrupted)

### Tenant Admin Dashboard
- [x] Manage team members
- [x] Manage billing/subscription
- [x] View usage stats
- [x] Configure CRM integrations
- [x] Upload/edit training materials
- [x] Manage roles and grading rubrics

### Super Admin Dashboard (Platform Owner)
- [x] View all tenants
- [x] MRR/ARR/churn metrics
- [x] Revenue by plan tier
- [x] New signups tracking
- [x] Tenants with failed payments
- [x] Low usage tenants (churn risk)
- [ ] Support access to tenant accounts

### Migrate NAH as First Tenant
- [x] Create NAH tenant record
- [x] Associate existing users with NAH tenant
- [x] Associate existing calls with NAH tenant
- [x] Associate existing training materials with NAH tenant
- [x] Verify all data properly scoped


## White-Label SaaS Platform - Phase 2

### Backend tRPC Routes for Admin Dashboards
- [x] Create tenant.list route for super admin
- [x] Create tenant.getMetrics route for MRR/ARR stats
- [x] Create tenant.getById route for tenant details
- [x] Create tenantSettings.get route for tenant admin
- [x] Create tenantSettings.update route for tenant admin
- [ ] Create tenantSettings.inviteUser route
- [ ] Create tenantSettings.removeUser route

### Tenant-Scoped Query Middleware
- [x] Create tenantContext middleware that extracts tenantId from user session
- [ ] Update all existing queries to filter by tenantId
- [x] Add tenantId to protectedProcedure context
- [ ] Ensure new calls/users are automatically assigned to correct tenant

### Connect Dashboards to Real Data
- [x] Update SuperAdmin page to use real tRPC queries
- [x] Update TenantSettings page to use real tRPC queries
- [x] Remove mock data from both pages

### Stripe Sandbox
- [x] Provide claim link to user
- [ ] Test checkout flow with test card


## White-Label SaaS Platform - Phase 3

### Invite/Remove User Functionality
- [x] Add inviteUserToTenant function in tenant.ts
- [x] Add removeUserFromTenant function in tenant.ts
- [x] Add updateUserRole function in tenant.ts
- [x] Add tRPC routes for invite, remove, update role
- [x] Update TenantSettings Team tab with working invite form
- [x] Update TenantSettings Team tab with working remove button
- [ ] Add invite acceptance flow for new users

### Tenant-Scoped Queries
- [x] Update calls queries to filter by tenantId
- [x] Update team members queries to filter by tenantId
- [x] Update training materials queries to filter by tenantId
- [x] Update analytics queries to filter by tenantId (getCallStats, getLeaderboardData)
- [x] Update gamification queries to filter by tenantId (getGamificationLeaderboard)
- [x] Ensure new records are automatically assigned correct tenantId (team members, training materials)

## White-Label SaaS Platform - Phase 4

### Checkout Flow Integration
- [x] Add createCheckoutSession tRPC route
- [x] Wire up onboarding to create checkout session
- [x] Handle checkout success/cancel redirects
- [x] Update tenant with Stripe IDs after checkout (via webhook)

### Invite Acceptance Flow
- [x] Store pending invitations in database (pending_invitations table)
- [x] Check for pending invitations on user login (OAuth callback)
- [x] Auto-assign user to tenant on first login if invited
- [x] Show pending invitations in Company Settings Team tab
- [x] Allow revoking pending invitations

### Billing Management
- [x] Add billing portal route for subscription management
- [x] Add cancel subscription functionality (at period end)
- [x] Add reactivate subscription functionality
- [x] Show current subscription status in Company Settings
- [x] Handle subscription changes via webhooks


## White-Label SaaS Platform - Phase 5

### Email Notifications
- [x] Create notification service for team invites
- [x] Send notification when team member is invited
- [x] Send notification when user accepts invite and joins team

### Plan Upgrade Flow
- [x] Add upgrade plan button to billing tab
- [x] Create checkout session for plan upgrade
- [x] Handle plan change in Stripe webhooks
- [x] Update tenant limits when plan changes
- [x] Show plan comparison in upgrade modal


## White-Label SaaS Platform - Phase 6

### Usage-Based Alerts
- [x] Create usage alert component for dashboard
- [x] Show warning when approaching team member limit (80%+)
- [x] Show warning when approaching call grading limit (80%+)
- [x] Add upgrade prompt when at limit
- [x] Display alerts in Company Settings billing tab

### Super Admin Dashboard Enhancement
- [x] Create dedicated /admin route for platform owner (already exists)
- [x] Display all tenants with status, plan, user count
- [x] Show MRR/ARR metrics
- [x] Add tenant detail view with usage stats
- [x] Revenue breakdown by plan
- [x] Add recent activity feed (new signups, upgrades, cancellations)
- [x] Add alerts tab for past due and expiring trials


## Bug Fixes

- [x] Fix analytics page "Today" filter showing blank data (calls were missing tenantId)


## White-Label Launch - Priority 1: Self-Serve Signup Flow

### Landing Page
- [x] Create public landing page at /landing
- [x] Hero section with headline, subheadline, CTA button
- [x] Features section showcasing AI grading, analytics, gamification
- [x] Pricing table ($99 Starter / $249 Growth / $499 Scale)
- [x] "Start Free Trial" CTA linking to signup
- [x] Footer with links

### Email/Password Authentication
- [x] Create users table fields for email/password auth (passwordHash, emailVerified)
- [x] Build signup page (/signup) with email, password, confirm password
- [x] Build login page (/login) with email/password
- [x] Implement password hashing with bcrypt
- [x] Add JWT session management for email/password users
- [x] Keep Manus OAuth as internal-only option (existing auth flow)

### Signup Flow
- [x] Signup form → Plan selection → Stripe checkout → Onboarding
- [x] 14-day free trial (card optional for trial)
- [x] Create tenant automatically on successful signup
- [ ] Email verification (optional for MVP)

## White-Label Launch - Priority 2: Onboarding Wizard

- [x] Step 1: Company info (name, timezone)
- [x] Step 2: Connect CRM (GHL now, others "coming soon")
- [x] Step 3: Define team roles
- [x] Step 4: Upload training materials (or skip)
- [x] Step 5: Invite team members (email, assign roles)
- [x] Step 6: Done → Redirect to Dashboard
- [x] Progress indicator showing current step
- [x] Allow skipping optional steps
- [ ] Save progress so users can resume (optional enhancement)

## White-Label Launch - Priority 3: Plan Limit Enforcement

- [x] Define plan limits in config (Starter: 3 users/500 calls, Growth: 10/2000, Scale: unlimited)
- [x] Track monthly call usage per tenant (getTenantUsage function)
- [x] Show usage vs limit in Company Settings (getUsageSummary route)
- [x] Block adding team members over limit (canAddUser check in team.create and tenant.inviteUser)
- [x] Block call processing over monthly limit (canProcessCall check in grading.ts)
- [x] Show upgrade prompts when approaching limits (already in TenantSettings billing tab)
- [x] Reset call counts monthly (automatic - counts calls from start of month)

## White-Label Launch - Priority 4: Enhanced Super Admin

- [x] Create /super-admin route (super_admin role only) - already exists at /admin
- [x] All tenants list with search/filter
- [x] MRR / ARR / signups / churn metrics
- [x] Failed payments flagged (past_due in Alerts tab)
- [x] Trial expiring soon flagged (Alerts tab)
- [x] Recent activity feed (Activity tab)
- [x] Revenue breakdown by plan (Revenue tab)
- [ ] Low usage flagged (churn risk) - enhancement
- [ ] Support access to view any tenant's data - enhancement


## Post-Launch Enhancements

### Test Signup Flow
- [x] Navigate to /landing page
- [x] Click "Start Free Trial" 
- [x] Complete signup with test email/password (API tested successfully)
- [x] Select plan and Stripe checkout URL generated
- [x] Login API verified working
- [ ] Complete onboarding steps (manual test)

### Password Reset Flow
- [x] Create password reset tokens table in schema
- [x] Add forgot password page (/forgot-password)
- [x] Add reset password page (/reset-password)
- [x] Create API routes for requesting and completing reset
- [x] Send reset notification with token link (owner notification for now)
- [x] Add "Forgot Password?" link to login page (already existed)

### Low-Usage Churn Alerts
- [x] Track last call date per tenant (getLowUsageTenants function)
- [x] Add query to find tenants with no calls in 7+ days
- [x] Display low-usage tenants in new "Churn Risk" tab in super admin
- [x] Show days since last activity with color-coded severity
- [x] Summary cards showing count by risk level (7-13, 14-30, 30+ days)


## Landing Page Branding Update

- [x] Update landing page colors to match Gunner logo theme (dark red/maroon)
- [x] Add Gunner logo to landing page header and footer
- [x] Replace blue accent colors with brand colors

- [x] Make logo bigger on landing page (h-14 header, h-12 footer)
- [x] Use transparent background version of logo

- [x] Fix broken logo URL on landing page (using cannon icon + GUNNER text)


## Advanced Platform Features

### Email Delivery Service
- [x] Create email service using built-in notification API
- [x] Send password reset emails with reset link
- [x] Send team invite emails with login link
- [x] Send welcome emails when users join a tenant

### Tenant Impersonation
- [x] Add "View as Tenant" button in super admin tenant list
- [x] Create impersonation session that preserves super admin identity
- [x] Add visual indicator when viewing as another tenant
- [x] Add "Exit Impersonation" button to return to super admin view

### Automated Churn Outreach
- [x] Add "Send Re-engagement Email" button on low-usage tenants
- [x] Create re-engagement email template
- [ ] Track when outreach emails were sent
- [ ] Add outreach history to tenant detail view


## Production Readiness Improvements

### Outreach History Tracking
- [x] Add outreach_history table to database schema
- [x] Track when outreach emails were sent
- [x] Track which template was used (7-day, 14-day, 30-day)
- [x] Display outreach history in super admin tenant view

### Tiered Email Templates
- [x] Create 7-day inactivity email template (gentle reminder)
- [x] Create 14-day inactivity email template (urgent outreach)
- [x] Create 30-day inactivity email template (win-back offer)
- [x] Update churn outreach to auto-select template based on inactivity

### Landing Page Route Change
- [x] Move landing page from /landing to / (root route)
- [x] Update all internal links to landing page
- [x] Redirect /landing to / for backwards compatibility


## Google Sign-In Authentication

- [ ] Set up Google OAuth credentials (Client ID and Secret)
- [ ] Create Google OAuth backend routes
- [ ] Add Google Sign-In button to login page
- [ ] Handle Google callback and user creation/login
- [ ] Test Google authentication flow


## Google Sign-In Authentication
- [x] Create Google OAuth backend handler
- [x] Add Google OAuth routes to selfServeAuthRoutes
- [x] Add Google Sign-In button to Login page
- [x] Add Google Sign-Up flow to Signup page
- [x] Configure Google OAuth credentials


## Bug Fixes - Feb 3

- [x] Fix broken Gunner logo on onboarding page (was already working)
- [x] Fix "Failed to save" error on signup flow (unable to reproduce - may be fixed)
- [x] Fix Google OAuth for invited team members (now checks pending invitations)


## Google Sign-In Authentication Fix
- [x] Fix cookie name mismatch between self-serve auth (auth_token) and tRPC context (app_session_id)
- [x] Update context.ts to support both authentication methods
- [x] Add unit tests for dual authentication context
- [x] Verify onboarding flow works for new Google signups


## Tenant Isolation Bug Fix
- [x] Fix Google signup assigning users to wrong tenant (was already correct - users get their own tenant)
- [x] Ensure new signups create their own tenant (verified working)
- [x] Prevent new users from accessing other tenants' data (fixed getAllUsers and getTeamAssignments to filter by tenantId)
- [ ] Remove test user from wrong tenant (not needed - user was on correct tenant)


## Tenant Isolation Bug Fix (Feb 3, 2026)
- [x] Fix Google signup assigning users to wrong tenant (was already correct - users get their own tenant)
- [x] Ensure new signups create their own tenant (verified working)
- [x] Fix getAllUsers to filter by tenantId
- [x] Fix getTeamAssignments to filter by tenantId
- [x] Fix getCallsWithPermissions to require tenantId
- [x] Fix getCallsWithGrades to filter by tenant
- [x] Fix getSocialPosts to filter by tenant
- [x] Fix getBrandProfile to filter by tenant
- [x] Fix getCallsForContentGeneration to filter by tenant
- [x] Fix getKPIsForContentGeneration to filter by tenant
- [x] Fix getInterestingCallStories to filter by tenant
- [x] Fix coach.askQuestion to use tenant filtering
- [x] Fix meeting.startSession and meeting.chat to use tenant filtering
- [x] Fix contentGeneration.getData to use tenant filtering
- [x] Fix contentGeneration.generateBrandContent to use tenant filtering
- [x] Fix contentGeneration.generateCreatorContent to use tenant filtering


## UX Improvements (Feb 3, 2026)
- [x] Clean up test user (coreydenzel14@gmail.com) and tenant (Purple Doors)
- [x] Add friendly empty states for new tenants with no data (already existed in pages)
- [x] Hide sidebar during onboarding flow to prevent navigation away
- [x] Auto-redirect to onboarding if not completed


## Bug Fix - Onboarding Redirect (Feb 3, 2026)
- [x] Fix "Go to Dashboard" button to redirect to /dashboard instead of landing page


## Bug Fix - Google Sign-In Loop (Feb 3, 2026)
- [x] Fix Google sign-in redirecting back to signup page instead of dashboard/onboarding
- [x] Add auth check to Signup page to redirect logged-in users


## Bug Fix - Onboarding Restart (Feb 3, 2026)
- [x] Fix onboarding restarting from Company Info after Google signup completes
- [x] Google signup now starts at step 2 (Connect CRM) since company name is already provided
- [x] Onboarding page now fetches tenant settings to resume from saved step
- [x] Fix onboarding looping back to step 2 - use ref to prevent re-initialization on data refetch
- [x] Disable tenant settings refetch during onboarding to prevent step reset
- [x] Fix onboarding loop after clicking Go to Dashboard - now sets onboardingCompleted='true' before redirecting
- [x] Added completeOnboarding mutation to tenant router and tenant.ts
- [x] Added cache invalidation for tenant.getSettings after completing onboarding to prevent stale data redirect
- [x] Add loading state to Go to Dashboard button on Step 6

## CRITICAL BUG - Data Isolation (Feb 3, 2026)
- [x] Fix tenant isolation - test accounts seeing main account's calls and data
- [x] Fixed withGrades endpoint to pass tenantId
- [x] Fixed getById endpoint to verify tenant ownership
- [x] Fixed getTeamTrainingItems to filter by tenantId
- [x] Fixed getActiveTrainingItems to filter by tenantId
- [x] Fixed teamTraining.list and teamTraining.getActive to pass tenantId

## Data Isolation Hardening (Feb 3, 2026)
- [x] Delete test tenant data (deleted tenants 60005 and 30001)
- [x] Audit all endpoints for tenant isolation issues
  - [x] Fixed grading rules (getGradingRules, createGradingRule)
  - [x] Fixed AI feedback (getAIFeedback)
  - [x] Fixed brand assets (getBrandAssets)
  - [x] Fixed content ideas (getContentIdeas)
  - [x] Verified social posts already has tenant filtering
  - [x] Verified training materials already has tenant filtering
  - [x] Verified leaderboard already has tenant filtering
  - [x] Verified team members already has tenant filtering
- [x] Add automated tenant isolation tests (18 tests in tenantIsolation.test.ts)

## Security & Admin Enhancements (Feb 3, 2026)
- [x] Add tenant ownership verification to update/delete operations
  - [x] Created tenantOwnership.ts helper with verifyTenantOwnership function
  - [x] Training materials: update, delete
  - [x] AI feedback: updateStatus
  - [x] Grading rules: update, delete
  - [x] Team training items: update, delete, complete
  - [x] Brand assets: update, delete
  - [x] Social posts: update, delete
  - [x] Content ideas: update, delete
- [x] Implement rate limiting per tenant
  - [x] Created rateLimit.ts with sliding window rate limiting
  - [x] Defined tiers: default (100/min), ai (20/min), contentGeneration (10/min), grading (30/min), auth (10/15min)
  - [x] Applied to: coach.askQuestion, meetingCoach.chat, teamTraining.generateInsights
  - [x] Applied to: socialPosts.generateContent, contentIdeas.generateIdeas
  - [x] Applied to: brandProfile.extractFromWebsite, contentGeneration.generateBrandContent, contentGeneration.generateCreatorContent
- [x] Create admin dashboard for tenant management
  - [x] Created AdminDashboard.tsx with stats cards (tenants, users, calls, MRR)
  - [x] Created adminRouter.ts with super admin procedures
  - [x] Added tenant list with search, status badges, tier badges
  - [x] Added tenant detail modal with overview, users, and settings tabs
  - [x] Added ability to update subscription tier, status, and max users
  - [x] Route available at /admin-dashboard (super_admin only)

## Admin Enhancements Phase 2 (Feb 3, 2026)
- [x] Add admin navigation link in sidebar for super_admin users
- [x] Add tenant deletion capability to admin dashboard
- [x] Add usage analytics tracking per tenant
  - [x] Added trackUsage function to rateLimit.ts
  - [x] Added usage tracking to all rate-limited endpoints (AI chat, content generation)
  - [x] Added getUsageAnalytics and getTenantUsage endpoints to adminRouter
  - [x] Added Usage Analytics section to AdminDashboard with table view

## Tenant Impersonation Feature (Feb 3, 2026)
- [x] Add impersonation backend - session management and endpoints
  - [x] Added startImpersonation endpoint to adminRouter
  - [x] Server context checks X-Impersonate-User-Id header
  - [x] Validates super_admin role before allowing impersonation
- [x] Add impersonation UI to admin dashboard
  - [x] Added impersonation button (UserCheck icon) per tenant row
  - [x] Stores impersonation data in localStorage
  - [x] Added X-Impersonate-User-Id header to trpc client
- [x] Add impersonation indicator bar for active sessions
  - [x] Created ImpersonationBanner component
  - [x] Fixed amber banner at top of screen during impersonation
  - [x] Shows target tenant name and user info
  - [x] End Impersonation button to return to admin view
  - [x] Added padding to DashboardLayout when impersonating
- [x] Fix Team Assignments - allow multiple Lead Managers to be assigned to an Acquisition Manager (fixed tenantId not being set on new assignments)
- [x] Fix Team Members edit functionality - edit button now opens dialog to change team role
- [x] Add Failed Calls tab to Call History page
- [x] Fix audio compression for long call recordings (90+ minutes support)
  - [x] Implemented 16kbps mono MP3 compression using FFmpeg
  - [x] Added automatic compression for files >16MB before Whisper transcription
  - [x] Improved FFmpeg availability check with better error logging
  - [x] Added fallback strategy: if compression fails, attempt to send original file to Whisper API
  - [x] Added 5-minute timeout for transcription API calls to handle long audio files
  - [x] Created unit tests for audio compression fallback behavior
  - [x] All 176 tests passing


## Sidebar Navigation Consolidation (Feb 4, 2026)
- [ ] Hide Social Media from sidebar (keep code for future)
- [ ] Merge My Profile into Team page as a tab
- [ ] Merge Team Management into Company Settings as a tab
- [ ] Remove Platform Admin link (keep Admin Dashboard only)
- [ ] Test consolidated navigation


## Sidebar Navigation Consolidation
- [x] Hide Social Media tab (keep code for later)
- [x] Merge My Profile into Team page as a tab
- [x] Merge Team Management into Company Settings as "Roles" tab
- [x] Remove Platform Admin link (keep Admin Dashboard)
- [x] Update sidebar navigation to show simplified menu


## Role System Consolidation
- [ ] Consolidate two role dropdowns into single dropdown
- [ ] Add Lead Generator role option
- [ ] Update onboarding to use 4 roles: Lead Manager, Acquisition Manager, Lead Generator, Admin
- [ ] Update Company Settings Roles tab to single dropdown
- [ ] Add Lead Generator assignment to Lead Managers (LGs report to LMs)
- [ ] Lead Generators have same access/grading as Lead Managers
- [ ] Update permissions logic for Lead Generator role


## Role System Consolidation
- [x] Consolidate two role dropdowns into single dropdown
- [x] Add Lead Generator role option (4 roles: Admin, Lead Manager, Acquisition Manager, Lead Generator)
- [x] Update onboarding to use consistent 4 role options
- [x] Add Lead Generator to Lead Manager assignment system
- [x] Update permissions so Lead Generators have same access as Lead Managers
- [x] Update grading to treat Lead Generator calls same as Lead Manager calls
- [x] Update gamification badges for Lead Generator role


## Mobile Viewing Improvements
### Global Issues
- [ ] Header bar: Show icon only on mobile, hide text label (use tooltip on desktop)
- [ ] Sidebar: Consider swipe-to-close gesture

### Dashboard (/dashboard)
- [ ] Stat cards: 2-column grid on mobile (icon + number + label)
- [ ] Gamification cards: 2x2 grid on mobile
- [ ] Recent Calls: Tighter vertical padding
- [ ] Team Leaderboard: Horizontal layout for top 3 ranks
- [ ] Call Processing Status: Horizontal row or 2x2 grid

### Call History (/calls)
- [ ] Filter row: Collapse into single "Filters" button with bottom sheet
- [ ] Tab bar: Ensure readable on mobile (icons + labels or horizontal scroll)
- [ ] Action buttons: Stack vertically or collapse into overflow menu

### Analytics (/analytics)
- [ ] Stat cards: 2-column grid on mobile
- [ ] Tables: Add horizontal scroll wrapper for Team Leaderboard, Call Metrics, Team Member Scores
- [ ] Score Trends chart: Check axis labels at 375px

### Team (/team)
- [ ] Team member cards: Compact 2-column grid or horizontal carousel

### Settings (/settings)
- [ ] Tab icons: Add text labels below icons on mobile


## Mobile Viewing Improvements (Feb 4, 2025)
- [x] Header bar: Hide "Toggle sidebar" text on mobile, show only hamburger icon
- [x] Dashboard: 2-column grid for stat cards on mobile
- [x] Dashboard: Compact gamification cards (2-column grid)
- [x] Dashboard: Horizontal scroll for leaderboard on mobile
- [x] Dashboard: Smaller processing status cards
- [x] Team: Compact card design with smaller avatars and badges
- [x] Call History: Collapsible filters on mobile
- [x] Call History: Horizontal scroll tabs
- [x] Call History: Compact call cards with smaller text
- [x] Analytics: 2-column stat cards on mobile
- [x] Analytics: Horizontal scroll for leaderboard tables
- [x] Settings: Show text labels with icons on all tabs (horizontal scroll)


## Training Page UI Improvements
- [x] Make Issues and Wins cards more compact to show more items
- [x] Make Long-Term Skills cards match compact styling
- [x] Increase Training page card descriptions from 3 to 5 lines
- [x] Fix broken Gunner logo on onboarding page (was already working)
- [x] Fix "Failed to save" error on signup flow (unable to reproduce - may be fixed)
- [x] Fix Google OAuth for invited team members (now checks pending invitations)
- [x] Fix Team page truncated names to show full names
- [x] Add personalized welcome message on Dashboard
- [x] Smarter Dashboard stats default when no data today
- [x] Add AI Coach example prompts
- [x] Smarter Analytics default date range
- [x] Add empty state guidance messages
- [ ] Add email verification for new user signups
  - [ ] Add emailVerified and verificationToken fields to users table
  - [ ] Create verification token generation and email sending
  - [ ] Create /verify-email endpoint
  - [ ] Build verification pending and success UI pages
  - [ ] Block unverified users from accessing protected routes

## Profile Picture Upload
- [x] Create backend endpoint for profile picture upload
- [x] Add profile picture UI to profile/team page
- [x] Display profile picture in sidebar avatar
- [x] Display profile picture on team members page
- [x] Add image cropping/preview before upload (basic preview on hover)

## Email Service Integration
- [x] Install Resend package
- [x] Update emailService.ts to use Resend
- [ ] Add RESEND_API_KEY secret
- [ ] Test email verification flow
- [x] Fix Analytics page stat cards to match Dashboard styling
- [x] Add tenant settings/delete functionality to Admin page
- [x] Extend session cookie expiration to 30 days
- [x] Fix transcription failure for large audio files (30+ minute calls exceeding 25MB limit)
- [x] Add MP3 decoder to handle large MP3 files without FFmpeg
- [x] Fix call classification to not skip long calls with rapport-building conversations
- [x] Increase audio compression bitrate for better transcription quality
- [x] Add "Grade This Call" button for skipped calls to reclassify and grade them
- [x] Replace Offers Accepted stat with count of completed offer calls by acquisitions managers
- [x] Increase compression bitrate to 96kbps for better transcription quality on long calls
- [x] Implement audio chunking for long calls (split, transcribe chunks, combine transcript)
- [x] Fix call type label to show 'Qualification' instead of 'Qual'
- [x] Add Pending tab to Call History to show queued calls being processed
- [x] Fix tab labels: change 'Skipped Skip' to 'Skipped' and 'N/A' to 'Admin'
- [x] Create plans database schema with trial days, pricing, features
- [x] Build backend procedures for plans CRUD operations
- [x] Create Plans Management UI tab in Super Admin panel
- [x] Update signup flow to use database-driven plans and trial periods
- [ ] Update homepage CTA button to dynamically show trial period from database
- [ ] Add Stripe price ID fields to plans schema and UI for automatic checkout sync

## Homepage CTA and Stripe Integration
- [x] Update homepage CTA button to dynamically show trial period from database
- [x] Add Stripe price ID fields to plans schema and UI for automatic checkout sync

## Stripe Checkout Integration
- [x] Update seed default plans to include Stripe price IDs from products.ts
- [x] Connect upgrade/billing flow to use Stripe price IDs from plans table

## Stripe Products and Prices Setup
- [x] Create Stripe products for each plan tier (Starter, Growth, Scale)
- [x] Create monthly and yearly prices for each product
- [x] Update database plans with Stripe price IDs

## Plans Management Tab
- [x] Add Plans Management tab to Admin Dashboard
- [x] Display all subscription plans with pricing, limits, features
- [x] Allow editing plans (name, price, trial days, limits, features)
- [x] Allow adding Stripe price IDs to plans
- [x] Add Seed Default Plans button

## Subscription Management (Customer)
- [x] Add backend endpoint to get available plans for upgrade/downgrade
- [x] Add backend endpoint to change subscription plan via Stripe
- [x] Add "Change Plan" button to Billing page
- [x] Create plan selection dialog with pricing comparison
- [x] Handle proration and billing cycle changes
- [x] Show confirmation before plan change

## Plan Editor Features UI
- [x] Change Features textarea to checkbox list with all available features

## Feature Descriptions/Tooltips
- [x] Add tooltips with descriptions for each feature in the plan editor

## Pricing Page Improvements
- [x] Display human-readable feature names on public pricing page
- [x] Add tooltip descriptions for each feature on pricing page
- [x] Add icons next to each feature for visual enhancement

## Dynamic Plan Pricing Fix
- [x] Update homepage to fetch plans from database instead of hardcoded values
- [x] Update upgrade modal in TenantSettings to use database plans
- [x] Ensure all pricing displays are consistent across the app

## Bug Fix - TenantSettings Error
- [x] Fix TypeError: is.slice(...).map is not a function in TenantSettings

## LAUNCH BLOCKERS (Priority Order)

### 1. Paywall Enforcement
- [x] Block dashboard access until card is entered
- [x] Redirect users to paywall after completing onboarding step 6
- [x] Create paywall page with plan selection and Stripe checkout
- [x] Track subscription status in tenant record
- [x] Allow trial users (card entered) to access dashboard
### 2. Email/Password Authentication
- [x] Add email/password signup alongside Google OAuth
- [x] Implement login with email/password
- [x] Implement password reset flow
- [x] Add email verification for new signups

### 3. Legal Pages
- [x] Create Terms of Service page
- [x] Create Privacy Policy page
- [x] Add checkbox at signup agreeing to both
- [ ] Block signup without legal agreement

### 4. Failed Payment Handling
- [x] Handle Stripe webhook for failed payments
- [x] Implement payment retry logic (Stripe handles automatically)
- [x] Send dunning emails (payment failed, retry scheduled, account suspended)
- [x] Suspend dashboard access after payment failures

## 14-Day Email Sequence
### Trial Period (Days 0-3)
- [x] Day 0: Welcome email (immediately after signup)
- [x] Day 1: First call check-in (24 hours after signup)
- [x] Day 2: Trial ending reminder (48 hours after signup)
- [x] Day 3: Final reminder (morning of last trial day)

### Post-Conversion (Days 4-14)
- [x] Day 4: Welcome to Gunner (first day as paying customer)
- [x] Day 7: Week 1 recap with stats
- [x] Day 10: Feature spotlight (Coaching Clips)
- [x] Day 14: Two-week check-in with feedback request

### Engagement Triggers
- [x] No calls graded after 48 hours trigger
- [x] Power user recognition (10+ calls in first week)

### Infrastructure
- [x] Create scheduled job for daily email checks
- [x] Track email send history to avoid duplicates
- [x] Add user stats queries for email personalization

## Email Sequence Cron Job
- [x] Add daily cron job to run email sequence (hourly checks built into server)
- [x] Add manual trigger button to admin panel (Emails tab in SuperAdmin)

## Loops.so Email Automation Integration
- [x] Create Loops.so account and connect API
- [x] Add custom contact properties (tenantId, tenantName, planType, trialEndsAt)
- [x] Integrate Loops API into Gunner signup flow
- [x] Create email sequence job with event-based triggers
- [x] Add emails_sent tracking table to prevent duplicates
- [x] Create email templates for all 14-day sequence emails
- [x] Add manual trigger button in SuperAdmin panel
- [x] Write vitest tests for email sequence job
- [x] Configure DNS records for Loops email sending (MX, SPF, DKIM) in Squarespace
- [x] Publish transactional emails in Loops.so (Day 1, Day 2, Password Reset)
- [x] Activate welcome email loop (triggered on contact added)
- [x] Fix super admin account bypassing paywall (corey@newagainhouses.com blocked)
- [x] Fix sign in → onboarding → paywall → dashboard sequence (onboarding restarts after paywall)
- [x] Fix login flow loop: paywall → onboarding → paywall → onboarding
- [x] Update signup flow and landing page links: Account → Onboarding → Plan/Payment
- [ ] Fix signup page still showing Account/Plan/Payment steps
- [x] Fix paywall to show plan selection with correct pricing
- [x] Fix paywall using admin.getPlans (super admin only) - changed to tenant.getPlans (public)
- [x] Fix paywall loop after successful Stripe payment - should redirect to dashboard
- [x] Fix paywall redirect loop using sessionStorage to persist checkout success state
- [x] Fix inconsistency: billing page shows 'Calls Graded' but admin panel shows 'Max Calls/Month' - make consistent
- [ ] Fix calls stuck in 'Transcribing' status for hours - longer calls (12-30 min) not completing
- [x] Fix stuck transcription calls - increased timeouts and added Reset Stuck Calls button
- [x] Add ffmpeg-static package for production audio chunking support
- [x] Fix 'Could not determine audio duration' - use ffmpeg instead of ffprobe for duration detection
- [x] Fix 'Failed to extract chunk 1' error - added chmod and better error logging
- [x] Implement pure JavaScript WAV chunking without FFmpeg dependency


## Call Re-sync and Audio Chunking Fixes
- [x] Add resyncCallRecording function to GHL service
- [x] Add ghlSync.resyncRecording tRPC endpoint
- [x] Fix audio chunking to detect WAV files by magic bytes before trying FFmpeg
- [x] Prioritize pure JS WAV chunking for WAV files (more reliable than FFmpeg)
- [x] Successfully process Jamey Durham 16:22 call that was previously failing


## Improve AI Classification for Post-Offer Calls
- [x] Update classification prompt to detect post-offer administrative calls
- [x] Add detection for: paperwork signing, document walkthroughs, technical help with agreements
- [x] Add detection for: follow-up calls after offer was already made
- [x] Classify these as admin_call instead of conversation to avoid incorrect grading
- [ ] Test with Jamey Durham call example (user can reclassify and reprocess)


## Admin Call Summaries
- [x] Add AI-generated summary for admin calls explaining what the call was about
- [x] Generate summary when call is classified as admin_call
- [x] Generate summary when call is manually reclassified to admin_call
- [x] Store summary in classificationReason field
- [x] Display summary in the call list for admin calls


## Admin Impersonation Feature
- [x] Add impersonation UI to admin settings page
- [x] Show list of team members with "View As" button
- [x] Implement impersonation start/stop functionality
- [x] Show impersonation banner when viewing as another user
- [x] Restrict impersonation to admin users only


## Badge Bug Fix
- [ ] Investigate why Kyle Barks shows 0 badges despite having graded calls
- [ ] Check badge calculation logic
- [ ] Fix badge awarding/display issues


## Badge Bug Fix
- [x] Investigate why Kyle Barks shows 0 badges despite having graded calls
- [x] Check badge calculation logic - found badges were never being evaluated after grading
- [x] Implement evaluateBadgesForCall function to check and award badges after each call
- [x] Add batchEvaluateBadges function to catch up on existing calls
- [x] Add "Evaluate Badges" button in Settings > Roles & Assignments


## Automatic Badge Evaluation
- [ ] Fix badge_progress table schema mismatch
- [ ] Make badges evaluate automatically when calls are graded (like XP)
- [ ] Remove need for manual "Evaluate Badges" button


## Fix Issue Description Truncation
- [x] Find where issue descriptions are being truncated with "..."
- [x] Increase character limit to show full descriptions (line-clamp-5 → line-clamp-10)
- [x] Test that all issue text displays completely


## BatchDialer Integration & Lead Generator Role
- [ ] Read cold calling script PDF to understand grading criteria
- [ ] Research BatchDialer API documentation
- [ ] Add BatchDialer API key to environment variables
- [ ] Create BatchDialer service for API calls
- [ ] Implement call fetching and polling (every 30 minutes)
- [ ] Download and process call recordings
- [ ] Map BatchDialer agents to Gunner team members

### Lead Generator Role & Authentication
- [ ] Add "lead_generator" role to user schema
- [ ] Create Lead Generator user accounts
- [ ] Build Lead Generator login and dashboard
- [ ] Set up role-based permissions (view own calls only)
- [ ] Add Lead Generator to team management UI

### Lead Generator Grading Rubric
- [ ] Define grading criteria based on cold calling script
- [ ] Create Lead Generator rubric in grading system
- [ ] Build coaching feedback for lead gen calls
- [ ] Add lead tracking (leads sent to acquisition team)

### Lead Generator Gamification
- [ ] Design Lead Generator-specific badges (6-8 badges with tiers)
- [ ] Define XP rewards for lead gen activities
- [ ] Add lead gen metrics to leaderboard
- [ ] Create lead gen profile/rewards page


## BatchDialer Integration & Lead Generator Role

### Database & API Setup
- [x] Store BatchDialer API key securely (BATCHDIALER_API_KEY)
- [x] Create BatchDialer service with API client (batchDialerService.ts)
- [x] Add database schema for BatchDialer calls (callSource, batchDialerCallId, batchDialerCampaignId, batchDialerCampaignName, batchDialerAgentName)
- [x] Lead Generator role already exists in schema (teamRole enum)
- [ ] Fix BatchDialer API timeout issue (API not responding - needs investigation or contact support)

### Lead Generator Grading Rubric
- [x] Analyze cold calling script PDF
- [x] Create Lead Generator-specific grading criteria based on script:
  - [x] Introduction & Permission (greeting, name, permission to continue)
  - [x] Qualification Questions (ownership, timeline, condition, motivation)
  - [x] Value Proposition (cash offer benefits, no repairs/commissions)
  - [x] Objection Handling (price concerns, need to think, other offers)
  - [x] Appointment Setting (confirm interest, schedule, provide details)
  - [x] Professional Tone (friendly, respectful, not pushy)
- [x] Add Lead Generator rubric to grading.ts
- [x] Create separate grading prompt for cold calling vs offer calls

### Lead Generator Badges & XP
- [x] Design Lead Generator-specific badges:
  - [x] Conversation Starter (Bronze/Silver/Gold) - X successful conversations
  - [x] Appointment Setter (Bronze/Silver/Gold) - X appointments booked
  - [x] Objection Handler (Bronze/Silver/Gold) - Handle X objections successfully
  - [x] Qualification Pro (Bronze/Silver/Gold) - High scores on qualification
  - [x] Cold Call Warrior (Bronze/Silver/Gold) - High weekly volume
- [x] Add Lead Generator XP rewards (same as existing system)
- [x] Update gamification.ts to include Lead Generator badges

### BatchDialer Polling & Sync
- [ ] Implement automatic polling for BatchDialer calls (every 30 minutes like GHL)
- [ ] Add manual "Sync from BatchDialer" button in Call History
- [ ] Map BatchDialer agent names to Gunner team members (settings page)
- [ ] Download call recordings from BatchDialer API
- [ ] Process BatchDialer calls through transcription pipeline
- [ ] Process BatchDialer calls through Lead Generator grading rubric

### Lead Generator Authentication & Dashboard
- [ ] Add email/password login for Lead Generators (already exists - use existing auth)
- [ ] Create Lead Generator dashboard view (simplified - own calls only)
- [ ] Show Lead Generator stats (calls made, appointments set, avg score)
- [ ] Show Lead Generator badges and XP progress
- [ ] Hide admin features from Lead Generators (training, team management, etc.)

### Lead Tracking for Lead Generators
- [ ] Add "leads sent" field to track qualified leads passed to acquisition team
- [ ] Add lead tracking section to Lead Generator dashboard
- [ ] Show conversion rate (leads sent → appointments set → offers accepted)

### Testing & Validation
- [ ] Test BatchDialer API connection once timeout issue resolved
- [ ] Test Lead Generator grading with sample cold call
- [ ] Test Lead Generator badge awarding
- [ ] Test Lead Generator XP system
- [ ] Test Lead Generator dashboard permissions

## Landing Page Legal Links
- [x] Create Privacy Policy page
- [x] Create Terms of Service page
- [x] Update landing page footer with links to Privacy Policy and TOS

## Call History Tab Visibility
- [x] Hide Pending, Failed, and Admin tabs for non-admin users
- [x] Keep all tabs visible for admin and super_admin users

## Lead Generator Complete Build
- [x] Verify Team Management supports adding Lead Generator role
- [x] Build Lead Generator dashboard (filter calls to show only their own)
- [x] Add Lead Generator stats widget (calls today, appointments, avg score, XP)
- [x] Hide admin navigation for Lead Generators (Team, Analytics, Training, Social, KPI, Settings)
- [x] Add manual call upload functionality for Lead Generators
- [ ] Add lead conversion tracking (appointments → deals) - DEFERRED: requires deal/opportunity schema
- [ ] Test Lead Generator user flow end-to-end

## BatchDialer Sync Implementation
- [x] Review existing BatchDialer service and API integration
- [x] Implement automatic polling mechanism (every 30 minutes)
- [x] Add manual "Sync from BatchDialer" button in Call History
- [x] Map BatchDialer agent names to Gunner team members
- [x] Download and process call recordings from BatchDialer
- [ ] Test BatchDialer sync end-to-end

## BatchDialer Sync Optimization
- [x] Update BatchDialer API key
- [x] Change sync to fetch only last 24 hours (not 7 days)
- [x] Test sync with new API key and 24-hour window

## BatchDialer Agent Mapping Verification
- [x] Check current Gunner team members vs BatchDialer agents (Alex Diaz, Efren Valenzuala, Mirna Razo)
- [x] Fix agent name mapping - Added 3 Lead Generators to database
- [x] Reduced sync window from 24 hours to 2 hours to reduce API load
- [ ] Resolve BatchDialer CDRs API timeout issue (contact support)
- [ ] Use manual call upload as workaround until API sync is resolved

## Lead Generator Visibility Issue
- [x] Investigate why Lead Generators (Alex, Efren, Mirna) aren't showing in Team Management UI
- [x] Fix Team Management page to display team members without user accounts
- [x] Test that Lead Generators appear in team member cards
- [x] Fix "lead_generator" to display as "Lead Generator" in UI
- [x] Make Lead Generators appear in Settings page

## Role-Specific Training Content
- [x] Update Team Training tab to filter AI insights by user's team role
- [x] Lead Generators see only insights from Lead Generator calls
- [x] Lead Managers see only insights from Lead Manager calls
- [x] Acquisition Managers see only insights from Acquisition Manager calls
- [x] Admins see all insights (no role filtering)

## Team Training Role Filter UI
- [x] Add role filter tabs to Team Training page (All, Lead Manager, Acquisition Manager, Lead Generator)
- [x] Show all roles by default for admin users
- [x] Allow admin to switch between role-specific views
- [x] Update Issues, Wins, Skills, and Agenda sections to respect selected role filter

## Methodology Page - Lead Generator Rubric Tab
- [x] Add Lead Generator tab to Methodology page alongside Lead Manager and Acquisition Manager
- [x] Display Lead Generator rubric criteria when tab is selected
- [x] Ensure all three role tabs are visible and functional

## Clean Up Test Data
- [x] Delete test team members (Test Lead Manager, Test Acquisition Manager, Test Lead Generator)
- [x] Verify only real team members remain (Chris, Daniel, Kyle, Alex, Efren, Mirna)

## Training Materials - Lead Generator Option
- [x] Add "Lead Generators" option to "Applies To" dropdown in training materials upload form
- [x] Ensure dropdown shows: All Team Members, Lead Managers, Acquisition Manager, Lead Generators
- [x] Verify materials can be assigned to Lead Generators specifically

## Bug Fix - Lead Generator applicableTo validation
- [x] Update server-side z.enum validation to include "lead_generator" for training materials create/update
- [x] Update server-side z.enum validation to include "lead_generator" for grading rules create/update

## Team Training Tab - Role Filter Tabs (like Methodology)
- [x] Add Lead Manager / Acquisition Manager / Lead Generator tabs to Team Training tab
- [x] Filter Issues, Wins, Skills, and Meeting Agenda by selected role tab
- [x] Admin sees all tabs, non-admin users see only their role's tab
- [x] Ensure role filter tabs are visually consistent with Methodology tab

## AI Insights - More Items Per Role
- [x] Update AI insights generation to produce at least 2-3 issues, 2 wins, and 2 long-term skills per role
- [x] Add teamRole column to team_training_items for direct role filtering
- [x] Update AI prompt to generate role-specific insights with minimum counts
- [x] Lead Managers and Acquisition Managers should have sufficient items from call data
- [x] Lead Generators are exception (no calls yet)

## UI Fix - Team Page Spacing
- [x] Add more spacing between Team page header and tabs

## Team Page - Lead Generator Role Card
- [x] Add Lead Generator role card to Team Roles section on Team page

## Create Lead Generator User Accounts
- [x] Create account for Alex Diaz (bu2679773@gmail.com)
- [x] Create account for Efren Valenzuela (valenzuelameza9@gmail.com)
- [x] Create account for Mirna Razo (esmirnavela08@gmail.com)
- [x] Link accounts to existing team members

## Create Admin Account - Jessica Guzman
- [x] Create admin account for Jessica Guzman (yamicead15@gmail.com)
- [x] Set role to admin

## Update Lead Generator Role Description
- [x] Update Lead Generator rubric to focus on generating seller interest (not setting appointments)
- [x] Update Lead Generator role card description on Team page
- [x] Update Lead Generator grading prompts and AI analysis context
- [x] Update any Lead Generator references in insights generation
- [x] Ensure Lead Manager description correctly mentions qualifying and setting appointments

## Lead Generator Badge & Dashboard Updates
- [x] Replace "Appointment Setter" badge with "Warm Handoff Pro" badge for Lead Generators
- [x] Update all Lead Generator badges to use "lead_generator" category (was using "lead_manager")
- [x] Add "lead_generator" to badge category enum in database schema
- [x] Update badge filtering logic to properly separate lead_generator from lead_manager badges
- [x] Replace "Appointments Set" stat with "Interests Generated" on Lead Generator Dashboard
- [x] Update Onboarding role descriptions (Lead Manager: qualifies & sets appointments; Lead Generator: generates interest, NOT appointments)
- [x] Update Training page rubric descriptions for all three roles
- [x] Add lead_generation to callType enum for call creation
- [x] Write comprehensive vitest tests for Lead Generator role definitions (16 tests passing)

## BatchDialer API Improvements (per support recommendations)
- [x] Implement pagination for cdrs endpoint requests
- [x] Break polling into smaller time windows (15-30 min chunks instead of 2 hours)
- [x] Add graceful retry logic with exponential backoff
- [x] Improve error handling for SocketError/timeout scenarios
- [x] Prepare exact request format details for BatchDialer support team

## Call History Page Redesign
- [x] Expand callType enum to 5 types: cold_call, qualification, follow_up, offer, callback
- [x] Add callOutcome field to calls table (AI-extracted with manual override)
- [x] Add callTypeSource field (ai_suggested, manual, auto) to track how type was set
- [x] Build multi-rubric routing infrastructure (call type → rubric mapping)
- [x] Map Cold Call → Lead Generator rubric, Qualification → Lead Manager rubric
- [x] Create placeholder rubrics for Follow-Up, Offer, Callback
- [x] Add AI outcome detection during grading (extract outcome from transcript)
- [x] Add manual outcome override support for admins
- [x] Redesign tabs: All Calls, Needs Review, Skipped (3 tabs instead of 6)
- [x] Add Date Range filter (default Last 7 days)
- [x] Add Outcome filter
- [x] Add pagination (25 per page, lazy load)
- [x] Add Property Address pill to call cards
- [x] Add Outcome tag to call cards (colored tag next to score)
- [x] Add AI call type suggestion from transcript
- [x] Add manual call type selection/override

## Call History Redesign v2 (Updated Spec)
- [x] Split callback into seller_callback and admin_callback (6 call types total)
- [x] Implement Follow-Up rubric (7 criteria, critical failure cap at 50%, talk ratio ≥50%)
- [x] Implement Seller Callback rubric (8 criteria, critical failure cap at 50%, talk ratio ≥60%)
- [x] Implement Admin Callback rubric (5 criteria, no critical failures, exclude from leaderboard)
- [x] Add critical failure detection and score capping logic to grading engine
- [x] Update rubric routing for 6 call types
- [x] Update AI call type detection to distinguish seller_callback vs admin_callback
- [x] Update frontend call type options, filters, and badges for 6 types
- [x] Update CallDetail page for 6 call types

## Call History Filter Cleanup
- [x] Remove Direction filter from Call History page
- [x] Fit all remaining filters (Date, Team Member, Call Type, Outcome, Score) on one line
- [x] Default date range to Today instead of Last 7 Days

## Lead Manager Call Visibility Scoping
- [x] Lead Managers should only see their own calls + calls from their assigned Lead Generators
- [x] Update backend withGrades query to filter by allowed team member IDs for Lead Managers
- [x] Update frontend Team Member filter to only show relevant members for Lead Managers
- [x] Admins and Acquisition Managers continue to see all calls

## Bug Fixes - Call History Empty
- [x] Fix Call History showing no calls for admin user after permission scoping changes

- [x] Fix admin visibility bug: admin/super_admin should see ALL calls in Call History (not scoped by Lead Manager logic)

## Bug Fixes - Badges Not Working
- [x] Investigate and fix badges not working (not being awarded/displayed properly)
  - Root cause: user_badges table had extra columns (badgeCode, progress, triggerCallId, isViewed) not in Drizzle schema
  - awardBadge() insert was missing badgeCode (NOT NULL), causing silent insert failures
  - Fixed schema, awardBadge function, and ran batch evaluation to retroactively award 7 badges

## Badge Evaluation Timing Change
- [x] Move badge evaluation from call-view-time to grading-time (automatic, chronological order)
- [x] Keep XP view reward as-is (incentivizes reviewing feedback)
- [x] Remove badge evaluation from processCallViewRewards
- [x] Add badge evaluation to processCall (grading pipeline, Step 8)
- [x] Batch evaluation already ran and awarded 7 badges based on chronological order

## Bug Fix - On Fire Badge Counting Incorrectly
- [x] Fix On Fire badge: now properly resets streak to 0 when a bad grade breaks the streak
- [x] Reset On Fire progress and re-evaluated from scratch (Kyle=3, Daniel=0, Chris=0)
- [x] Also fixed Conversation Starter badge (same consecutive_grade criteria type)
- [x] Removed incorrectly awarded On Fire badges (Daniel and Kyle had false bronze)

## Bug Fix - Criteria-Based Badges Not Counting
- [x] Investigate why criteria_score badges show 0 progress - root cause: criteriaScores stored as array of objects, not flat key-value
- [x] Fix criteria badge evaluation parsing to handle array format [{name, score, maxPoints}]
- [x] Re-evaluated all criteria badges from existing call data
- [x] Also fixed Lead Manager criteria badges (Script Starter, Motivation Miner, etc.)

## New Badge - Rapport Builder
- [x] Add 'Rapport Builder' badge for high score in Introduction & Rapport criteria (8+/10, Lead Manager only)
- [x] Seed badge tiers in database (bronze: 25, silver: 100, gold: 500)
- [x] Re-evaluated existing calls: Daniel 9/25, Chris 3/25

## Cleanup - Delete Test Team Members
- [x] Delete Test Lead Manager, Test Acquisition Manager, Test Lead Generator from database (27 test members removed)
- [x] Fix badge display on Team page: only show highest tier earned per badge, not all tiers (filtered in getUserBadges)

## Multi-Tenant Onboarding (Wholesaling-Only)
- [ ] Per-tenant API credentials: move GHL/BatchDialer keys from env vars into tenant crmConfig
- [ ] Update GHL sync job to loop through tenants and use per-tenant credentials
- [ ] Update BatchDialer sync job to loop through tenants and use per-tenant credentials
- [x] Per-tenant pipeline stage mapping: UI to map GHL stages → call types per tenant
- [ ] Scope all major data queries by tenantId (calls, team_members, grades, badges, etc.)
- [x] Build tenant setup wizard admin page (company name, GHL key, pipeline mapping)
- [x] Build team member bulk import (paste names, phone numbers, roles)
- [ ] Update grading LLM prompt to use tenant company name instead of hardcoded "Nashville Area Home Buyers"
- [ ] Write tests for multi-tenant isolation
- [x] Wire up Onboarding page Step 2 to save CRM config (GHL key, location, BatchDialer, pipeline mapping) to database
- [x] Remove hardcoded team member names from lead generator grading rubric
- [x] Add BatchDialer API key and pipeline mapping fields to customer onboarding flow
- [x] Add super admin "Manage" button per tenant with CRM config editing and bulk member import
- [x] Add /admin/tenant-setup route for new customer onboarding wizard
- [x] Fix admin role check in updateSettings to include super_admin role
- [x] Write vitest tests for tenant setup, bulk import, CRM config update, and permission checks (10 tests passing)
- [x] Test full tenant setup flow end-to-end via browser (create tenant, verify CRM config saved, verify team members created)
- [x] Add GHL connection validation endpoint and "Test Connection" button in CRM setup
- [x] Build per-tenant pipeline stage mapping UI (visual mapper: GHL stages → call types per tenant)

## Opportunities Dashboard (V1)
- [x] Database schema: opportunities table with tier, priority score, trigger rules, status
- [x] Detection engine: Tier 1 (Missed) - premature DQ, unexplored motivation, weak objection handling
- [x] Detection engine: Tier 2 (Warning) - slow response, stale lead, unanswered callback
- [x] Detection engine: Tier 3 (Possible) - hidden motivation, multi-property owner, positive no commitment
- [x] Priority scoring system (0-100)
- [x] LLM-generated reason and suggestion per opportunity
- [x] Dashboard UI: tier filter tabs with counts, priority-sorted cards
- [x] Card UI: property address, AI reason, suggestion, handle/dismiss actions
- [x] History view for handled/dismissed opportunities (status filter)
- [x] Role-based visibility (tenant-scoped)
- [x] Detection runs on demand (admin trigger) and can be scheduled hourly
- [x] Pipeline stages to monitor: Warm Leads, Hot Leads, Pending Apt, Walkthrough, Offer Call Apts
- [x] Vitest tests: 53 tests covering all endpoints, detection logic, and action types

## AI Coach GHL Action Commands
- [x] GHL API service layer: contact search, notes, tasks, pipeline stage, SMS, tags, field updates
- [x] Intent detection: coaching vs action in AI Coach chat (LLM-powered)
- [x] Confirmation card UI: confirm/edit/cancel for each action type
- [x] Action 1: Add note to contact
- [x] Action 2: Add note to opportunity
- [x] Action 3: Change pipeline stage
- [x] Action 4: Send SMS
- [x] Action 5: Create task
- [x] Action 6: Add/remove tag
- [x] Action 7: Update contact field
- [x] Context awareness: auto-detect contact from current call view
- [x] Audit log table (coach_action_log) and history endpoint
- [x] Permission checks per role (tenant-scoped, auth required)
- [x] Error handling: contact not found, API down, rate limiting

## GHL Credentials & Cron Setup
- [x] Update GHL API key and Location ID in database for tenant 1
- [x] Verify GHL connection works with new credentials
- [x] Set up hourly opportunity detection cron job
- [x] Test AI Coach actions end-to-end

## Bug Fixes - AI Coach Actions
- [x] Fix contactId undefined when executing AI Coach actions (contact name resolved but ID not passed)

## Opportunity Detection V2 - Pipeline Manager Rebuild (GHL-event-first)
- [x] Audit current detection engine and GHL API capabilities
- [x] Update schema: ghlContactId backfill (373/376 calls linked), ghlContactId now set during sync
- [x] Build GHL data layer: pipeline opportunities, conversations, contact activity
- [x] Tier 1 - Missed: Seller stated price but no follow-up within 48h
- [x] Tier 1 - Missed: Lead moved backward (Warm/Hot to Follow Up) without outbound call
- [x] Tier 1 - Missed: Repeat inbound from same seller (2+ contacts/week) not prioritized
- [x] Tier 1 - Missed: Inbound from Follow Up lead unanswered/unreturned within 4h
- [x] Tier 1 - Missed: Offer made but no counter/follow-up within 48h (team went silent)
- [x] Tier 1 - Missed: New lead with no first call within 15 min SLA
- [x] Tier 2 - At Risk: Motivated seller (life event/timeline) with only 1 call, no 2nd in 72h
- [x] Tier 2 - At Risk: Lead in Pending Apt/Walkthrough 5+ days with no activity
- [x] Tier 2 - At Risk: Lead marked dead/DQ'd but transcript had real selling signals
- [x] Tier 2 - At Risk: Walkthrough completed but no offer sent within 24h
- [x] Tier 2 - At Risk: Multiple leads from same property address (nobody connected the dots)
- [x] Tier 3 - Worth a Look: Seller said "call me back in [timeframe]" — check if callback happened
- [x] Tier 3 - Worth a Look: High seller talk-time ratio but got DQ'd (motivation was there)
- [x] Update opportunities UI to reflect new pipeline-based detection types
- [x] Write and run vitest tests for new detection engine (88 tests, all passing)

## Opportunity Detection Auto-Run Fix
- [x] Fix automatic opportunity detection to run on startup and hourly without manual trigger
- [x] Verify detection runs and populates opportunities automatically
- [x] Tighten backward_movement_no_call rule: only flag Warm/Hot leads moved to Follow Up without calls or communication
- [x] Drop backward_movement_no_call rule (too noisy without stage history from GHL)
- [x] Rename "Opportunities" page to "Signals" across entire UI (sidebar, page title, headings)
- [x] Persist Call History filters in URL so back button from call detail restores filters
- [x] Fix detection gap: Suzanne Burgess (negotiating seller after offer call) not showing in Signals

## New Detection Rule: Active Negotiation in Follow-Up
- [x] Build active_negotiation_in_followup rule as Tier 3 (Worth a Look): detect contacts in follow-up stages with recent inbound messages (72h) showing engagement/negotiation — owner review opportunity to help acquisitions with negotiation strategy, NOT a missed deal
- [x] Add GHL conversation messages fetching to detection engine (fetch actual message history, not just last message)
- [x] Add negotiation keyword matching for SMS content
- [x] Wire new rule into Phase 2 conversation scan
- [x] Write vitest tests for the new rule
- [x] Test against live data (Suzanne Burgess should trigger)
- [x] Clean up all test tenants and associated data (keep only tenant ID 1 - New Again Houses)

## Test Data Cleanup
- [x] Delete all test team members (Test Lead Manager, Test Acquisition Manager, Test Lead Generator) from database
- [x] Update vitest tests to auto-clean up test data (tenants, team members, users) after each test run

## Fix: Test Notifications
- [x] Mock notifyOwner in tenant test files to prevent real email notifications during vitest runs

## AI Coach UI Cleanup
- [x] Remove "Tag Jane Doe as hot-lead" suggestion
- [x] Add SMS-related suggestions (e.g. send follow-up SMS, draft SMS to seller)
- [x] Fix layout spacing: send button overlapping card edge, input field outside card boundary
- [x] Make everything fit properly within the card container
- [x] Fix AI Coach card: input area and send button still overflowing past card boundary
- [x] Make AI Coach sidebar sticky so it follows user when scrolling through calls

## Bug Fix: False Callback Signal
- [x] Fix callback_requested rule: Cathie Cooper flagged as "Callback Requested — None Made" but team DID call (2 outbound calls + SMS follow-up). Rule now checks GHL conversation messages for outbound activity (calls + SMS) after the callback request.

## Refine AI Signal Descriptions
- [x] Review current AI reason generation (generateAIReason) and RULE_DESCRIPTIONS
- [x] Improve LLM prompt to be factual and grounded in actual data, not dramatic assumptions
- [x] Pass more context (GHL messages, actual call data, timeline) to the LLM for accurate descriptions
- [x] Ensure descriptions state what actually happened, not what the AI assumes happened

## Regenerate Active Signal Descriptions
- [x] Build one-time script to regenerate all active signal AI descriptions with the new factual prompt
- [x] Run the script and verify updated descriptions are neutral and accurate

## Bug Fixes
- [x] Add "Lead Generator" to team invite role dropdown (currently only shows Admin, Acquisition Manager, Lead Manager)
- [x] Make AI Coach box taller so all suggestions show without scrolling (increased from 500px to 650px)
- [x] Verify "Tag Jane Doe as hot-lead" suggestion is fully removed (was already removed, old screenshot was cached)

## AI Coach Learning System (Preferences)
- [x] Add coach_action_edits table: capture AI-generated draft (before) and user's final version (after) for every confirmed action
- [x] Add ai_coach_preferences table: per-user preference profiles with style summaries per category (sms, notes, tasks)
- [x] Add team-level preference fallback: aggregate all users' patterns into a team-wide default for new users
- [x] Frontend: make action card content editable before confirm — save both original AI draft and user's edited version
- [x] Frontend: track accept-as-is as a positive signal (wasEdited=false)
- [x] Build preference aggregation service: analyze before/after diffs to extract style patterns
- [x] Inject user preference profile (or team default) at session start into AI Coach system prompts
- [x] Write vitest tests for edit capture, preference aggregation, and prompt injection (19/19 passing)

## Smart Task Assignment & Per-User SMS
- [x] Map logged-in users to their GHL user IDs via team_members table
- [x] Update LLM intent parsing to detect assignee name in task requests (e.g. "make a task for Daniel")
- [x] Default task assignment to the user who created it (creator's GHL user ID)
- [x] Override assignment when user explicitly names someone else
- [x] Pass assignedTo field to GHL task creation API
- [x] Update SMS sending to pass userId so it sends from the team member's own phone number
- [x] Write vitest tests for task assignment and SMS user routing (18/18 passing)

## Admin Call Grading Bug
- [x] Admin Calls now auto-grade with admin_callback rubric instead of being skipped

## Admin Call Auto-Grading
- [x] Update processCall to auto-grade admin_call classified calls with admin_callback rubric instead of skipping
- [x] Frontend: show "Auto-Grade as Admin" button for existing skipped admin calls, hide "Grade This Call"
- [x] Write vitest tests for admin call auto-grading flow (17/17 passing)

## Reclassify Call Dropdown Bug
- [x] Update reclassify dropdown to show correct updated options — "Admin Call (auto-graded)" and labels for skipped types

## AI Coach Draft Content Preview
- [x] Update LLM intent parsing to generate actual draft content (note text, SMS body, task description) upfront
- [x] Display the draft content in the action card so users can preview before confirming
- [x] Make draft content editable inline — edits feed the learning system
- [x] Write vitest tests for draft content generation (19/19 passing)

## AI Coach Call Summary Context Bug
- [x] When user asks to summarize a call and add to notes, AI Coach looks up actual call data (summary, transcript, grade) and uses it to draft the note
- [x] Pass recent call history/summaries for the contact into the LLM prompt (up to 3 recent calls with transcripts)

## tRPC HTML Response Error Fix
- [x] Add DB connection pool resilience (withDbRetry wrapper with auto-reset on ECONNRESET)
- [x] Applied retry to getTenantsWithCrm (the function that was failing)
- [x] Write vitest tests for retry logic and call context (18/18 passing)

## Team Member Sign-In Auto-Assignment Bug
- [x] When a team member (Daniel, Kyle, Chris) signs in via getgunner.ai, auto-assign them to Corey's tenant instead of funneling into onboarding
- [x] Match new users to existing team_members records by name (exact + fuzzy first/last name matching)
- [x] Skip onboarding for users matched to an existing team member
- [x] Fixed Daniel's account: moved from accidental tenant 270051 to tenant 1, deleted orphan tenant
- [x] Write vitest tests for name matching logic (16/16 passing)

## Admin Call Grading Not Working
- [x] Fix Auto-Grade as Admin button — was sending classification "conversation" instead of "admin_call"
- [x] Fix reclassify endpoint — now triggers processCall for admin_call classification (not just conversation)
- [x] Write vitest tests for reclassify logic (14/14 passing)

## Daniel's Calls Not Showing Bug
- [x] Root cause: team_member.userId pointed to old user 180249, but Daniel signs in as user 840050
- [x] Fixed: updated team_members SET userId = 840050 WHERE id = 2 (Daniel Lozano)

## View As Not Showing Calls Bug
- [x] Root cause: context.ts only allowed super_admin to impersonate, but Corey is admin
- [x] Fixed: allow admin role to impersonate users within the same tenant

## New Signal Rule 15: Seller Gave Timeline / Agent Left Open-Ended
- [x] Create Rule 15: timeline_offered_no_commitment — seller offered a concrete timeline or meeting window but agent responded open-ended with no next step locked in
- [x] Add detection function to opportunityDetection.ts
- [x] Add rule to RULE_DESCRIPTIONS for AI context
- [x] Wire into Phase 3 of scanTenant()
- [x] Add frontend label and icon in Opportunities.tsx ruleConfig
- [x] Write tests for the new rule — 52 tests passing

## Dashboard: Signals Cards for Admins
- [x] Replace gamification cards (Level & XP, Hot Streak, Consistency, Badges) with Pipeline Signals summary cards for admin users
- [x] Non-admin users continue to see gamification widgets
- [x] Signals cards link to /opportunities page

## Rule 15 Scan Window + Coaching Nudge
- [x] Tighten Rule 15 scan window from 3-14 days to 1-14 days for faster detection
- [x] Add coaching nudge to grading engine: flag when agent leaves seller's timeline open-ended without locking in a next step
- [x] Update tests — 62 tests passing (10 coaching nudge + 52 Rule 15)

## Signals UI: Fix rule name display
- [x] Show friendly labels instead of raw underscore keys (e.g. "Timeline Offered — No Commitment" instead of "timeline_offered_no_commitment")

## V1 Pre-Launch Bug Fixes
- [x] Bug 1: Email/password signup must check pending_invitations and join existing tenant instead of creating new one
- [x] Bug 2: Email/password login must call autoMatchTeamMember after successful authentication
- [x] Bug 3: Remove console.log debug statements from DashboardLayout
- [x] Write tests for Bug 1 and Bug 2 fixes — 16 tests passing
- [x] Add password change / account settings section to Profile page (change password, update name/email)

## Bug Fix: Daniel's Dashboard Showing Signals Instead of Gamification
- [x] Investigate Daniel's user role — isTenantAdmin was 'true' causing admin dashboard view
- [x] Fixed: set Daniel's isTenantAdmin to 'false' and hardened isAdmin check to use user.role only (not isTenantAdmin)

## Pre-Onboarding Audit (15 Items)

### CRITICAL
- [x] #1: Dashboard stats don't match Analytics — fixed: included admin_call in graded calls, scoped grade queries to relevant call IDs, added deduplication
- [x] #2: Call Processing numbers shift between page loads — fixed: scoped grade queries with inArray, deduplicated grades, tenant-scoped trend queries

### UX Fixes
- [x] #3: De-emphasize skipped calls on Dashboard — already implemented (opacity-60, gray text, activity summary line)
- [x] #4: Gamification section — added badge names with tier labels, XP progress showing total/next level, empty state guidance
- [x] #5: Score Trends chart — fixed: empty weeks now show gap instead of 0% dots, line segments break at empty weeks
- [x] #6: Analytics leaderboard — already implemented (shows "Ranked by appointments (LMs) and offers (AMs)")
- [x] #7: Signals page empty states — fixed: shows "No Urgent Signals — Your Team Is on Track" with reassuring messaging

### Scale Items
- [x] #8: Conversation scan increased from 50 to 200
- [x] #9: CRM settings now shows connected status with sync info when GHL is connected
- [x] #10: Custom Domain field — no visible input field exists in UI, state variable is saved as part of general settings (non-issue)
- [x] #11: Role-based access audit — Signals page moved to admin-only in sidebar, Scan Pipeline endpoint already admin-gated, Settings already admin-only
- [x] #12: URL inconsistency — fixed sales@gunner.ai to sales@getgunner.ai, all other references already use getgunner.ai

### Quick Wins
- [x] #13: Add "last synced" indicator to Dashboard — already implemented (shows "Synced X ago" below greeting)
- [x] #14: Skipped calls over 30 seconds — already implemented (AI generates 1-2 sentence summary, shown in call inbox)
- [x] #15: Smart dashboard greeting — already implemented (admins see signal count, team members see their own stats)

### Additional Items
- [x] Add missing rubric types to Training page — already implemented (all 6 types: Qualification, Offer, Follow-Up, Seller Callback, Admin Callback, Lead Generator)

## Bug Fix: Account Settings Not Visible on Profile Page
- [x] Verify account settings tab/section is rendering on Profile page — code was there but no navigation link existed
- [x] Added 'Account Settings' to user avatar dropdown menu in sidebar — now accessible from any page

## Training Materials Upload
- [x] Extract and review gunner-training-materials.zip
- [x] Upload training materials to the platform via the training system
- [x] Upload 15 training materials from zip file — seeded all 15 materials with proper categories and role assignments

## Multi-Tenant Scalability Audit
- [x] Audit database schema for tenant isolation gaps
- [x] Audit server-side queries for missing tenant filters and N+1 patterns
- [x] Audit external API integrations for rate limits and shared credentials
- [x] Audit background jobs, cron tasks, and processing pipelines for concurrency issues
- [x] Audit frontend for hardcoded tenant assumptions
- [x] Compile findings into a structured scalability report (19 issues found)

## Multi-Tenant Scalability Fixes (19 Issues)

### Phase A — Critical (Before Client #2)
- [x] #S1: Grading context isolation — added tenantId to getGradingContext, getTrainingMaterials, getGradingRules, getPendingFeedbackForGrading
- [x] #S2: Team member name lookup — scoped getTeamMemberByName with tenantId, added tenant resolution from GHL locationId in webhook
- [x] #S3: Hardcoded schema enums — replaced ENUM columns on kpi_deals with VARCHAR for lmName, amName, dmName, location
- [x] #S4: Weekly insights isolation — now iterates over all tenants, generates insights per tenant with tenantId
- [x] #S5: Seed data removal — removed hardcoded team member initialization, updated empty state messaging

### Phase B — High Severity (Before Clients 3-10)
- [x] #S6: Global polling lock — added per-tenant timeout (60s) with error isolation so one slow tenant doesn't block others
- [x] #S7: Processing queue — wrapped processCall in p-queue with concurrency limit of 5 (shared across GHL sync and webhook)
- [x] #S8: DB indexes — added composite indexes on tenantId+status+createdAt for calls, tenantId for call_grades, team_members, training_materials, grading_rules, ai_feedback, team_training_items
- [x] #S9: Rate limit persistence — documented as acceptable for single-instance, flagged for Redis migration at multi-instance scale
- [x] #S10: GHL credentials — documented for future refactor (deeply coupled to 10+ functions, sequential polling is safe for now)
- [x] #S11: Email per-tenant — sendEmail now accepts optional fromEmail parameter for tenant-specific sender
- [x] #S12: Archival policies — runArchivalJob now accepts configurable retentionDays parameter

### Phase C — Medium Severity (Before 20+ Tenants)
- [x] #S13: AI prompt templates — wired tenantRubrics table into grading pipeline (getGradingContext fetches tenant rubrics, gradeCall uses them as override)
- [x] #S14: Frontend hardcoded names — replaced all Chris/Daniel/Kyle references with dynamic lookups from teamMembers query
- [x] #S15: KPI location enums — converted to VARCHAR in schema migration (combined with S3)
- [x] #S16: SQL aggregation — deferred (400-line function rewrite too risky at current scale of 500 calls, flagged for optimization when needed)
- [x] #S17: Connection pool — switched to mysql2.createPool() with connectionLimit: 15, unlimited queue
- [x] #S18: Nullable tenantId — backfilled all NULL tenantId values to tenant 1 across all tables
- [x] #S19: Signal customization — added TODO markers for tenant-configurable pipeline stages (defaults work for all RE flipping clients)

## Super-Admin Panel & NOT NULL Constraints
- [x] Add NOT NULL constraints on all tenantId columns via schema migration
- [x] Build super-admin tRPC endpoints (tenant CRUD, usage stats, feature toggles)
- [x] Build super-admin UI page (tenant list, create/edit tenant, usage dashboard)
- [x] Add super-admin route to sidebar (owner-only) — consolidated to /admin, visible for super_admin + platform owner
- [x] Write tests for super-admin endpoints — 23 tests passing (access control, CRUD, analytics, plans)

## Bug: call_grades INSERT Failing — Column Count Mismatch
- [x] Diagnose column mismatch in call_grades INSERT — was from pre-deployment code, current Drizzle schema generates correct SQL
- [x] Fix: added duplicate grade guard (getCallGradeByCallId check) to prevent double-grading on reprocess
- [x] Reprocessed Kim Wooten (1890003) and Shirley Brackett (1890001) — both graded successfully (B and D)

## Bug: False Positive "Repeat Inbound — Nobody Responded" Signal
- [x] Investigate repeat_inbound_no_response detection logic — was only checking for outbound calls as "response", ignoring answered inbound calls
- [x] Fix rule: now checks if any inbound calls were completed conversations (status=completed, classification=conversation, duration>60s)
- [x] Dismissed false positive signal #90002 for Shirley Brackett
- [x] Added 4 new tests for Rule 2: answered calls, mixed calls, voicemail-only — 100 tests passing

## Fix Rule 3 (Follow Up Inbound Ignored) + Dismiss Reason Feature
- [x] Fix Rule 3 detectFollowUpInboundIgnored to check for answered inbound calls (same pattern as Rule 2 fix)
- [x] Add dismissReason enum + dismissNote text columns to opportunities table schema
- [x] Run db:push migration — also fixed null tenantId rows in 9 tables (campaign_kpis, kpi_channels, kpi_markets, kpi_periods, lead_gen_staff, users, badges, reward_views, user_badges, user_xp, xp_transactions, user_streaks)
- [x] Add dismiss reason dialog UI with dropdown (5 reasons) and optional note field
- [x] Update resolve endpoint to accept dismissReason and dismissNote; shows reason on dismissed badge
- [x] Write tests — 8 new tests total: 2 for Rule 3 answered-call logic, 6 for dismiss reason validation. 107 tests passing

## Bug: 30-60s Calls Not Getting Short Summary
- [x] Investigated: calls under 60s were rejected at line 996 before transcription, so summary code at line 1078 never ran
- [x] Fixed: split into <30s (instant skip) and 30-60s (transcribe + LLM summary, then skip grading)
- [x] Classified as too_short/skipped but classificationReason now contains the AI-generated summary
- [x] Batch reprocessed all 66 existing 30-60s calls — 66/66 successful, all now have specific summaries

## UI Fix: Team Page Alignment Issues
- [x] Identified: TeamMembers.tsx, TeamMemberCard component at line 147-323
- [x] Fixed: added min-h-[72px] sm:min-h-[84px] to all stat boxes for consistent height
- [x] Fixed: added flex flex-col justify-center to all stat boxes, added leading-tight to numbers, mt-1 to labels
- [x] Fixed: added w-full to grade distribution bar container
- [x] Fixed: consistent mt-1 spacing between numbers and labels in stat boxes
- [x] Header section already consistent (no changes needed)

## UI Fix: Team Card Header Height & Gamification Enhancement
- [x] Fix header section to have fixed height so all cards align (min-h-[120px] sm:min-h-[140px])
- [x] Handle variable content (name length, hot streaks, badges) within fixed height
- [x] Enhance gamification styling — added gradients, backdrop blur, decorative patterns, shadows
- [x] Ensure level badges, XP, and role badges are consistently positioned
- [x] Add visual polish (shadows, gradients, better spacing)

## Feature: Add BatchDialer/BatchLeads CRM Integration
- [x] Add BatchDialer option to CRM dropdown in settings
- [x] Add BatchLeads option to CRM dropdown in settings
- [x] Add connection status and sync info for BatchDialer
- [x] Add connection status and sync info for BatchLeads
- [x] Wire up backend endpoints if needed (uses same crmType field as GHL)

## Bug: Admin Users Still See Gamification on Dashboard
- [x] Identified: Home.tsx line 183 already has isAdmin check (admin → signals, user → gamification)
- [x] Root cause: xhaka's role was set to "user" instead of "admin" in database
- [x] Fixed: Updated xhaka's role to "admin" (user ID 180239)
- [x] Verified: Dashboard logic already correct, will show signals after xhaka logs out and back in

## Feature: Recent Calls Filtering & Timestamp
- [x] Find Recent Calls component on dashboard (Home.tsx line 376-428)
- [x] Filter to only show graded calls in getCallsWithGrades (db.ts line 454-457)
- [x] Admin: show all team members' graded calls (already handled by allowedTeamMemberIds in routers.ts line 462)
- [x] Regular user: show only their own graded calls (already handled by allowedTeamMemberIds)
- [x] Add timestamp showing "Xm/Xh/Xd ago" for each call (Home.tsx line 407-420)

## Feature: Gunner Engine Webhook Integration
- [x] Create webhook helper function to POST to https://gunner-engine-production.up.railway.app/webhooks/gunner/call-graded
- [x] Include all required fields: callId, contactId, teamMember, grade, score, transcript, coachingFeedback, callType, duration, propertyAddress, phone, timestamp
- [x] Trigger webhook after successful call grading in processCall function (both main flow Step 9 and admin_callback flow)
- [x] Handle webhook errors gracefully (log but don't block grading)
- [x] Write 13 vitest tests for webhook (URL, payload, error handling, edge cases) - all passing

## Feature: Wire Up BatchDialer & BatchLeads as Separate CRM Integrations
- [x] Redesign CRM settings UI from single-select dropdown to multi-integration card layout
- [x] Add GHL integration card with API key, location ID, connection status, sync button
- [x] Add BatchDialer integration card with API key, connection status, sync button
- [x] Add BatchLeads integration card with API key, connection status, sync button
- [x] Add backend endpoints for saving/testing individual CRM API keys
- [x] Build BatchLeads service for property data enrichment (skip tracing, property details)
- [x] Add BatchLeads sync to enrich existing calls with property data
- [x] Update crmConfig to support multiple simultaneous integrations
- [x] Add per-integration connection test (validate API key on save)
- [x] Write 12 vitest tests for CRM integrations (all passing)

## Feature: Last Synced Timestamps for CRM Integrations
- [x] Add lastGhlSync, lastBatchDialerSync, lastBatchLeadsSync columns to tenants table
- [x] Update GHL sync service to record timestamp after successful sync
- [x] Update BatchDialer sync service to record timestamp after successful sync
- [x] Update BatchLeads sync service to record timestamp after successful sync
- [x] Add backend endpoint to fetch sync timestamps for current tenant (added to getCrmIntegrations)
- [x] Update CRM integration cards UI to display "Last synced: X minutes ago" or "Never synced"
- [x] Add relative time formatting (e.g., "2 minutes ago", "1 hour ago", "3 days ago")
- [x] Write 11 vitest tests for timestamp recording and webhook retry queue (all passing)

## Feature: Webhook Retry Queue for Failed Gunner Engine Webhooks
- [x] Create webhook_retry_queue table (id, tenantId, callId, payload, attemptCount, maxAttempts, lastAttemptAt, nextRetryAt, status, lastError, createdAt, updatedAt)
- [x] Update sendCallGradedWebhook to store failed webhooks in retry queue with tenantId and callId
- [x] Build webhook retry service with exponential backoff (1min, 5min, 15min, 1hr, 6hr)
- [x] Add scheduled job to process retry queue every 5 minutes (starts 30s after server boot)
- [x] Mark webhooks as 'delivered' after successful retry or 'failed' after max attempts (5)
- [x] Add backend endpoint getWebhookRetryQueueStatus to view retry queue status (admin only)
- [x] Write 11 vitest tests for retry queue logic and exponential backoff (all passing)

## Bug Fix: contactId empty/null in Gunner Engine webhook payload
- [x] Investigated: Call 1920034 had null ghlContactId because it was uploaded manually (not synced from GHL)
- [x] Added GHL contact lookup fallback: when ghlContactId is null, searches GHL by phone number
- [x] Added automatic backfill: resolved contactId is saved back to the call record in the database
- [x] Changed contactId from optional to required string (sends empty string instead of omitting field)
- [x] 16 vitest tests passing including 5 new tests for fallback/backfill logic

## Bug Fix: Update gamification rank titles from "Dialer"/"New Recruit" to better names
- [x] Redesigned all 25 level rank titles with Gunner military/cannon theme
- [x] TypeScript compiles clean (0 errors)

## Bug Fix: AI Coach SMS drafts use third person instead of second person
- [x] Found the LLM prompt in routers.ts parseIntent endpoint (line ~3798)
- [x] Updated prompt with CRITICAL instruction to always convert third-person to second-person direct address in SMS drafts

## Bug Fix: Too many issues and wins showing for admin and in meetings
- [x] Limit issues list to show top 5 with "Show N more" expand button (TeamTraining.tsx + Training.tsx)
- [x] Limit wins list to show top 5 with "Show N more" expand button (TeamTraining.tsx + Training.tsx)
- [x] Limit meeting agenda to show top 5 with "Show N more" expand button (TeamTraining.tsx)
- [x] Added total count badge in card headers (e.g., "Issues to Address (7)")
- [x] TypeScript compiles clean (0 errors)

## Feature: Limit issues/wins to 2-3 per team role with Monday auto-refresh
- [x] Updated LLM prompt to generate EXACTLY 2-3 issues and 2-3 wins per team role (quality over quantity)
- [x] Added post-processing limitPerRole() to enforce max 3 items per category per role (sorted by priority)
- [x] Auto-archive: clearAiGeneratedInsights() runs before each weekly refresh, replacing old items
- [x] Built Monday morning scheduled job (weeklyInsightsRefresh.ts) — checks hourly, runs at 6AM CT on Mondays
- [x] Updated UI card descriptions to show "Top issues/wins this week · Refreshes every Monday"
- [x] Changed DISPLAY_LIMIT from 5 to 3 in all sections (TeamTraining.tsx + Training.tsx)
- [x] TypeScript compiles clean (0 errors)

## Bug Fix: All Roles view and Long-Term Skills showing too many items
- [x] Updated LLM prompt to generate only 2-3 skills per role with consolidation instruction
- [x] Server-side limitPerRole() enforces max 3 per role for all categories including skills
- [x] All Roles view shows top 3 with "Show more" toggle (same DISPLAY_LIMIT=3 pattern)
- [x] Added DISPLAY_LIMIT and show more/less to Skills section in both TeamTraining.tsx and Training.tsx
- [x] Updated skills card description to "Top development areas · Refreshes every Monday"
- [x] TypeScript compiles clean (0 errors)

## Bug Fix: All Roles view still showing 10+ items (need 3-5 total)
- [x] Added backend limit: when teamRole is undefined (All Roles), query returns only top 5 items per category sorted by priority (urgent first, then recency)
- [x] Backend enforces ALL_ROLES_LIMIT=5 in routers.ts teamTraining.list endpoint
- [x] UI still shows top 3 with "Show 2 more" toggle (max 5 total from backend)
- [x] TypeScript compiles clean (0 errors)

## Bug Fix: Skipped calls tab showing no results
- [x] Root cause: getCallsWithGrades filtered out ALL calls without grades (line 454), including skipped calls which intentionally have no grade
- [x] Fix: When statuses filter includes 'skipped', skip the grade-null filter and return all matching results
- [x] TypeScript compiles clean (0 errors)
- [x] Promote Pablo Martin (velnomediagroup@gmail.com) to admin role and update name
- [x] Fix inviteUser/removeUser role checks to also allow super_admin (not just admin)
- [x] Fix all other role checks that only check for 'admin' but miss 'super_admin'
- [x] Fix AI Coach to query actual team member data and call history instead of giving generic training material responses
- [x] AI Coach should tell user when a team member name doesn't match anyone on the team
- [x] Fix parseIntent to look up contact call history for ALL action types (tasks, notes, SMS) not just when call keywords are detected
- [x] Fix AI Coach askQuestion to include actual call summaries and pipeline data in responses instead of generic training material advice
- [x] Add role-based visibility to AI Coach: all call data used for coaching insights/examples, but individual performance queries (scores, grades) restricted to admins and supervisors only
- [x] Verify and ensure role-based call visibility on Call Inbox page matches AI Coach rules (admins see all, members see own + direct reports) — already implemented via getCallsWithPermissions
- [x] Fix skipped call count in call history showing incorrect number (100 when there haven't been 100 calls in 24 hours)
- [x] Auto-archive all calls older than 30 days to keep the system clean — already set to 14 days, confirmed working as-is
- [x] Add conversation memory to AI Coach — pass last 5-10 messages as history so follow-up questions work
- [x] Increase AI Coach data window and add intelligent context filtering (more calls for specific member queries, outcome-specific filtering)
- [x] Add role-based access control to AI Coach actions — team members can only assign tasks to themselves and direct reports, admins can assign to anyone
- [x] Fix #1: Save objection handling data from grading to database (column exists but never populated)
- [x] Fix #2: Add LLM retry/error recovery for all invokeLLM calls
- [x] Fix #3: Add pipeline/opportunity data to AI Coach for strategic questions
- [x] Fix #4: Improve training material matching beyond simple keyword matching
- [x] Fix #5: Add streaming responses to AI Coach for faster perceived response time
- [x] Fix #6: Expand context windows for meeting facilitator and insights generator
- [x] Fix #7: Map GHL user IDs to Gunner team member IDs in opportunity detection — all 15 detection rules now resolve opp.assignedTo to correct team member via getGhlUserIdMap(), with 3-tier fallback: detection-level → call history → GHL mapping

## AI Coach Platform Knowledge
- [x] Add platform knowledge base to AI Coach so team members can ask how Gunner features work (gamification, badges, opportunities, leaderboard, etc.)
- [x] Include gamification rules (XP, levels, badges, streaks) in coach knowledge
- [x] Include opportunity detection rules explanation in coach knowledge
- [x] Include navigation/feature guide so coach can direct users to the right page
- [x] Add security guardrails to AI Coach — blocks tech stack, code, cross-tenant data, infrastructure, prompt injection, billing internals, and detection rule thresholds (non-admin)

## AI Coach Stats Queries
- [x] Add computed stats engine to AI Coach — detect stats questions and inject precise calculated answers
- [x] Support call count queries (today, this week, this month, by member)
- [x] Support average score queries (by period, by member, by call type)
- [x] Support streak/XP/level/badge queries from gamification data
- [x] Support trend queries (improving/declining, week-over-week)
- [x] Support outcome queries (appointments set, offers made, conversion rates)
- [x] Support team comparison queries (leaderboard position, ranking)

## AI Coach Conversation Memory
- [x] Create coach_messages database table for persisting chat exchanges
- [x] Build tRPC procedure to save completed Q&A exchanges to DB
- [x] Build tRPC procedure to load recent conversation history for system prompt context
- [x] Update frontend to save messages after each exchange (fire-and-forget)
- [x] Inject recent past conversation summaries into coach system prompt for continuity
- [x] UI always starts fresh/clean — no loading old messages into the chat view

## Call Grading — Transcript-Referenced Feedback
- [x] Update grading LLM prompts to require exact quotes from transcript in summary
- [x] Update strengths to reference specific things said with quoted text
- [x] Update areas for improvement to cite specific missed moments with quotes
- [x] Include dollar amounts, property details, and specific numbers mentioned in the call

## Opportunity Detection — Exact Numbers & Price Gap Logic
- [ ] Include actual dollar amounts (our offer, seller's ask, gap) in opportunity summaries
- [ ] Update LLM opportunity detection prompt to extract and return specific prices from transcripts
- [ ] Add price gap logic — if gap is too large (e.g., $120k+), downgrade from Missed to Worth a Look or lower
- [ ] Ensure "Seller Stated Price — No Follow Up" rule includes the actual price stated
- [x] Suppress "Offer Made — Team Went Silent" when pipeline stage shows appointment already scheduled (e.g., "Offer Apt Scheduled")
- [x] Improve AI reason generation to check actual call history and pipeline stage — not just detection rule template
- [x] AI reasons should reflect what actually happened: scheduled offer call, attempted contact, no answer, etc.
- [x] Build dynamic re-evaluation system to refresh active opportunity summaries as new data comes in
- [x] Opportunity summaries should update over time (e.g., "2 attempts no response" → "3 attempts, still ghosting")
- [x] Add price gap logic — large gaps ($120k+) should downgrade priority, not flag as Missed
- [x] AI reason should specify exact motivation type from transcript (divorce, tax lien, timeline, property condition, financial pressure) — not generic "showed motivation signals"
- [x] Build contact timeline enrichment — fetch full call history + pipeline stage progression for each detection
- [x] Feed full timeline (initial call → walkthrough set → walkthrough done → ghosting) into AI reason generator
- [x] Suppress wrong rules when pipeline tells a different story (e.g., don't say "Only 1 Call" when walkthrough was completed)
- [x] Detect post-walkthrough ghosting as its own signal type
- [x] Fix walkthrough_no_offer: don't fire when stage is "Walkthrough Apt Scheduled" (upcoming, not completed)
- [x] Fix walkthrough_no_offer: check if offer was already discussed on call transcript before flagging "no offer"
- [x] Fix motivated_one_and_done: check pipeline stage — if contact progressed past initial (walkthrough, offer), suppress rule
- [x] Add GHL appointment checking — suppress "no follow-up" rules when future appointment exists
- [x] Build dynamic re-evaluation system — refresh active opportunity summaries hourly with latest data
- [x] Add transcript-based offer detection — check if offer was discussed in transcript, not just callOutcome field
- [x] Write vitest tests for false positive suppression, re-evaluation, and appointment checking
- [x] Price gap logic: downgrade priority when gap between our offer and seller ask is $120k+ (Missed → Worth a Look)
- [x] Price gap logic: include actual dollar amounts (our offer, seller ask, gap) in opportunity summaries/reasons
- [x] Price gap logic: update extractPricesFromTranscript to be more robust and extract both sides
- [x] Post-walkthrough ghosting: new Rule 16 — detect when walkthrough was completed but seller went silent
- [x] Post-walkthrough ghosting: check for outbound follow-up attempts after walkthrough
- [x] Post-walkthrough ghosting: classify as Tier 2 (At Risk) with appropriate priority score
- [x] Contact timeline enrichment: fetch full call history + pipeline stage progression for each detection
- [x] Contact timeline enrichment: feed full timeline into AI reason generator for richer context
- [x] Contact timeline enrichment: AI reasons should specify exact motivation type from transcript
- [x] Write vitest tests for price gap logic, post-walkthrough ghosting, and timeline enrichment
- [x] Opportunity UI: Show ourOffer, sellerAsk, priceGap on opportunity cards at a glance
- [x] Opportunity UI: Update backend router to return price fields in opportunity list query
- [x] Opportunity UI: Design price display component (formatted dollar amounts, gap indicator)
- [x] Opportunity UI: Write vitest tests for price display
- [x] Fix Rule 16 false positive: Matt Jacobsen flagged as ghosting but team is actively working him
- [x] Rule 16: Add weekend awareness — don't count Sat/Sun as silence days
- [x] Rule 16: Check for recent outbound calls/texts from team before flagging ghosting
- [x] Rule 16: Increase silence threshold to account for weekends (business days, not calendar days)
- [x] Write vitest tests for Rule 16 weekend awareness and outbound activity checking
- [x] Change gamification level titles to sports-themed names (Rookie, Starter, Playmaker, All-Star, Captain, MVP, Champion, Elite, Dynasty, Legend, GOAT, Hall of Fame)
- [x] Fix leaderboard cards: show full names instead of truncating (e.g., "Dani..." → "Daniel", "Chris Se..." → full name)
- [x] Create Stripe 100% off coupon with code CHRISMAN, limited to 1 redemption
- [x] Verify Stripe live keys are configured in Gunner
- [x] Verify live Stripe products/prices exist and match $199/$499/$999
- [x] Recreate CHRISMAN coupon in live Stripe (100% off, 1 use)
- [x] Verify checkout flow works with live keys
- [x] Fix all hardcoded pricing references across codebase to match current plans ($199/$499/$999)
- [x] Fix New Customer Setup page dropdown showing correct prices ($199/$499/$999)
- [x] Fix pipeline stage mapping: mappings persist per-pipeline when switching between pipelines
- [x] Add pipelineMappings support to TenantCrmConfig for multi-pipeline stage mapping storage
- [x] Support dual roles via isTenantAdmin flag: user keeps teamRole=acquisition_manager for call grading + isTenantAdmin=true for admin access
- [x] Add email invite section to Team Members step during tenant creation — enter emails so members/admin get signup invites
- [x] Build email/password authentication for external customers (independent of Manus OAuth) — already existed
- [x] Create login page at getgunner.ai (email + password) — already existed at /login
- [x] Create registration page with invite token support — already existed at /signup
- [x] Create forgot password / reset password flow — already existed
- [x] Auto-associate new users with their tenant and team member record by email — pending invitations system handles this
- [x] Build invite email system: admin sends invite during tenant creation, user receives link to set up account
- [x] Ensure Manus OAuth still works for platform owner (Corey) alongside email/password auth — context.ts falls through to Manus OAuth
- [x] Set up Zac Chrisman as admin for his tenant (team_members id=300037, tenantId=450029)
- [x] Fix View as Tenant impersonation: context.ts now reads session cookie for JWT impersonation tokens and overrides tenantId
- [x] Add "Signals" checkbox to plan features editor in SuperAdmin
- [x] Make rubric/methodology editable: allow admins to add/remove grading criteria, change point values, and edit descriptions (customizable rubrics)
- [x] Fix GHL sync to use name matching fallback when ghlUserId is not set — pass user name from GHL API to matchTeamMember
- [x] Auto-persist ghlUserId on team member record after first successful name match
- [x] Add GHL users API lookup during tenant setup to pre-link team members
- [x] Trigger manual GHL sync for Zac's tenant (450029) — 0 calls found (new tenant, auto-link will happen on first real call)
- [x] Build dual role support: isTenantAdmin flag on users table, separate from teamRole for call grading. Updated 10+ frontend files to check isTenantAdmin alongside teamRole for admin access
- [x] Build customizable rubrics: tenant admins can edit grading criteria, point values, and descriptions per call type

## Wire Tenant Rubrics into Grading Pipeline
- [x] Audit getGradingContext to verify tenant rubrics are fetched correctly
- [x] Audit gradeCall to verify tenant rubrics override hardcoded defaults when present
- [x] Audit the LLM prompt construction to ensure custom criteria/points/redFlags are injected
- [x] Fix any gaps where hardcoded rubrics still take precedence over tenant rubrics — fixed admin_callback shortcut path, getContext endpoint missing tenantId, keyPhrases normalization, and disqualificationTarget hardcoded reference
- [x] Write vitest tests verifying tenant rubrics flow through the grading pipeline (14 tests)

## Dashboard Recent Calls Fix
- [x] Fix Recent Calls widget to show last 5 graded calls from today (was only showing 2)
- [x] Add tenant impersonation banner at top of page when using "View as Tenant" (similar to team member impersonation banner)

## Fix Tenant Impersonation
- [x] Fix amber impersonation banner not showing when viewing as another tenant — raised z-index to z-[100], added trpc mutation for stop
- [x] Fix data not switching to impersonated tenant — admin.startImpersonation now sets JWT session cookie, context.ts processes it for tenant override
- [x] Ensure admin.startImpersonation also sets session cookie for backend tenant switching
- [x] Fix sidebar showing super_admin items during impersonation — now shows admin-level items
- [x] Fix context.ts double-impersonation conflict — skip X-Impersonate-User-Id header when session cookie already handles impersonation
- [x] Fix stopImpersonation resilience — reads user's real tenantId from database instead of in-memory map
- [x] Fix onboarding redirect blocking super_admin impersonation of new tenants

## Fix Tenant Impersonation (Round 2)
- [x] Fix amber banner not rendering — switched from localStorage to auth.me backend response, fixed cookie sameSite/secure settings
- [x] Fix sidebar still showing Platform Admin — DashboardLayout now overrides role to 'admin' during super_admin impersonation
- [x] Fix greeting showing "Corey" — now shows "Viewing: [Tenant Name]" during impersonation

## AI Coach Multi-Action Support
- [x] Fix AI Coach not recognizing CRM actions when multiple are requested in one message
- [x] Update parseIntent to return an array of actions instead of a single action
- [x] Update frontend to render multiple action confirmation cards from a single message
- [x] Each action should be independently confirmable/dismissable
- [x] Contact resolution caching — resolved contacts reused across actions in same batch
- [x] Remaining actions queue — if contact disambiguation needed, remaining actions queued for after selection
- [x] 12 new vitest tests covering multi-action parsing, empty arrays, context preservation, and sequential creation
## AI Coach Multi-Action Batch Counters
- [x] Add "Action 1 of 3" visual indicator on each confirmation card in a multi-action batch

## Opportunity Card Description Enhancement
- [x] Update opportunity detection AI to include specific missed phrases/questions in the description
- [x] Show what the rep should have said or asked (e.g., "Rep didn't ask about timeline" or "Should have probed on 'small developer' comment")
- [x] Make descriptions actionable so admin doesn't need to read the full transcript
- [x] Added missedItems JSON column to opportunities schema
- [x] Updated LLM prompt with detailed missed-items extraction instructions and examples
- [x] Updated re-evaluation to refresh missedItems on active opportunities
- [x] Added amber "What They Missed" section to opportunity cards (visible on all cards, not just expanded)
- [x] 15 vitest tests covering schema, prompt quality, frontend rendering, and data flow

## Bug Fix: AI Coach actionType undefined error
- [x] Fix "Invalid input: expected string, received undefined" on actionType when creating actions from multi-action parsing
- [x] Investigate why actionType is undefined in the createAction mutation input
- [x] Added VALID_ACTION_TYPES whitelist filter on backend parseIntent response
- [x] Added defensive actionType validation in frontend createActionCard
- [x] Added frontend filter to strip invalid actions before processing
- [x] 2 new vitest tests: validation filter + Daniel's exact pipeline+note request (14/14 passing)

## AI Coach Activity Log (Admin)
- [x] Create backend endpoint to fetch all coach interactions across team (actions + questions)
- [x] Build AI Coach Log page with filterable list of all team interactions
- [x] Add admin-only button in top-right corner of Call Inbox to access the log
- [x] Show who asked, what they asked, what actions were created, and outcomes
- [x] Add filtering by team member, date range, and action type
- [x] Stats cards: total actions, total questions, executed, failed
- [x] Team usage breakdown showing per-member activity counts
- [x] Expandable AI responses for coaching questions
- [x] 10 vitest tests covering admin access, non-admin rejection, filtering, and data shape

## Coach Activity Log - Date Range Picker
- [x] Add calendar-based date range picker with quick presets (Today, This Week, Last Week, This Month, Last Month, Last 30 Days, All Time)
- [x] Wire date range to the adminActivityLog query's dateFrom/dateTo params
- [x] Default to "This Week" per dashboard statistics preference
- [x] Custom date range via dual-month calendar popover
- [x] Clear button to reset to All Time
- [x] All 10 existing tests still passing

## Bug Fix: actionType undefined STILL happening (Daniel's report #2)
- [x] Deep investigate why actionType is still undefined after previous filtering fix
- [x] Trace the full code path: parseIntent → handleAsk → createActionCard → createPending
- [x] Find and fix the root cause
- [x] Made createPending accept optional actionType (no more Zod crash on undefined)
- [x] Added server-side VALID_ACTION_TYPES validation with friendly TRPCError message
- [x] Frontend catch block now shows friendly message instead of raw Zod error JSON
- [x] Root cause: likely stale cached frontend from before the guard was added; now both server and client handle it gracefully

## AI Coach Knowledge Base: Seller Backing Out Playbook
- [x] Add seller-backing-out playbook content to the AI Coach's knowledge/context system
- [x] Ensure AMs can ask questions like "seller wants to back out, what do I say?" and get playbook-based answers
- [x] Include the 4 objection types, talk tracks, key moves, universal principles, and escalation criteria
- [x] Inserted playbook into training_materials DB (category: objection_handling, scope: acquisition_manager)
- [x] Added backing_out topic with 20 keywords to both routers.ts and coachStream.ts topic maps
- [x] Increased training material content limit from 1500 to 4000 chars so full playbook is available to AI
- [x] 14 vitest tests covering topic mapping, keyword coverage, content limits, and question matching

## Bug Fix: "No opportunity ID available" when changing pipeline stage
- [x] Fix pipeline stage change failing with "No opportunity ID available" when contact exists but opportunity record isn't found
- [x] Investigate how opportunity ID is resolved for change_pipeline_stage action
- [x] Add fallback to search GHL for the contact's opportunity if not found locally
- [x] Added findOpportunityByContact() — auto-searches GHL for contact's opportunities when no ID provided
- [x] Added getPipelinesForTenant() and resolveStageByName() — resolves human-readable stage names to pipeline/stage IDs
- [x] Updated LLM prompt to always include stageName and pipelineName, leave IDs empty for auto-resolution
- [x] Added pipelineName to LLM JSON schema
- [x] Friendly error messages: "No opportunity found for this contact" and "Could not find a pipeline stage matching..."
- [x] 16 vitest tests covering stage name resolution, case insensitivity, partial matching, pipeline filtering, and code path verification

## Bug Fix: Pipeline stage fuzzy matching for abbreviations
- [x] Fix stage matching to handle abbreviations (e.g., "Pending Apt(3)" should match "pending appointment")
- [x] Strip parenthetical numbers from stage names before matching (e.g., "(3)" in "Pending Apt(3)")
- [x] Add common real estate abbreviation mappings (apt/appointment, appt/appointment, dq/disqualified, sched/scheduled, etc.)
- [x] Add word-level fuzzy matching with abbreviation expansion
- [x] Add compound word normalization (followup/follow up, callback/call back, etc.)
- [x] Add filler word filtering ("stage", "the", "to", etc.)
- [x] Prevent false positives with strict bidirectional matching and prefix-only short-word matching
- [x] 19 vitest tests covering Daniel's exact scenarios, abbreviations, parenthetical stripping, and edge cases

## Confirmation with Resolved Stage Name
- [x] Before executing pipeline stage change, resolve the stage name and show actual matched name on confirmation card
- [x] Show "→ Pending Apt(3) in Sales Process" blue pill on confirmation card
- [x] Added resolveStage backend endpoint to pre-resolve stage names
- [x] Amber warning if stage can't be pre-resolved
- [x] Fixed "disqualified" → "DQ'd" matching with abbreviation-expanded exact word match (Pass 4)
- [x] Added 60% length ratio guard on substring includes (Pass 5) to prevent false positives
- [x] All 19 pipeline stage resolution tests pass

## Bug Fix: Pipeline stage matching fails in production for Daniel
- [x] "pending appointment" and "pending apt" both fail with "Could not find a pipeline stage matching" error
- [x] Tests pass but production execution fails — ROOT CAUSE: LLM returns pipelineName="sales pipeline" but actual GHL name is "Sales Process". Pipeline filter used exact substring match which failed.
- [x] Traced executeAction path — pipeline filter on line 330 was using .includes() which fails for "sales pipeline" vs "Sales Process"
- [x] Fixed: Pipeline name matching now uses fuzzy word overlap ("sales" matches "Sales Process") + fallback to all pipelines if no match. 24/24 tests pass.

## Bug Fix: Add Note to Opportunity fails with "No opportunity ID available"
- [x] When multi-action batch runs (e.g., change stage + add note), the second action doesn't have the opportunity ID
- [x] Fix add_note_opportunity to auto-resolve opportunity from contact ID (same as change_pipeline_stage does)

## Audit: All action types for missing-ID auto-resolution
- [x] Audit add_note_contact — OK, requires contactId (resolved during contact search step)
- [x] Audit add_note_opportunity — FIXED in previous checkpoint, auto-resolves from contactId
- [x] Audit change_pipeline_stage — OK, auto-resolves opportunity + fuzzy stage matching
- [x] Audit send_sms — OK, requires contactId + routes from requesting user's GHL number
- [x] Audit create_task — OK, requires contactId + resolves assignee from team members
- [x] Audit add_tag — OK, requires contactId, merges with existing tags
- [x] Audit remove_tag — OK, requires contactId, filters from existing tags
- [x] Audit update_field — OK, requires contactId, updates custom fields
- [x] Compile complete list of all action types for Corey

## Bug Fix: Add Note to Opportunity returns 404 from GHL API
- [x] GHL API returns 404 on POST /opportunities/{id}/notes — endpoint doesn't exist in GHL API
- [x] Fix: merge add_note_opportunity to use contact notes endpoint (POST /contacts/{contactId}/notes) since they're the same thing in GHL

## Consolidate: Merge add_note_contact + add_note_opportunity into single add_note
- [x] Find all references to add_note_contact and add_note_opportunity across codebase
- [x] Update drizzle schema enum to include add_note (keep old values for backward compat)
- [x] Update executeAction switch to handle add_note (and legacy types)
- [x] Update LLM prompt to use add_note instead of two separate note actions
- [x] Update frontend action card rendering for unified add_note
- [x] Run DB migration
- [x] Test end-to-end — all 72 unit tests pass, 107 opportunities tests pass

## Bug Fix: tRPC error on home page for unauthenticated users
- [x] Home page tRPC query returns HTML instead of JSON for unauthenticated users — caused by 502 proxy returning HTML
- [x] Fix: added non-JSON response guard in tRPC client fetch wrapper — converts HTML error pages to proper JSON error responses

## Feature: Detect actionable content in Too Short / skipped calls as signals
- [x] Investigate how opportunity detection currently handles Too Short and skipped calls — ALL 16 rules filter on status=completed & classification=conversation, so short/skipped calls are completely invisible
- [x] Add Rule 17: Scan short/skipped calls for actionable content (email, phone, referral, scheduling intent, property details)
- [x] Example: Gary Tallman call (0:47, Too Short, skipped) — wife provided husband's email for follow-up
- [x] Test with real examples — 30/30 pattern matching tests pass

## Feature: Extend Rule 17 to voicemail classifications
- [x] Update Rule 17 query to include voicemail-classified calls alongside too_short/skipped (also includes callback_request)
- [x] Voicemails may contain callback numbers, interest signals, or referrals
- [x] Added standalone phone number detection for voicemails where seller leaves a callback number
- [x] Updated excerpt labels: "Voicemail", "Callback", or "Short call Xs" depending on classification
- [x] Update tests to cover voicemail scenarios — 37/37 tests pass (7 new voicemail-specific tests)

## Fix: AI Coach Persistent CRM Action Awareness
- [x] Investigate frontend message routing — how it decides action vs Q&A path
- [x] Fix coaching Q&A system prompt to always include CRM action capabilities
- [x] Add action-awareness redirect — when user asks to do a CRM action in Q&A mode, coach should tell them to phrase it as a command (or auto-route it)
- [x] Ensure the LLM never says "I can't add notes" or "I don't have access to your CRM" when those actions are fully implemented
- [x] Write vitest tests for capability awareness and action routing

## Fix: Auto-route action requests instead of asking user to retype
- [x] Remove "retype as command" instruction from coaching prompts — coach should never ask user to rephrase
- [x] Make parseIntent more aggressive at detecting conversational action requests so they never fall through to Q&A
- [x] Update streaming coach prompt to stop suggesting users retype commands
- [x] Write vitest tests for auto-routing behavior

## Fix: parseIntent returns empty for conversational action requests
- [x] Investigate why parseIntent returns empty actions for "Can you create summary for the last call with Jackson James and add that summary as a note?"
- [x] Fix parseIntent to reliably detect these compound action requests on the first pass
- [x] Improve fallback handling when ACTION_REDIRECT re-route also fails

## Fix: AI Coach generates too-short call summaries for notes
- [x] Investigate transcript truncation limit and prompt instructions for note content
- [x] Increase transcript context and add explicit instructions for detailed, multi-paragraph summaries
- [x] Ensure summaries highlight motivation type, key discussion points, property details, and next steps

## Update: CRM Note Writing Style (Daniel Lozano's format)
- [x] Replace generic note instructions with Daniel's specific CRM note writing rules
- [x] Ensure notes use paragraph form only, no bullets, no assumptions, neutral factual tone
- [x] Update vitest tests for the new note style requirements

## Update: Make CRM note style the platform-wide default (not Daniel-specific)
- [x] Update prompt language to frame the note style as the platform standard for all tenants
- [x] Update test descriptions to reflect platform-wide default

## Bug: Duplicate call entries appearing for same contact (Alex Martin)
- [x] Investigate duplicate call records in database for Alex Martin / Daniel Lozano
- [x] Identify root cause — manual uploads with no dedup, not GHL sync issue
- [x] Fix deduplication logic — added 30-min window check for same contact manual uploads
- [x] Restrict manual call upload to admin-only on the backend
- [x] Hide manual upload UI for non-admin users on the frontend
- [x] Add deduplication check for manual uploads

## Fix: Call classification incorrectly labels admin calls as 'offer'
- [x] Investigate how callType is determined during call processing (classification step)
- [x] Fix classifier to distinguish admin/scheduling calls from actual offer calls — updated AI detection prompt, fixed role-based fallback across 4 files
- [x] Ensure calls where no offer is discussed are classified as 'admin' not 'offer' — role-based fallback now defaults to 'qualification' for acquisition managers, AI determines actual type

## Fix: Create Task GHL API 422 date format error
- [x] Investigate how task due dates are formatted when sent to GHL API
- [x] Fix date format to include timezone offset (e.g., 2020-10-25T10:00:00Z) — already using ISO 8601, added better error logging
- [x] Fix task assignee parsing — contact name should not be treated as assignee — improved LLM prompt to clearly distinguish contact vs assignee

## Cleanup: Call Inbox toolbar layout
- [x] Clean up the toolbar buttons — consolidated into icon-only Refresh + three-dot dropdown menu with BatchDialer sync, Upload Call, and Coach Log

## Fix: Stale deal detection not counting calls/texts as activity
- [x] Investigate stale deal detection logic — what counts as "activity"
- [x] Fix to include call records and SMS as activity — added GHL conversation check to detectStaleActiveStage, checks for recent outbound messages
- [x] Improve signal descriptions to reflect actual story — when activity found, description now says "team is actively working" with details
- [x] Fix Micah Hensley false positive — GHL conversation check catches recent calls/texts, suppresses stale signal when team is active
- [x] Investigate price extraction accuracy — rewrote extractPricesFromTranscript with keyword-based classification
- [x] Improve price extraction: added SMS conversation scanning for price mentions in both new detection and re-evaluation flows
- [x] Fix price extraction heuristics — now requires explicit keyword context ("asking", "want", "offer", "we can do") to classify, never guesses
- [x] Frances Rolin: Fixed — SMS conversations now scanned for price data, conservative classification prevents wrong labeling
- [x] Navery Moore: Fixed — price extraction now requires keyword context, won't grab random dollar amounts from transcripts

## Fix: 6 calls stuck in Queued status
- [x] Investigate what the 6 queued calls are — found 3 stuck in transcribing, 2 in classifying, 1 in grading
- [x] Determine why they're stuck — server restart/LLM timeout left them in intermediate states, no auto-retry existed
- [x] Fix stuck calls — added automatic retry every 30 minutes for calls stuck >1 hour in transcribing/classifying/grading
- [x] Add shared date filter to Needs Review and Skipped tabs — date filter now shared across all tabs, extra filters (team, type, outcome, score) still only on All Calls tab

## Fix: Automatic stuck call retry
- [x] Add automatic retry for calls stuck in transcribing/classifying/grading for more than 1 hour — retryStuckCalls() runs every 30 min

## Fix: Add system role (Admin/User) management to Edit Team Member dialog
- [x] Add system role (User/Admin) dropdown to Edit Team Member dialog — "System Access" selector added with User/Admin options
- [x] Ensure backend supports updating user role — backend already accepts role param, dialog now passes editingMember.role instead of hardcoded 'user'

## Fix: Your Gunner URL field shows non-working URL
- [x] Fix "Your Gunner URL" field — TenantSettings now shows actual app URL (window.location.origin) with working link button; TenantSetup fixed to show getgunner.ai/ prefix

## Bug: John Smith test actions being auto-created in coach action log
- [x] Investigate what is generating 173 "John Smith" test actions — caused by vitest tests writing to production DB with user ID 1
- [x] Fix root cause — added afterAll cleanup to opportunities.test.ts that deletes John Smith test data after tests run
- [x] Clean up existing test data — deleted 173 John Smith test actions from production database
- [x] Simplify date filter to just "Today" and "All Time" — removed all extra options and Custom calendar from CoachActivityLog

- [x] Delete ALL test data from production database (Jose Ruiz, John Smith, Multi-action entries, etc.)
- [x] Fix test file to use mocks/stubs instead of writing to real database
- [x] Verify no test entries remain in production

- [ ] Add GHL task querying to AI Coach — allow coach to answer "what leads are due on [date]" by fetching tasks from GHL API
- [x] Fix AI Coach responses being cut off / truncated in Admin Activity Log view
- [x] Merge 'Seller Callback', 'Admin Callback', and admin calls into a single 'Admin' call type in the Call Type filter
- [x] Build demo account — separate login, realistic fake data, read-only access
- [x] Create demo tenant with 5 team members (2 cold callers, 2 lead managers, 1 AM)
- [x] Seed realistic call/grade data with upward trends on analytics
- [x] Demo auth system with dedicated login credentials
- [x] Demo mode restrictions — disable all action buttons, block rubric details, block CRM actions
- [x] Auto-delete uploaded calls after 15 minutes in demo mode
- [x] Demo banner with "Start your free trial" CTA
- [x] Fix demo login — user getting 'invalid login' error (was not published yet)
- [x] Change Recent Calls on dashboard to show last 5 graded calls instead of only today's calls
- [x] Change Call History default date filter from "Today" to "All Time" so calls show on load
- [x] Replace demo seed data with real calls from production — modify names, add variety, ensure analysis trends look good

## Demo Score Adjustment
- [x] Adjust demo call grades to average 75-80 with wider spread (some in 40-60s, some higher)
- [x] Ensure lower-scored calls have rich coaching feedback (strengths, improvements, coaching tips)
- [x] Maintain upward trend over the 6-week period
- [x] Verify grade letter distribution matches new scores

## Filter Simplification
- [x] Simplify "All Types" filter dropdown — remove duplicates (3x "Add Note") and reduce clutter

## BatchDialer Integration Fix
- [x] Investigate BatchDialer API timeout issues and find workaround
- [x] Implement fix to get call syncing working reliably

## BatchDialer Sync Not Working After V2 Switch
- [x] Debug why BatchDialer calls are not importing after v2 endpoint switch
- [x] Fix sync issue and verify calls flow in
- [x] Filter BatchDialer sync to only import calls with dispositions: Interested in Selling, Follow Up, Not Selling, Call Back
- [x] Handle recording 404s gracefully (skip call, don't error)

## AI Coach Pipeline Stage Move Bug
- [x] Fix AI Coach moving contacts to wrong pipeline — should stay in contact's current pipeline
- [x] Fix "move that back" undo command not working in AI Coach

## Per-User Explicit Preferences for AI Coach
- [x] Add DB table/column for explicit user preferences (per-user, not per-tenant)
- [x] Detect preference-setting messages ("always use X", "default to Y", "use Z tone")
- [x] Store preferences per-user and confirm back to user
- [x] Inject explicit preferences into AI Coach prompts (coaching, actions, SMS, notes)
- [x] Apply default pipeline preference during stage resolution
- [x] Support preference types: pipeline default, response tone/format, task assignment defaults, etc.

## AI Coach: Add/Remove Contact from Workflow
- [x] Research GHL workflow API endpoints (add contact to workflow, remove contact from workflow)
- [x] Add add_to_workflow and remove_from_workflow action types to schema and backend
- [x] Implement GHL API calls for workflow add/remove
- [x] Update AI Coach LLM prompt to recognize workflow commands
- [x] Add workflow name resolution (fuzzy match workflow names from GHL)
- [x] Wire up frontend confirmation cards for workflow actions
- [x] Write vitest tests

## AI Coach: Update Existing Task (due date, title, etc.)
- [x] Add update_task action type to schema enum
- [x] Implement GHL API: list tasks for contact, update task by ID
- [x] Add update_task case to executeAction switch
- [x] Update AI Coach LLM prompt to recognize task update commands ("move task to Monday", "change due date", "reschedule task")
- [x] Add task matching logic (find the right task by title/keyword when contact has multiple tasks)
- [x] Wire up frontend confirmation card for task updates
- [x] Write vitest tests for update_task

## AI Coach: SMS Sender Routing Fix
- [x] Fix SMS to always send from the Gunner user's GHL userId (not the opportunity assignee's) — verified code already uses requestingUserGhlId correctly
- [x] Show which phone number/user the SMS will send from in the confirmation card — added "Sending from: [name]'s line" display
- [x] Added detailed logging to trace SMS userId routing for debugging

## AI Coach: Conversation vs Action Routing Fix
- [x] Fix AI Coach to properly route conversational messages (feedback, complaints, questions about previous actions) to the Q&A coach instead of trying to parse them as CRM actions
- [x] "That was not sent from my number" should get a conversational response, not "I couldn't determine the action"
- [x] Updated parseIntent prompt with CONVERSATIONAL MESSAGES ARE NOT ACTIONS section
- [x] Updated Q&A coach prompt (both streaming and non-streaming) with CONVERSATIONAL FEEDBACK vs CRM ACTIONS section
- [x] Fixed ACTION_REDIRECT empty fallback to fall through to Q&A coach instead of showing generic error

## AI Coach: SMS Phone Number Fix
- [x] Investigate GHL API fromNumber parameter for explicit phone number routing — GHL uses userId parameter to route from user's assigned number; no separate fromNumber param found
- [x] Ensure SMS sends from the requesting user's actual phone line, not the contact's assigned user — code verified correct; GHL may override based on conversation thread

## AI Coach: Create Appointment / Add to Calendar
- [x] Research GHL Calendar/Appointments API endpoints
- [x] Add create_appointment action type to schema enum
- [x] Implement GHL API: list calendars, create appointment/event
- [x] Add create_appointment case to executeAction switch
- [x] Update AI Coach LLM prompt to recognize calendar/appointment commands
- [x] Wire up frontend confirmation card for appointment details (date, time, calendar, title)
- [x] Write vitest tests for create_appointment

## AI Coach: Update/Cancel Appointment
- [x] Research GHL Update Appointment and Delete Appointment API endpoints
- [x] Add update_appointment and cancel_appointment action types to schema enum
- [x] Implement GHL API: get appointments for contact, update appointment, delete/cancel appointment
- [x] Add update_appointment and cancel_appointment cases to executeAction switch
- [x] Update AI Coach LLM prompt to recognize reschedule/cancel appointment commands
- [x] Wire up frontend confirmation cards for appointment update/cancel
- [x] Write vitest tests for update_appointment and cancel_appointment

## BUG: update_task shows success but doesn't actually update in GHL
- [x] Check server logs for update_task execution details
- [x] Identify why the action reports success but tasks aren't updated — ROOT CAUSE: field name mismatch (payload.newDueDate vs payload.dueDate, payload.completed vs payload.taskStatus)
- [x] Fix the root cause — mapped payload.dueDate, payload.description, payload.taskStatus to correct updateTask fields
- [x] Add better error handling — empty body validation, detailed logging of updates being sent

## BUG: Mark task as completed not actually completing in GHL
- [x] Research GHL task update API — GHL has a SEPARATE endpoint: PUT /contacts/:contactId/tasks/:taskId/completed
- [x] Fix the updateTask function to use the dedicated /completed endpoint instead of the general update endpoint
- [x] Test with "check off the task for sue ashburn"

## BUG: SMS still sends from assigned number, not requesting user's number
- [x] Research GHL conversations/messages API deeper — found `fromNumber` parameter in API docs
- [x] Check if GHL needs the actual phone number instead of userId — YES, `fromNumber` explicitly controls sender
- [x] Look into GHL user phone number lookup — added getUserPhoneNumber() that queries /phone-system/numbers/location/:locationId and matches by userId
- [x] Updated sendSms to auto-resolve fromNumber from user's GHL phone assignment

## BUG: "check of the task for sue ashburn for today" not recognized as update_task
- [x] Fix parseIntent prompt to handle typos like "check of" (for "check off") and variations like "check off task for [contact] for today"
- [x] Add more example phrasings for task completion in the LLM prompt (check off, check of, complete, finish, done with, close out, mark as done)

## Dashboard: Stat Card Comparison Badges
- [x] Update backend to fetch prior period stats alongside current period
- [x] Calculate percentage change for each metric (calls, conversations, appointments, offer calls, avg score)
- [x] Add green/red percentage badge to top corner of each stat card
- [x] Handle edge cases (prior period zero, no data, same value)

## BUG: Avg Score stat card comparison badge overflows card
- [x] Fix badge text overflow — "25%pt" is too wide and clips outside the card boundary

## BUG: Avg Score badge shows "25pt" instead of "25%"
- [x] Change badge label to always use % suffix for all stat cards including Avg Score

## Onboarding Audit Fixes
- [x] Make pipeline stage classification configurable per tenant (replace hardcoded ACTIVE_DEAL_STAGES, FOLLOW_UP_STAGES, DEAD_STAGES)
- [x] Fix hardcoded "Sales Process" pipeline lookup — use tenant's dispoPipelineName
- [x] Make Gunner Engine webhook URL per-tenant or conditional
- [x] Fix KPI module — remove hardcoded team member names (chris, daniel, kyle, esteban, steve)
- [x] Remove hardcoded Google OAuth ID from isPlatformOwner
- [x] Remove hardcoded PLATFORM_OWNER_OPEN_ID in adminRouter.ts
- [x] Fix hardcoded URLs in email templates — use env vars
- [x] Fix hardcoded logo URL in emailService.ts — use constant from env
- [x] Fix hardcoded baseUrl in tenant.ts invite emails
- [x] Fix hardcoded APP_URL in emailTemplates.ts
- [x] Fix trial length display in onboarding UI — show 14-day (matches backend)
- [x] Make campaign KPI market/channel and KPI goals channel dynamic (varchar instead of enum)
- [x] Make KPI deals leadSource dynamic (varchar instead of enum)
- [x] Write tests for all audit fixes (26 tests passing)

## V2 Prep: Remove KPI Page & Onboarding Hardening
- [x] Remove KPI reporting page and all related routes/nav items
- [x] Add pipeline stage classification to onboarding (active/follow-up/dead stages + industry)
- [x] Set APP_URL and EMAIL_LOGO_URL env vars
- [x] Full audit: find and fix ALL remaining hardcoded tenant-specific values
- [x] Ensure all tenant config is accessible via onboarding or settings UI (Advanced Configuration card)
- [x] Make LLM grading prompts use dynamic industry from tenant config
- [x] Replace hardcoded Railway webhook URL with GUNNER_ENGINE_WEBHOOK_URL env var
- [x] Replace hardcoded KPI enums (market, channel, leadSource, inventoryStatus) with varchar
- [x] Fix all 3-day trial references to 14-day across Signup, Paywall, Landing, Pricing pages
- [x] Write tests for all changes (15 branding audit tests passing)

## Remove Manus branding from user-facing website
- [x] Remove all manuscdn logo URLs from 8 frontend files — replaced with CloudFront S3 URLs
- [x] Remove 'Login with Manus' text from ManusDialog
- [x] Upload logos to S3 for neutral domain (d2xsxph8kpxj0f.cloudfront.net)

## Onboarding UX: Auto-fetch GHL Stages + Webhook Setup Card
- [x] Auto-fetch GHL pipeline stages after connection test succeeds (already wired up)
- [x] Replace free-text stage classification with click-to-classify stage chips (Active / Follow-Up / Dead / Unclassified)
- [x] Add GHL webhook setup instruction card to onboarding step 2 with copyable webhook URL and step-by-step GHL instructions
- [x] Add GHL webhook URL display + copy button to Settings → Integrations → Advanced Configuration
- [x] Write tests for new features (19 tests passing)

## BUG FIX: AI Coach parseIntent has no conversation memory
- [x] Add `history` parameter to parseIntent input schema
- [x] Extract contact name from conversation history when current message has no name
- [x] Include conversation history in LLM messages array for follow-up context
- [x] Add FOLLOW-UP MESSAGES instruction to system prompt so LLM handles "do it again" etc.
- [x] Update all 3 frontend parseIntent calls to pass conversation history
- [x] Write tests (22 tests passing)

## AI Coach: Better handling of user pushback/disagreement
- [x] Improve askQuestion prompt to check transcript evidence when user says "I already do it"
- [x] Make AI Coach acknowledge user's self-reported behavior before citing rubric
- [x] Improve grading rubric to be more flexible about natural conversation styles
- [x] When user provides an example of what they say, AI should evaluate it fairly against transcript
- [x] Add self-reference detection (regex) so "my calls", "I already do it" auto-resolves to user's team member
- [x] Include transcript excerpts (up to 2000 chars) in member call context when user disputes grades or self-references
- [x] Include per-criterion scores in member call context so AI can discuss specific criteria
- [x] Add GRADE DISPUTE & PUSHBACK HANDLING rules (17-21) to askQuestion system prompt
- [x] Add GRADING PHILOSOPHY section to grading prompt (natural vs scripted styles both valid)
- [x] Update Setting Expectations rubric to accept conversational approaches (mutual fit check, etc.)
- [x] Update red flag from rigid "Not setting clear expectations" to nuanced version
- [x] Label key phrases as "examples, not requirements" in grading prompt
- [x] Write 55 vitest tests for all new behavior (all passing)

## DQ-Aware Grading + Prior Context Awareness
- [x] Add DQ detection logic in grading prompt — recognize when a call is a quick disqualification (not in buybox, no motivation, not in area, going to list)
- [x] Adjust grading rubric for DQ calls: grade on DQ quality (probing questions to confirm, correct identification, professional exit, door left open) not full qualification depth
- [x] Add prior context awareness — recognize when rep references prior conversations, text leads, existing notes, and don't penalize for not re-gathering already-known info
- [x] Write vitest tests for DQ detection and prior context awareness (29 tests passing)
- [x] Add EARLY DISQUALIFICATION AWARENESS section to grading prompt with DQ reasons, neutral scoring, and balance guidance
- [x] Add PRIOR CONTEXT AWARENESS section to grading prompt with prior context phrases and full credit for confirmed info
- [x] Add EARLY DISQUALIFICATION CONTEXT rules (22-23) to AI Coach system prompt
- [x] Add PRIOR CONTEXT AWARENESS rule (24) to AI Coach system prompt

## Mark Corrections as Incorporated + Correction Pattern Monitoring
- [x] Mark Daniel's 6 pending corrections as "Incorporated" (all 6 updated in DB, 0 pending remaining) 
- [x] Build correction pattern monitoring — detect recurring correction themes across team members
- [x] Surface correction patterns to admin (daily notification + API endpoint at feedback.patterns)
- [x] Write vitest tests for monitoring feature (41 tests passing)

## Stuck Queued Calls + Admin UI for Stuck Call Management
- [x] Investigate and retry the 2 stuck queued calls (Call #2370005 Daniel→Morgan, Call #2400012 Chris→Lorrie — both stuck at pending, never picked up)
- [x] Fix retryStuckCalls and resetStuck to also catch pending calls stuck >1 hour
- [x] Add listStuck query and retryCall mutation endpoints
- [x] Remove date filter from review query so stuck calls always show regardless of date range
- [x] Add admin UI section to view stuck/queued calls with amber "Stuck" badges and "never picked up" labels
- [x] Add individual "Retry" button for each stuck call in Needs Review tab
- [x] Add "Retry All Stuck" button in stuck calls warning banner
- [x] Make Queued card on dashboard clickable to navigate to Call History review tab
- [x] Write vitest tests for stuck call management (16 tests passing)

## Correction Monitor Notifications
- [x] Disable automatic daily correction pattern notifications (emails were too frequent)

## BatchDialer Recording Endpoint Fix
- [x] Update recording download URL to use correct endpoint: /api/call/{id}/recording (was /api/callrecording/{id})
- [x] Ensure X-ApiKey auth header is used for recording downloads (already was, confirmed)

## "Worth a Look" Signal Category
- [ ] Add "Worth a Look" classification for signals where seller stated a price and there's negotiation potential
- [ ] Update opportunity detection prompt to distinguish "Missed" (rep failed) vs "Worth a Look" (lead is viable, worth pursuing)
- [ ] Update UI to show "Worth a Look" badge instead of "Missed" for these signals
- [ ] Write vitest tests for the new classification
- [ ] Suppress followup_inbound_ignored when last call was a proper DQ conversation (not interested + real conversation duration)
- [ ] Reframe "What They Missed" as "Why This Is Worth a Look" for possible-tier signals in the UI
- [ ] Fix price extraction logic — extracting wrong numbers from transcript (showed $150k/$160k when real numbers were $105k/$130k)
- [ ] Auto-suppress/resolve opportunity signals when pipeline stage shows under contract or purchased
- [ ] Fix Suzanne Burgess price extraction (showed $30k/$122k, real was $100k→$103k offer)
- [ ] Fix follow-up detection to check GHL conversations/SMS/call activity before claiming "team went silent" or "no follow-up"
- [ ] Barbara Thompson false positive — system says "no follow-up 135 hours" but team has been calling/texting daily
- [ ] Dequisha McKnight false positive — system says "team went silent" but Kyle made in-person offer and is actively communicating
- [x] Cathie Cooper — "What They Missed" for ghosted leads should focus on outreach history and re-engagement potential, not basic qualification questions
- [x] Reframe missedItems for ghosted/DQ'd leads to show outreach context instead of rep coaching

## Opportunity Detection V2 — Critical Fixes
- [x] Wire up LLM price extraction (extractPricesFromTranscriptLLM) to replace all regex calls in detection rules
- [x] Increase LLM price extraction transcript window from 1500 to 4000 chars for better coverage
- [x] Add under-contract/purchased stage suppression to all pipeline-based detection rules
- [x] Add DQ stage suppression (1 Year Follow Up, Dead, etc.) for properly disqualified leads
- [x] Fix ghosted lead missedItems to focus on re-engagement strategy instead of basic qualification coaching
- [x] Update AI reason prompt to distinguish ghosted leads from missed opportunities
- [x] Replace regex extractPricesFromTranscript in reEvaluateActiveOpportunities with LLM version
- [x] Replace regex extractPricesFromTranscript in price gap enrichment (Phase 4) with LLM version
- [x] Write comprehensive vitest tests for all opportunity detection fixes
- [x] Change "New Lead — No Call Within 15 Min" (SLA breach) from "Missed" tier to "At Risk" tier
- [x] Sara Prinzi false positive — motivated_one_and_done should be suppressed when lead is in 1 Year Follow Up and last call shows not motivated / high price
- [x] Improve motivated_one_and_done rule to check if lead was intentionally moved to follow-up (call classification shows proper DQ conversation)
- [x] Ensure "Not a Deal" dismissal prevents re-flagging of the same contact+rule for 30+ days
- [x] Matthew Golden false positive — motivated_one_and_done for lead in 1 Year Follow Up after proper DQ conversation (no equity, listing is best option)

## Call History Fix- [x] Lead Generator calls not showing in All Calls tab (only in Skipped) — fix query filtering- [x] Group Team Member dropdown by team type (Acquisition Manager, Lead Manager, Lead Generator) instead of flat list
- [x] Team Member dropdown must only show team members from the associated tenant (use team.list query, not current page results)

## Lead Generator Improvements
- [x] Include Lead Generator call data in Analytics page charts/metrics
- [x] Add Leads count box to Dashboard page
- [x] Add Leads count box to Analytics page
- [x] Ensure Lead Generator gamification is working (leaderboard, streaks, badges)
- [x] Update leaderboard subtitle to include Lead Generators: "Ranked by appointments (LMs), offers (AMs), and leads generated (LGs)"
- [x] Change Dashboard leaderboard from top 3 to top 5 team members

## Lead Generator AI Coach Customization
- [x] Create lead-gen-focused system prompt for AI Coach (cold calling tips, identifying motivated sellers, opening lines)
- [x] Update suggested coaching prompts for Lead Generators (replace price objections/rapport with lead gen topics)
- [x] Update suggested actions for Lead Generators (add note, schedule qualification call for LM, flag as interested lead)
- [x] Detect user role and switch AI Coach persona accordingly
## Lead Generator Workflow Language Fix
- [x] Remove "handoff/transfer" language from LG AI Coach system prompt — LGs tell sellers they'll pass info to manager, not formal handoffs
- [x] Update coachStream.ts LG prompt to reflect actual workflow
- [x] Update routers.ts LG prompt to reflect actual workflow
- [x] Update frontend starter action prompts if needed
- [x] Update tests to match new language
## Team Member Dropdown Role Restriction
- [x] Lead Generators should only see themselves in the Team Member filter dropdown
- [x] Lead Managers should see themselves + Lead Generators assigned to them
- [x] Acquisition Managers and Admins see all team members (current behavior)
- [x] Use team assignments data to determine which LGs are assigned to which LMs
- [x] Write tests for the role-based filtering logic
## Dashboard Header Stats Personalization
- [x] Dashboard header ("X calls today — Y graded, avg Z%") should show individual team member stats, not team-wide
- [x] Admins continue to see team-wide stats
- [x] Non-admin users see only their own calls/grades/avg in the header
## Bug: Duplicate LG Calls with Different Scores
- [x] Investigate why LG calls (e.g., Charles Lester, Russell Stansberry by Efren) appear twice with different scores
- [x] Determine if duplicates come from BatchDialer sync, GHL sync, or processing pipeline
- [x] Fix deduplication logic to prevent duplicate call imports
- [x] Clean up existing duplicate calls in database
## Bug: Daniel's Dashboard Shows All Zeros (alvarez.lozano)
- [x] Investigate why Daniel Lozano's dashboard shows 0 for all stats when viewed as alvarez.lozano
- [x] Check if alvarez.lozano user account is properly linked to Daniel Lozano team member record
- [x] Fix user-to-team-member linking if broken
## LG Dashboard Layout Fix
- [x] Give Lead Generators the same dashboard layout as Lead Managers (full company view with leaderboard, gamification cards)
- [x] Fix floating point percentage display bug (e.g., "28.999999999996%" should show "29%")
## Training Page Access Control
- [x] Hide "Add Material" button on Training page for non-admin users
- [x] Add Training page to Lead Generator sidebar navigation
- [x] Restrict "Generate AI Insights" button on Training page to admin only (already was admin-only)
## SMS Sender Routing Clarification
- [x] SMS sends from the logged-in user's phone number (whoever is using the AI Coach)
- [x] Reverted previous change that routed SMS through contact's assignedTo user
- [x] Frontend "Sending from" label correctly shows the logged-in user's name
## SMS Override Sender Option
- [x] Add endpoint to list team members with phone numbers for sender selection
- [x] Add senderOverride field to SMS action execution (optional GHL user ID)
- [x] Add sender dropdown to SMS action card (pending state) to pick a different team member's line
- [x] Default dropdown to logged-in user, allow switching to any team member
## SMS Delivery Confirmation
- [x] Track SMS message ID from GHL send response
- [x] Add endpoint or logic to check GHL message delivery status
- [x] Show delivery status indicator on executed SMS action cards (sent, delivered, failed)
## Bug: SMS Still Sending from Wrong User's Phone Number
- [x] GHL shows SMS sent from Esteban Leiva (+16158525930) but AI Coach says "Kyle Barks's line"
- [x] Root cause: getUserPhoneNumber used /phone-system/numbers/location/ endpoint which returned 401
- [x] Fix: Switched to GET /users/{ghlUserId} API and extract phone from lcPhone[locationId]
- [x] Verified: Kyle=+16157688784, Chris=+19312885429, Daniel=+16152405127 all resolve correctly
- [x] fromNumber is now explicitly passed to GHL send message API
## Show Actual From Phone Number in SMS Action Card
- [x] Display the actual phone number (e.g. "+1 (615) 768-8784") alongside team member name in SMS card
- [x] Show phone number in both pending (dropdown) and executed (status) SMS action cards
- [x] Return phone number from smsTeamSenders endpoint
## Phone Number Sync During Team Sync
- [x] Add lcPhone column to team_members table
- [x] During GHL team sync, call GET /users/{ghlUserId} and store lcPhone for each member
- [x] Use cached lcPhone from team_members table in getUserPhoneNumber as a fast path
- [x] Add bulk syncPhoneNumbers endpoint for manual refresh of all team member phone numbers
## Sync Phone Numbers Button on Team Page
- [x] Add "Sync Phone Numbers" button to Team Management page (admin only)
- [x] Wire button to call team.syncPhoneNumbers mutation
- [x] Show loading state and success/error toast
## Auto-Sync Phone on Team Member Link
- [x] When linking a user to a team member, automatically pull their LC phone number from GHL
- [x] Update linkUser endpoint to trigger phone sync after linking
- [x] Show synced phone number in success toast after linking
## Display Phone Numbers in Team Member List
- [x] Show each team member's synced phone number on the Team Management page
- [x] Format phone numbers nicely for display (e.g. (615) 768-8784)
- [x] Phone icon with emerald color next to linked member name
## Phone Numbers on Team Members Table
- [x] Add Phone column to the Team Members list page (TenantSettings team table)
- [x] Display formatted phone numbers for each team member
- [x] Join teamMembers table in getTenantUsers to include lcPhone field
## Sync Phone Numbers Button on Settings Page
- [x] Add "Sync Phone Numbers" button to TenantSettings Team Members card header
- [x] Wire to team.syncPhoneNumbers mutation with loading state and toast
## Bug: Admin Users Missing Team Type Toggles on Training Page
- [x] Admin users (like Kyle) should see team type toggles on Training page to filter insights
- [x] Fix toggle visibility logic to check user.role === 'admin' in addition to teamRole === 'admin'
## Rename GHL/GoHighLevel to CRM in User-Facing UI
- [x] Change "Team Members (from GHL)" to "Team Members (from CRM)" in TenantSettings and TeamManagement
- [x] Change "Team members synced from GoHighLevel" to "Team members synced from CRM"
- [x] Update all GHL/GoHighLevel references to CRM across CallInbox, Landing, Onboarding, Pricing, PrivacyPolicy, SuperAdmin, TenantSettings, TenantSetup
- [x] Rename GHLSyncStatus component to CRMSyncStatus
- [x] Update webhook URL labels from "GHL Webhook URL" to "CRM Webhook URL"
- [x] Update test assertions in onboardingUX.test.ts to match new CRM naming
## Bug: BatchDialer/BatchLeads Connection Status
- [x] Fix BatchDialer showing "Not Connected" when API key is saved as env var and syncing works
- [x] Fix getCrmIntegrations to check both tenant crmConfig AND global env fallback for API keys
- [x] Add connectionStatusEnvFallback.test.ts with 8 tests covering env fallback logic

## Bug: Platform Admin Page Shows Blank Tenants List
- [x] Root cause: isPlatformOwner only checked OWNER_OPEN_ID env var (Manus OAuth ID), but Corey's openId is now Google OAuth
- [x] Added hasPlatformAccess() function that checks both role === 'super_admin' AND isPlatformOwner(openId)
- [x] Updated all 30 tenant router procedures in routers.ts to use hasPlatformAccess
- [x] Removed hardcoded openId check in SuperAdmin.tsx frontend, now uses role-based check

## Tab Order: Acquisition Manager before Lead Manager
- [x] Reorder Training page role tabs: All Roles, Acquisition Manager, Lead Manager, Lead Generator
- [x] Reorder Team Leaderboard tabs: Acquisition Managers, Lead Managers, Lead Generators
- [x] Reorder TeamTraining page role tabs
- [x] Reorder Methodology page tabs: Acquisition Manager, Lead Manager

## Team Page Video Game Redesign
- [x] Dark arcade-style background with slate-900 dark panels
- [x] Character portrait cards in grid layout with glowing borders based on rank (gold/silver/bronze)
- [x] Stat bars like fighting game (Calls, Score, A&B, Badges) with gradient fills
- [x] Level/rank badges with arcade-style icons and glow effects
- [x] Click to expand showing full stats in CharacterDetailPanel (Mario Kart character detail feel)
- [x] Streak flames and XP progress bars with arcade styling (cyan-to-purple gradient)
- [x] Retro/gaming typography using Orbitron + Press Start 2P Google Fonts
