# Sign up and sign in

An office with no accounts offers **Create your office** at `/login`. The first account is admin and owner; its ID is persisted as `ownerAccountId` in the accounts store. First-run creation is available only through a direct loopback connection to a loopback-bound office, with a loopback Host and the configured port. Network listeners and trusted-proxy deployments must create the account locally before exposing the office. This grants the first local visitor ownership; other local programs are within that trust boundary.

Creating the owner disables the legacy shared password. Existing offices keep their accounts and shared-password setting; no existing admin is silently designated owner. Once any account or a saved owner ID exists, open signup is closed. Other people need the owner's single-use invite. Deleting all accounts does not reopen first-run signup while the owner marker remains.

## Optional Google setup

In Google Auth Platform, configure an **External** audience (use Testing initially, with your Google account listed as a test user), app name, support email and developer contact. Create an OAuth client of type **Web application**. For a local office on port 4600, register this exact authorized redirect URI, without a trailing slash:

```text
http://127.0.0.1:4600/auth/google/callback
```

Open the office at `http://127.0.0.1:4600`. Google permits both localhost and loopback IP web-client redirects; using 127.0.0.1 also keeps office cookies separate from a Cadre Web service opened on localhost. This server-redirect flow does not require a JavaScript origin entry. If you deliberately choose another host/port, register its exact callback and use the same origin in the browser and local configuration. Public deployments require HTTPS.

The requested scopes are `openid email profile`; profile supplies the display name. No Drive, Gmail, offline access or refresh token is requested. See Google's [web-server redirect rules](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation) and [OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect).

Set these keys in the office's **local, uncommitted** `.agent-office/config.json`, preserving its other settings:

```json
{
  "google": {
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET",
    "redirectUri": "http://127.0.0.1:4600/auth/google/callback"
  }
}
```

Environment overrides: `AGENT_OFFICE_GOOGLE_CLIENT_ID`, `AGENT_OFFICE_GOOGLE_CLIENT_SECRET`, `AGENT_OFFICE_GOOGLE_REDIRECT_URI`. All three are required; unset or invalid settings hide Google and disable its routes. Never commit credentials or send the secret through chat. These settings configure the office only; they do not set up a Cloud client automatically.

Google signup is permitted for the first local owner or an invited person. Existing Google accounts sign in by verified issuer and subject ID, with a verified email. Names and matching emails never automatically link a password account. To link your existing password account, sign in with its password, visit `/login`, and choose **Link Google to this account**. You must still be signed into that same account at the callback. An existing different Google identity cannot be replaced through this flow. Google sign-in grants the same office session and access to **Your sign-ins** as password login; it does not sign you into Claude, GitHub or other agent providers.

## Security and limits

The code flow uses PKCE S256, random state/nonce, an HttpOnly SameSite=Lax browser cookie and a single-use server flow expiring after ten minutes. Redirects come from fixed configuration, never the request Host. ID tokens require RS256 signatures, matching issuer/audience/authorized party, nonce, bounded lifetime, subject and boolean verified email. Google's JWKS is pinned to its HTTPS endpoint, cached with timeouts; no production issuer override exists. Token responses and secrets are never sent to the browser or logged.

Password guesses have independent canonical account-name and IP budgets of ten failures/in-flight attempts per five minutes. A success clears only that account's failures and releases only its own IP attempt; it does not erase earlier IP failures. Signing in to another account cannot clear the victim's budget; query strings, path encoding and normalized name aliases do not create new budgets. Invites use a token-digest budget. Google has separate flow/IP/subject budgets so password lockout does not disable Google; successful callbacks likewise release only their own IP attempt. Budgets are process-local and reset when the office restarts. Password-session epochs persist across restarts. Logout revokes the current cookie in the running process; this revocation list is not persisted across restarts.

## QA with a fake provider

Production configuration cannot select a fake provider. The test-only harness injects one through the route registry; it is not shipped in the npm package. Build first, then run on a disposable absolute home and unused test port:

```text
node --import tsx tests/fixtures/onboarding-preview.ts <absolute-throwaway-home> 4638 http://127.0.0.1:FAKE_PORT
```

The fake provider serves `/.well-known/openid-configuration`; issuer and all endpoints must match its supplied origin. Client credentials are `synthetic-client` / `synthetic-secret`; callback is `http://127.0.0.1:4638/auth/google/callback`. The first created account is the test owner. Omit the fake URL to test Google-off behavior. Stop the preview immediately after testing. Use only headless browsers with disposable profiles.

`verifyIdToken(token, {issuer, jwks, clientId, nonce, now})` is exported from `src/server/onboarding/oidc.ts`; `jwks` is a jose `createRemoteJWKSet` or `createLocalJWKSet` resolver and `now` is an optional Date. This allows token fault cases without weakening the production provider. Real Google consent/token exchange requires your Cloud client and is not established by synthetic tests.

The sign-in page shows the leave-name-blank note only while shared-password entry is enabled. First-owner signup turns shared entry off; existing offices that retain it keep that hint. Invitation guidance uses separate labelled paragraphs beneath the form.

## Local password recovery

Google-first accounts can open **Your character** (profile) and choose **Set a password** while signed in. This adds their first password without unlinking Google. The action applies only to the authenticated account, requires same-origin requests, and rechecks the session after hashing. The profile closes when this dialog opens; X/Esc use the normal return-to-office modal path. Accounts created by older builds without the first-password marker can use local recovery instead.

If Google is unavailable, run `agent-office accounts password "Your account name" --dir <office-directory>` on the office machine, supplying one password line through stdin. Passwords are never accepted as command arguments. For example, with Python installed, this prompts without echoing the password or putting it in command history:

```sh
python -c "import getpass; print(getpass.getpass('New password: '))" | agent-office accounts password "Your account name" --dir <office-directory>
```

Use 8–512 characters. Local filesystem access is the authority for this recovery command; there is no HTTP recovery endpoint for arbitrary accounts. It preserves account ID, owner role and Google identity. Setting or resetting a password bumps a persisted per-account session epoch: older cookies are rejected and that account's other office/service WebSockets close within the one-second poll (incoming office messages are refused immediately). Profile setup renews only its initiating browser session; local CLI recovery signs out every session for that account. Other accounts are unaffected. For an account literally named `on` or `off`, use `accounts password --account "on"` (or `"off"`) to distinguish it from the legacy shared-password switches; ambiguous names are refused.

First-owner creation rejects any `X-Forwarded-*`, `Forwarded`, `X-Real-IP` or `Via` header, even on loopback, for both password signup and Google admission/callback. Open an unclaimed office directly, without a reverse proxy. Uninvited Google identities do not create accounts; a named invite supplies the new account's name rather than Google's display name.
