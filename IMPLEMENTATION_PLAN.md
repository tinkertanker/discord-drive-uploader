# Implementation Plan: Discord Drive Uploader

## Phase 1: Project Setup & Core Infrastructure

### 1.1 Initialize Node.js Project
- [ ] Create package.json with necessary dependencies
- [ ] Set up TypeScript configuration
- [ ] Configure ESLint and Prettier
- [ ] Set up Netlify configuration files

### 1.2 Core Dependencies
```json
{
  "dependencies": {
    "@netlify/functions": "^2.x",
    "discord.js": "^14.x",
    "googleapis": "^120.x",
    "@netlify/blobs": "^7.x",
    "dotenv": "^16.x"
  }
}
```

## Phase 2: Google Drive Integration

### 2.1 OAuth2 Setup
- [ ] Create `netlify/functions/google-auth-start.js` - Initiates OAuth flow
- [ ] Create `netlify/functions/google-auth-callback.js` - Handles OAuth callback
- [ ] Implement token storage using Netlify Blobs
- [ ] Create refresh token mechanism

### 2.2 Drive API Wrapper
- [ ] Create `src/services/google-drive.js`
  - List folders
  - Upload file with resumable upload for large videos
  - Create folder if needed
  - Handle rate limiting

## Phase 3: Discord Bot Setup

### 3.1 Discord Application Setup
- [ ] Create `netlify/functions/discord-interactions.js` - Webhook endpoint
- [ ] Implement interaction verification
- [ ] Handle slash commands and events

### 3.2 Bot Commands
- [ ] `/setup-folder` - Select Google Drive folder for channel
- [ ] `/upload-info` - Show current configuration
- [ ] `/test-upload` - Test upload functionality

### 3.3 Message Handler
- [ ] Create `src/handlers/message-handler.js`
- [ ] Detect attachments (images/videos)
- [ ] Queue uploads to prevent rate limiting
- [ ] Update bot avatar with latest image

## Phase 4: Web Interface

### 4.1 Setup Wizard
```
public/
├── index.html          # Landing page
├── setup.html          # Setup wizard
├── success.html        # Success page
├── css/
│   └── style.css      # Minimal styling
└── js/
    ├── setup.js       # Setup flow logic
    └── api.js         # API calls
```

### 4.2 Setup Flow
1. Welcome screen with "Get Started" button
2. Google account authorization
3. Drive folder selection (with folder picker)
4. Discord bot token input
5. Test connection
6. Success page with bot invite link

## Phase 5: File Processing

### 5.1 File Naming Logic
- [ ] Create `src/utils/file-namer.js`
  - Format: `YYYY-MM-DD-HH-mm-ss-{truncated_message}`
  - Sanitize filenames (remove special chars)
  - Handle duplicates with counter
  - Max filename length: 100 chars

### 5.2 Upload Queue
- [ ] Create `src/services/upload-queue.js`
  - In-memory queue with Netlify Function persistence
  - Retry failed uploads (3 attempts)
  - Batch uploads from same message

## Phase 6: Configuration Storage

### 6.1 Storage Structure
```javascript
{
  "guilds": {
    "guildId": {
      "channels": {
        "channelId": {
          "driveFolderId": "...",
          "folderName": "..."
        }
      },
      "defaultFolderId": "..."
    }
  },
  "googleTokens": {
    "access_token": "...",
    "refresh_token": "...",
    "expiry_date": "..."
  }
}
```

### 6.2 Netlify Blobs Implementation
- [ ] Create `src/services/config-store.js`
- [ ] Per-deployment configuration isolation
- [ ] Secure token storage

## Phase 7: Error Handling & Monitoring

### 7.1 Error Handling
- [ ] Google API errors (quota, auth)
- [ ] Discord API errors
- [ ] Network timeouts
- [ ] File size limits (Discord: 25MB, Google: 5TB)

### 7.2 Logging
- [ ] Create `src/utils/logger.js`
- [ ] Log uploads, errors, configuration changes
- [ ] Netlify Functions logging integration

## Phase 8: Deployment & Testing

### 8.1 Netlify Configuration
```toml
# netlify.toml
[build]
  command = "npm run build"
  functions = "netlify/functions"
  publish = "public"

[functions]
  node_bundler = "esbuild"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200
```

### 8.2 Environment Variables
- [ ] Document all required env vars
- [ ] Create `.env.example`
- [ ] Set up in Netlify UI

### 8.3 Testing
- [ ] Unit tests for file naming
- [ ] Integration tests for uploads
- [ ] End-to-end test with real Discord/Drive

## Implementation Order

1. **Week 1**: Project setup, Google OAuth, basic Drive integration
2. **Week 2**: Discord bot setup, interaction handling, basic commands
3. **Week 3**: File upload logic, naming, queue system
4. **Week 4**: Web interface, setup wizard, configuration storage
5. **Week 5**: Testing, error handling, deployment optimization

## Technical Decisions

1. **Serverless Architecture**: Using Netlify Functions for scalability
2. **No Database**: Netlify Blobs for simple configuration storage
3. **TypeScript**: For better type safety with Discord.js and Google APIs
4. **Resumable Uploads**: For large video files
5. **Queue System**: To handle rate limits and ensure reliability

## Security Considerations

1. Store tokens encrypted in Netlify Blobs
2. Validate Discord interactions with public key
3. Implement CSRF protection for web interface
4. Rate limit upload endpoints
5. Validate file types before upload