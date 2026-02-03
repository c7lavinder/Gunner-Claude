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

- [ ] Fix broken Gunner logo on onboarding page
- [ ] Fix "Failed to save" error on signup flow
- [ ] Fix Google OAuth redirect_uri mismatch for team members


## Google Sign-In Authentication Fix
- [x] Fix cookie name mismatch between self-serve auth (auth_token) and tRPC context (app_session_id)
- [x] Update context.ts to support both authentication methods
- [x] Add unit tests for dual authentication context
- [x] Verify onboarding flow works for new Google signups
