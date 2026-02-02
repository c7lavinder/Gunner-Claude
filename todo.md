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
