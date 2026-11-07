# Configuration

## Weather reporting

The sky sent to connected clients includes optional `weatherReport` metadata. Older servers may omit it; omission means unknown, not live weather. `source` is `simulated` without a configured city, `pinned` with `--weather`, or `forecast` when using a city's forecast. Forecast `status` starts `pending`, becomes `current` after a successful fetch, `unavailable` if the first fetch fails, and `stale` if a refresh fails after a successful fetch. A successful retry restores `current`. An unresolved city falls back to `simulated` as before.

`fetchedAt` is the Unix receipt time in milliseconds of the last successful fetch, retained across failed refreshes. It is not the provider's observation timestamp. `current` describes the latest successful refresh, not a guarantee of live observations; consumers can compare receipt age with the normal 15-minute refresh interval. Existing rain, snow and lighting behavior stays unchanged during a missed refresh.

In **Settings → Building → Outside**, only the office owner can select **Follow this computer**, enter a city, or restore **Use server default**. These controls select the shared sky for everyone. A location selection switches the sky to real time; the clock buttons remain available for previews. `--weather` still explicitly pins the conditions, and the status says so.

**Follow this computer** requests the browser's normal geolocation permission after a click, using low-accuracy mode and rounding coordinates to two decimal places. Location requires a browser-supported secure context, typically HTTPS or localhost; a denied or unavailable location leaves the existing selection in place and offers the city field. Approximate coordinates are sent to the office server and its existing weather provider, and appear in shared sky state. No IP geolocation service is used.

The chosen city or computer coordinates are saved in `.agent-office/sky-location.json`. The selecting browser stores a random identifier locally; only that selected browser resumes location updates on reconnect, and only when permission is already granted. Selecting a different browser or city stops the previous browser's watcher. While the browser is closed or location is unavailable, the server keeps fetching weather for the last selected position. It cannot detect a computer moving while no location-capable browser is connected. Resetting the selection restores `--city`, or timezone-based sun and simulated weather without it.

The displayed weather receipt age updates while Settings is open. A failed refresh or a receipt at least 30 minutes old is labelled overdue; this does not claim the provider observation was taken at receipt time. This feature changes controls and sky state, not exported background geometry. Maps containing static backdrop images need a separate compatible backdrop update before those images can follow the sky.

## Mouse sensitivity

Open **Settings → You → Mouse sensitivity** to adjust mouse-look from 10% to 200%. The default is 50% of the original speed (0.0011 radians per pixel with pointer lock). Changes apply immediately in every map, including first-person drag and third-person orbit, and are saved only in this browser. **Reset** restores 50%. The 250-pixel clamp on each locked mouse event is unchanged. If browser storage is unavailable, the setting still works for the current visit.

Back to the [README](../README.md).

## Where the office keeps things

The office keeps its data in `~/agent-office` (`--home` or `AGENT_OFFICE_HOME` to move it) and clones projects next to it, as `~/agent-office/<owner>/<repo>`. To clone them somewhere else, like `~/Workspace`, an admin picks the **Workspace folder** in ⚙️ Settings → **🏢 Building** (or start with `--projects` or `AGENT_OFFICE_PROJECTS`). Floors you already have stay where they are, and a checkout of the same repository that's already in the new folder is used as it is. The building's map is in `~/agent-office/.agent-office/map.json`, and maps of your own go in `~/agent-office/.agent-office/maps/` (see [Maps](maps.md)). The list of floors is `~/agent-office/.agent-office/floors.json`, and each account's own Claude and GitHub sign-ins are in `~/agent-office/.agent-office/homes/<account>/` (revoking the account deletes them). Each floor keeps its workers, queue, pictures and worktrees in its own checkout's `.agent-office/`.

Already have a checkout? Pick its repository anyway: a checkout of it that's already where the workspace folder would clone it is used as it is. You can still start the office in a project, `agent-office ~/code/my-project`: that project becomes a floor, and the office keeps its data in `~/code/my-project/.agent-office` as it did before there were floors. An office that already ran in a project carries on in it when you start `agent-office` there again. An admin can take that project off the building in the elevator like any other floor.

## Command line

```
agent-office [dir] [options]

      --home <dir>        Where the office keeps its data without a [dir] (default ~/agent-office)
      --projects <dir>    Where new floors are cloned, as <dir>/<owner>/<repo> (default ~/agent-office;
                          also settable from ⚙️ Settings)
  -p, --port <n>          Port (default 4600, env PORT)
  -H, --host <addr>       Bind address (default 127.0.0.1; 0.0.0.0 lets your network in)
      --password <pw>     Office password (env AGENT_OFFICE_PASSWORD)
      --no-open           Don't open the office in your browser when it starts
      --agent <cmd>       Default agent command (default "claude")
      --agent-args <str>  Extra args for the configured agent, e.g. "--model opus"
      --dsh-profile <n>   DeepSeek Harness profile over ACP (default "acp")
      --tls-cert <file>   Serve HTTPS with this cert…
      --tls-key <file>    …and key
      --self-signed       Serve HTTPS with a generated self-signed cert
      --trust-proxy       Trust X-Forwarded-* (behind Caddy/nginx)
      --turn <url>        Add a TURN server for voice, e.g. turn:user:pass@host:3478
                          (env AGENT_OFFICE_TURN, several separated by spaces)
      --budget <usd>      Daily tracked Claude Code budget (OpenCode/Codex/Grok/Muse/DSH excluded)
      --budget-pause      ...and nobody can hire a new worker until the next day
      --max-workers <n>   Run at most n workers at once, across every floor (env AGENT_OFFICE_MAX_WORKERS)
      --webhook <url>     Post to this Slack / Discord webhook when a worker needs input or finishes
      --city <name>       Put the office in a real city: its sun and live weather (open-meteo.com)
      --weather <kind>    Pin the weather: clear, cloudy, rain, storm, snow or fog
      --real-time-sky     Start the sky on the real clock, not a day an hour (env AGENT_OFFICE_SKY_CLOCK=real; ⚙️ Settings can switch it)

agent-office setup [--projects <dir>] [--project <owner/repo>]... [--home <dir>]

  The first-start walkthrough again: the workspace folder, GitHub sign-in and
  repositories to clone as floors. With --projects / --project it asks nothing.
  Run it while the office is stopped.

agent-office prune [dir] [-n|--dry-run] [-f|--force]

  Removes leftover worker worktrees under .agent-office/worktrees/ and their
  office/* branches, in one floor's checkout (dir). Anything with uncommitted changes or unpushed commits is
  kept unless --force is given. A worker across several projects has worktrees of them in its
  own floor's workspace: prune each project to clear those out.

agent-office accounts [list | invite [name] [--admin] | revoke <name> | role <name> admin|member | password on|off] [-d <dir>]

  Invite, list and revoke people's own accounts, and switch the shared password
  off or on. Works while the office runs.

agent-office tunnel [office@address | url] [--port <n>] [--office-port <n>] [--name <name>] [--password <pw>] [--no-open] [--insecure] [-- <ssh options>]

  On your own computer, for an office that runs somewhere else: every web server
  a worker starts there opens on the same port here, by itself, and closes when
  the worker stops it. Given an SSH address it opens the tunnel to the office too.
  See docs/tunnel.md.
```
