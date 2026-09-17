# VHP Query Authentication Setup

The proxy server (`vapi-pluginrp`) now requires authentication before allowing queries. Users must obtain a session token by logging in with their credentials.

## Server Setup

### Environment Variables

Update `<your vapi-pluginrp checkout>/.env`:

```env
PORT=8000
MONGO_URI=mongodb+srv://...
ADMIN_URL=http://localhost:3001
```

**ADMIN_URL** points to the vapi-admin service that validates credentials.

### Starting the Server

```bash
cd <your vapi-pluginrp checkout>
npm install
node server.js
# Listening on http://localhost:8000
```

## Client Usage

### CLI (fetch.js)

**1. Login and save token:**
```bash
node <your vapi-pluginrp checkout>/login.js <username> <password>
```

Returns:
```json
{
  "success": true,
  "token": "abc123...",
  "user": {...},
  "expiresIn": 86400
}
```

Token is automatically saved to `~/.claude/vhp-query-token` (valid 24 hours).

**2. Use token for queries:**
```bash
node <your vapi-pluginrp checkout>/fetch.js projects Replacement projects '{}' '["id","name"]'
```

The token is automatically loaded from `~/.claude/vhp-query-token`.

**3. Check session:**
```bash
node <your vapi-pluginrp checkout>/login.js --check
```

**4. Logout:**
```bash
node <your vapi-pluginrp checkout>/login.js --logout
```

### Browser (claude.ai web)

When using the vhp-query skill in the browser:

1. **First query** - You'll be prompted for credentials
2. **Token stored** - Internally in the session context
3. **Reuse automatically** - Subsequent queries use the stored token
4. **Token expires** - After 24 hours, login again

## API Endpoints

### POST /login
Authenticate with credentials, get session token.

**Request:**
```json
{
  "user": "username",
  "pswrd": "password"
}
```

**Response (success):**
```json
{
  "success": true,
  "token": "...",
  "user": {...},
  "expiresIn": 86400
}
```

**Response (failure):**
```json
{
  "success": false,
  "errors": {
    "msg": "Invalid credentials"
  }
}
```

### POST /* (All query routes)
Requires valid session token in header.

**Header:**
```
X-Session-Token: <token>,
credentials: 'include'
```

Or query param:
```
?token=<token>
```

**Request body:** Same as before (db, collect, method, options)

**Response:** Same query response format

### POST /logout
Clear session token.

**Header:**
```
X-Session-Token: <token>,
credentials: 'include'
```

**Response:**
```json
{
  "success": true,
  "msg": "Logged out"
}
```

### GET /session
Check current session info.

**Header:**
```
X-Session-Token: <token>,
credentials: 'include'
```

**Response:**
```json
{
  "success": true,
  "user": "username",
  "expiresAt": "2026-09-17T...",
  "expiresIn": 3600
}
```

### GET /health
Health check (no auth required).

**Response:**
```json
{
  "status": "ok",
  "uptime": 123.45
}
```

## Token Storage

### CLI
- **Location:** `~/.claude/vhp-query-token`
- **Format:** JSON with `token`, `user`, `expiresAt`
- **Auto-loaded:** By `fetch.js` automatically
- **Manual access:** Check with `login.js --check`

### Browser
- **Location:** Session context (not persistent)
- **Automatic:** Claude skill manages token lifecycle
- **Expires:** After 24 hours (user needs to login again)

## Troubleshooting

### "No valid session token" error
```bash
node login.js <username> <password>
```

### Token expired
```bash
node login.js --check
# If expired, login again:
node login.js <username> <password>
```

### Admin server unreachable
- Check `ADMIN_URL` in `.env` points to correct vapi-admin instance
- Verify vapi-admin is running on that port
- Check network connectivity to admin server

### "Invalid credentials"
- Verify username/password are correct
- User exists in vapi-admin
- Credentials haven't changed

## Security Notes

- Tokens are valid for **24 hours** only
- Sessions stored in server memory (cleared on restart)
- Token passed in header (not visible in URLs)
- Credentials validated against vapi-admin only at login time
- No credentials stored in token file or cache
