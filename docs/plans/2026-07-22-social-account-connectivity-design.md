# Social Account Connectivity Design

## Goal

Add OAuth 2.0 Authorization Code + PKCE flows for X/Twitter, Reddit, and Truth Social, allowing users to connect their personal accounts and access personalized feeds.

## Approach

**Selected: Full OAuth 2.0 Authorization Code + PKCE**

Standard OAuth flow with server-side token exchange, encrypted storage in PostgreSQL, and a new SOCIAL ACCOUNTS tab in ConfigModal.

## Database Schema

New `oauth_connections` table:

```sql
CREATE TABLE oauth_connections (
  id              BIGSERIAL PRIMARY KEY,
  provider        TEXT NOT NULL,          -- 'reddit', 'x', 'truth'
  provider_user_id TEXT NOT NULL,         -- platform's user ID
  display_name    TEXT NOT NULL,          -- username/handle
  access_token    BYTEA NOT NULL,         -- encrypted
  refresh_token   BYTEA,                  -- encrypted (nullable for Truth Social)
  token_expires_at TIMESTAMPTZ,
  scope           TEXT,                   -- granted scopes
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);
```

Tokens encrypted with `pgp_sym_encrypt` using `OAUTH_ENCRYPTION_KEY` env var.

## OAuth Flow

1. User clicks "Connect [Provider]" → Client calls `GET /api/oauth/authorize?provider=x`
2. Server generates state + PKCE verifier → Stores in short-lived server-side map (5 min TTL)
3. Server responds with auth URL → Client redirects browser to provider
4. User authenticates → Provider redirects back to `/api/oauth/callback?code=X&state=Y`
5. Server validates state → Exchanges code + code_verifier for tokens
6. Server fetches user info → Gets username/user ID
7. Server encrypts and stores tokens → Saves to `oauth_connections` table
8. Redirects to settings → User sees "Connected as @username"

### Provider Auth URLs

- **Reddit**: `https://www.reddit.com/api/v1/authorize` (scopes: `history identity`)
- **X/Twitter**: `https://twitter.com/i/oauth2/authorize` (scopes: `tweet.read users.read`)
- **Truth Social**: `https://truthsocial.com/oauth/authorize` (scopes: `read`)

### State Management

- In-memory `Map<string, OAuthState>` with 5-minute TTL
- State = `{ provider, codeVerifier, createdAt }`
- Cleanup via `setInterval` every 60 seconds

## UI Design

New "SOCIAL ACCOUNTS" tab in ConfigModal alongside API STATUS, API KEYS, SYMBOLS, GENERAL, HELP.

### Provider Row States

- **Not connected**: Gray badge, provider icon, "Connect to [Provider] →" button
- **Connected**: Green dot, display name, scopes, "Test" + "Disconnect" buttons
- **Connecting**: Spinner during OAuth redirect
- **Error**: Inline error message with retry

### Disconnect Flow

1. Click "Disconnect" → Confirmation modal
2. Confirm → Server deletes tokens from DB
3. Row returns to "Not connected" state

## Token Usage

When user has connected accounts, social feed system:
1. Checks `oauth_connections` for active tokens
2. If found and not expired → Uses user's access token
3. If expired → Attempts refresh with stored refresh token
4. If refresh fails → Falls back to app-level tokens

### API Changes

- `GET /api/finance/social/feed` → Accepts `?user_tokens=true` param
- Returns `{ posts: [...], authStatus: { x: "connected", reddit: "app-level", truth: "connected" } }`

### Token Refresh

- Check expiry before each API call
- Proactive refresh when <5 minutes remaining
- Background refresh job every 10 minutes

## Server Routes

| Route | Method | Description |
|---|---|---|
| `GET /api/oauth/authorize` | GET | Generates auth URL with state + PKCE, returns URL |
| `GET /api/oauth/callback` | GET | Handles provider callback, exchanges code, stores tokens |
| `GET /api/oauth/connections` | GET | Lists all connected accounts with status |
| `DELETE /api/oauth/connections/:provider` | DELETE | Disconnects a provider, removes tokens |
| `POST /api/oauth/test/:provider` | POST | Tests a connection by making a lightweight API call |

## Environment Variables

```env
# OAuth Provider Credentials
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret
X_CLIENT_ID=your_x_client_id
X_CLIENT_SECRET=your_x_client_secret
TRUTH_CLIENT_ID=your_truth_client_id
TRUTH_CLIENT_SECRET=your_truth_client_secret

# Token Encryption
OAUTH_ENCRYPTION_KEY=your_32_byte_encryption_key

# Callback URLs (must match provider registration)
OAUTH_REDIRECT_BASE=http://localhost:3000
```

## Files to Create/Modify

### New Files
- `src/server/oauth.ts` — OAuth flow logic, token exchange, encryption
- `src/server/oauthProviders.ts` — Provider-specific configs (auth URLs, scopes, token endpoints)
- `src/client/src/components/terminal/SocialAccountsTab.tsx` — UI component

### Modified Files
- `src/server/routes.ts` — Add OAuth routes
- `src/server/storage.ts` — Add CRUD for oauth_connections
- `src/shared/schema.ts` — Add oauthConnections table definition
- `src/client/src/components/terminal/ConfigModal.tsx` — Add SOCIAL ACCOUNTS tab
- `src/server/socialFeed.ts` — Support user tokens when available
- `src/client/src/lib/useFinance.ts` — Add hooks for OAuth connections

## Security Considerations

- Tokens encrypted at rest with `pgp_sym_encrypt`
- State parameter prevents CSRF attacks
- PKCE prevents authorization code interception
- Refresh tokens stored encrypted, never sent to browser
- Short-lived state TTL (5 minutes) limits replay window
- No tokens in localStorage/sessionStorage — all server-side

## Testing Strategy

1. Unit tests for token encryption/decryption
2. Unit tests for state generation and validation
3. Integration tests for OAuth callback handling
4. E2E tests for connect/disconnect flow
5. Manual testing with each provider's sandbox environment
