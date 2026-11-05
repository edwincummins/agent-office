# Owner-only workers and tools

The office has one execution owner. Only that account can hire agents, open shells, type/resize/prompt/restart workers, run meetings or queued work, change GitHub state, clone projects, manage accounts, or sign in tools. Other admins, members and shared-password visitors can walk, chat, play, use the whiteboard/decor, read boards and watch terminals. Admin role alone grants no execution authority.

Set `ownerAccountId` to an existing admin account ID in the office data directory's `config.json`. Use an ID, never a display name. If the key is absent, the first-run `accounts.json` owner ID is used (created by the sign-up feature). Empty, invalid, missing-account or malformed configuration fails closed: nobody can execute. Existing offices without a recorded owner require this explicit local configuration. Changing the owner is a local operation, followed by a restart; it cannot be done through browser messages. The accounts command lists IDs. Do not commit real IDs or local configuration.

The WebSocket registry blocks controls before their handlers run. HTTP terminal uploads, worker file reads, model discovery, GitHub detail commands and service forwarding are owner-only too. Worker hooks/MCP require a current owner worker's secret on the loopback Host with no browser Origin. A visitor opening a terminal does not acknowledge a worker's completion or resize its terminal. Every new control handler defaults to owner-only unless deliberately registered as a social action.

Legacy workers without the current owner identity are stopped on startup and kept as offline records; their unclaimed PTYs are terminated. Hire new owner workers rather than transferring old credentials. Legacy queue rows remain visible but do not run. Existing non-owner provider files are not deleted, but they are neither loaded nor used by the office. Non-owners cannot create new provider sign-ins. The owner can keep their own Claude/GitHub profile or explicitly choose the office machine's sign-in. Worker environments omit office/Cadre/Google web and session secrets, retaining only that worker's hook capability.

Anything printed in a terminal is readable by everyone signed into the office. This is access control inside the office, not an OS sandbox: the owner's agents still run as the office's OS user. A person with independent filesystem or direct access to an external service is outside this boundary. Worker service tunnels are owner-only because arbitrary services may offer execution controls; the Services board itself remains readable.

## Verification and QA

`node --import tsx --import=#tests/css --test tests/owner-workers.test.ts tests/size.test.ts tests/auth.test.ts tests/queue.test.ts`

The test-only preview creates synthetic accounts and isolates environment/provider homes:

```sh
node --import tsx tests/fixtures/owner-preview.ts <new-absolute-throwaway-directory> 4640
```

It refuses an existing unmarked directory and known owner ports. `Test Owner` owns it; `Other Admin` and `Test Member` do not. Account password: `synthetic-password-only`; shared password: `synthetic-shared-only`. It runs a synthetic agent and no real provider account. Use only headless browsers and stop the preview immediately after proof. The separate Windows npm-shim fix is required for npm-installed provider helpers on Windows; this PR does not duplicate it. Codex sign-in additions and the profile/crew/travel features are separate work.
