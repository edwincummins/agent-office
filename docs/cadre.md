# Cadre on the Services board

Only the locally allow-listed owner can select **Services | Cadre** in the Services board's upper-right corner. Aim at a segment and click or press **E**, or press **B** while aiming at the board. **E** on the board opens the selected view. Services retains its existing scanner, content and dialog. All other accounts (including administrators) and shared-password visitors see plain Services and receive no fleet data.

The choice is browser-local and independent for each floor and environment. `agent-office.boardModes` stores an object whose keys are JSON-encoded `[floorId, environmentId]` pairs and whose values are `services` or `cadre`. Missing or malformed entries default to Services. Blocked storage still permits switching for the current visit.

## Fleet source

Add the following optional object to the server's `.agent-office/config.json`, preserving its other fields:

```json
{
  "cadre": {
    "fleetCommand": ["node", "<cadre-engine>/bin/cadre.js", "fleet"],
    "ownerAllowlist": [{"id": "<owner-account-id>"}]
  }
}
```

The allow-list is local only: exact account IDs or names (`{"name":"<owner-name>"}`); entries with both require both to match. The named account must also be an administrator. Missing, empty or unreadable allow-lists deny everyone and disable polling. Never commit real identities. Prefer IDs so a renamed or recreated account cannot inherit access.

Alternatively, `AGENT_OFFICE_FLEET_COMMAND` is a JSON executable/arguments array. It overrides the file setting. Restart the office after changing server configuration. Unset means off: no command and no fleet messages. The source is the configured fleet command; no second shared-state reader runs.

The server polls every 5 seconds, with a 4-second timeout, a 1 MiB output cap and no overlapping runs. It invokes an executable directly, without a shell. Configure an executable such as Node rather than a shell launcher. Output must contain `teams`, `seats`, `needs` arrays and a `tasks` object. Only a bounded display projection is sent; raw inbox, access, task and evidence fields stay off the wire. Activity and need-summary text is private to the owner but may itself contain information supplied by the fleet source.

Invalid output and failures preserve the last good snapshot with an explicit stale marker. Recovery clears that marker. Unchanged normalized snapshots are neither transmitted nor redrawn. The stuck clock starts when this office observes unchanged activity with work; restarting the office resets that observation clock.

| Priority | Seat state |
| --- | --- |
| 1 | Stopped: source status is not `running`. |
| 2 | Needs you: a need names the seat, or a rig-wide need names its rig. |
| 3 | Stuck: activity has remained unchanged for at least 20 minutes while work exists. |
| 4 | Working: positive work count, a task, or working activity. Otherwise idle. |

The board uses one fleet canvas on the existing board mesh and two flat switch segments. It introduces no new wall. Up to eight team tiles fit; excess seats and teams have explicit overflow counts. Open the panel to read every seat and expand its full activity. Closing the panel by its top-right ✕ or Esc uses the office's normal mouse-look restoration.

## Cadre Web integration

The public office contains no Cadre application code. Until a compatible Cadre Web service is available, the panel is labeled **Read-only preview** and offers no sign-off actions.

Optional server settings are `cadre.webUrl` and `cadre.webToken`, overridden by `AGENT_OFFICE_CADRE_WEB_URL` and `AGENT_OFFICE_CADRE_WEB_TOKEN`. Keep the token in local server configuration, never a URL. The URL must use HTTP(S) and a literal loopback host (`localhost`, `127.0.0.1` or `[::1]`), with no credentials, query or fragment. A token is required.

Open the office at `http://127.0.0.1:<office-port>`. The office starts a dedicated loopback gateway on `http://localhost:<ephemeral-port>` for the embedded app. Cookies are hostname-scoped, not port-scoped; this separate hostname isolates office cookies. Other office hostnames and HTTPS use the labeled fallback. This setup is for a browser on the same machine.

