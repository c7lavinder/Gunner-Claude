# BatchDialer API Integration Notes

## API Authentication
- **Header**: `X-ApiKey`
- **Value**: `d98ac867-62b7-439d-8d72-a19004a93e25`
- **Base URL**: `https://api.batchservice.com` (assumed from developer.batchservice.com)

## Available Endpoints (from documentation)

### Recent Calls
- **POST** `/recent-calls/by-vendor-contact-id` - Get recent calls by vendor contact ID
- **GET** `/recent-contacts` - Get recent contacts

### Transcriptions
- **GET** `/transcription/json` - Get transcription in JSON format
- **GET** `/transcription/html` - Get transcription in HTML format

### Contacts
- **GET** `/contacts` - Get contacts
- **GET** `/contact/{id}` - Get single contact by ID
- **POST** `/contacts` - Add contacts
- **PUT** `/contact/{id}` - Update single contact
- **DELETE** `/contact/{id}` - Delete single contact

### Campaigns
- **GET** `/campaigns` - Get campaigns
- **POST** `/campaigns/search` - Search campaigns

### Agent Data
- **POST** `/agent-data` - Get agent data

## Integration Plan

### 1. Store API Key Securely
- Add `BATCHDIALER_API_KEY` to environment variables via `webdev_request_secrets`

### 2. Create BatchDialer Service (`server/batchDialerService.ts`)
- Fetch recent calls (polling every 30 minutes)
- Download call recordings
- Get transcriptions if available
- Map agent IDs to team members

### 3. Database Schema Updates
- Add `batchDialerAgentId` to `team_members` table
- Add `batchDialerCallId` to `calls` table
- Add `source` enum to calls: 'ghl' | 'batchdialer'

### 4. Polling System
- Similar to GHL polling
- Check for new calls every 30 minutes
- Process recordings through existing transcription pipeline
- Classify as lead_gen_call type

### 5. Call Data Mapping
- BatchDialer agent ID → Gunner team member
- Call recording URL → Download and upload to S3
- Call metadata → Store in calls table
- Transcription (if available) → Use or generate our own

## API Response Format (GET /api/cdrs)

**Endpoint**: `GET https://app.batchdialer.com/api/cdrs`

**Query Parameters**:
- `callDate` (string) - ISO 8601 format: 2006-01-02T15:04:05Z07:00
- `direction` (string) - "inbound" or "outbound"
- `disposition` (string) - e.g., "Answered", "Completed", "No Answer"
- `page` (integer) - Page number (defaults to 1)
- `pagelength` (integer) - Records per page (max 100, defaults to 100)

**Headers**:
- `X-ApiKey`: `d98ac867-62b7-439d-8d72-a19004a93e25`

**Response Fields**:
- `id` - Call record ID
- `direction` - "in" or "out"
- `callStartTime` - ISO 8601 timestamp
- `callEndTime` - ISO 8601 timestamp
- `duration` - Call duration in seconds
- `disposition` - Call outcome
- `status` - "COMPLETED", "NOANSWER", etc.
- `agent` - Agent name (string or null)
- `callRecordUrl` - **Recording URL path** (e.g., "/api/callrecording/987654")
- `recordingenabled` - 1 if recording available, 0 if not
- `contact` - Contact details (name, address, email, etc.)
- `campaign` - Campaign ID and name
- `comments` - Array of comment objects or strings

## Recording Access
- Recording URL is relative path: `/api/callrecording/{callId}`
- Full URL: `https://app.batchdialer.com/api/callrecording/{callId}`
- Need to test if this returns audio file directly or requires additional params

## Next Steps
1. ✅ Understand response format
2. Test API with provided key to verify recording download
3. Build batchDialerService.ts
4. Add database schema updates
5. Implement polling system