The owner-only `/api/cadre/embed` wrapper embeds the real app through that gateway; no Cadre app code is copied into this repository. The upstream token stays on the server. The child receives an opaque 30-minute gateway grant tied to the office account. Every authenticated gateway request rechecks the account and local allow-list, so removal immediately denies further requests; the fleet subscription is revoked within one second. Closing the iframe does not invalidate an already-issued grant; it expires after 30 minutes. Only the documented fleet, capture, message, decision and authentication endpoints are forwarded, with no upstream redirects.

The wrapper's CSP confines its child to the gateway origin. Frames omit referrers and permit only scripts, same-origin behavior and forms. Authentication messages target the exact child origin/window. The panel closes on office disconnect or loss of access.

`.agent-office/cadre-audit.jsonl` records panel opens and embeds, plus each message, decision and screen request/result with timestamp, office account ID/name, target and HTTP result. Tokens, message text and screen contents are excluded. An unwritable audit log blocks the action before forwarding. A request without a result indicates interrupted or failed transport; it must not be treated as proof of completion. Protect and rotate this local log as needed.

The proposed bridge contract, to be implemented and verified by the separately hosted app:

1. Child sends `{type: 'cadre.web.ready'}` to its parent.
2. Wrapper replies `{type: 'cadre.web.authenticate', token}` to the configured origin.
3. Child validates the token before rendering private data or accepting actions, then sends `cadre.web.connected` and `cadre.web.heartbeat` at least every 2 seconds while its backend is reachable and authentication remains valid. A timer alone must not claim backend health.
4. Child forwards Escape as `cadre.web.close`, including when an internal control has focus. Cross-origin keyboard events cannot bubble to the office.

Without connection/heartbeat for 6 seconds the panel returns to its labeled fallback. A fully working Cadre integration, action round trips and token expiry/revocation remain dependent on the Cadre Web implementation; a demonstration stub does not prove them. The upstream token is never issued to the browser.

## Synthetic checks

From a source checkout, `node --import tsx tests/fixtures/fleet-command.ts` prints a synthetic five-seat feed. Add `--32` for four teams of eight seats. Point `fleetCommand` at that command for deterministic board and access checks. No live fleet data is included in these fixtures.

`node --import tsx --import=#tests/css --test tests/fleet.test.ts tests/fleet-owner.test.ts` covers state precedence, the stuck threshold using a controlled clock, stopped-seat restart, empty/32-seat input, stale recovery, unchanged suppression, no overlap, timeout, owner allow-list authorization, clipping, local mode memory and loopback configuration. The stuck fixture is tested by advancing that clock, not by changing the production threshold.

For an explicitly synthetic embed probe, set `CADRE_STUB_TOKEN` to a disposable local value and run `node tests/fixtures/cadre-web-stub.mjs` (port 4634 by default, or `CADRE_STUB_PORT`). Configure `cadre.webUrl` with the alternate loopback hostname and the same value in `cadre.webToken`. The probe authenticates before enabling its test counter, forwards Escape and verifies backend reachability for heartbeats. It is not Cadre and proves no real sign-off action.

On Windows, command timeout, shutdown cancellation and excessive output terminate the process tree with `taskkill /T /F` while the command parent is still alive. The poll remains occupied until cleanup completes (up to a further two seconds). Cleanup failure is reported separately; the parent is then killed as a fallback. A configured executable should not deliberately detach descendants from its process tree.

When the engine supplies `seat.state`, its `key` is authoritative (`you` maps to needs-you); `why` supplies the stuck reason or waiting teammate. Stopped processes remain stopped. Only older feeds without `state` use the 20-minute inference above. Unknown or malformed explicit states show as unknown on that seat only (an open need still wins and shows amber); other seats remain live. A later recognized state recovers normally. Waiting is blue, distinct from amber needs-you. The board and expanded fallback row show reasons; “since” is when this office first observed that state/reason, not an engine-certified start time. The board shows no age; the panel labels the timestamp “seen stuck since” (or “seen waiting since”). The synthetic command includes explicit stuck and waiting examples; the legacy fixture still exercises inference.
