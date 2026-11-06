# Cadre crew people

The crew feature consumes the existing owner-only fleet subscription. It creates no workers, terminals, credentials or extra fleet polling process. Only account IDs in the local Cadre owner allow-list receive the feed; another admin or shared-password visitor sees no people, tags or counts. The separate Cadre watch panel may still show its owner-configured guest feed; guest frames never create crew people. Revocation and disconnect clear the scene and open card.

Each running seat gets a stable appearance and team shirt. Tags use the same state colors as the Cadre board. Amber pins identify needs-you seats; stuck seats lower their heads. E opens a read-only card with activity, reason and an honestly labeled observed timestamp when available. The standard modal close and Esc restore mouse-look.

## Map places

A map opts in with `fixtures.crew`. Missing or invalid crew data means no crew. Invalid crew reports a `fixtures.crew` path warning without discarding the rest of the map. Resolved data is available as `plan().slots.crew`. Coordinates belong to map files, not renderer code. Purchased-room coordinates stay local.

```json
{"crew":{"zones":[{"id":"waiting","defaults":{"rotY":0,"pose":"stand"},"places":[{"x":3,"z":3},{"x":4,"z":3}],"gapBetweenTeams":true,"marker":{"kind":"post","offset":{"x":0.85,"y":0,"z":0}}}],"overflow":{"x":4,"z":3,"rotY":0}}}
```

Place x/z must be inside the map bounds; y defaults to zero. Each place may override rotY, pose, seatHeight and marker offset. Optional `tagLift` (0–1 metre) raises back-row labels; the stock back row uses 0.18 metre. Unknown crew keys are rejected with their path. A seated place needs seatHeight between 0.3 and 1.2 metres. Marker kind is post or tent. Offsets rotate in the place frame: +z forward, +x the person's left. The stock office has 34 public places in `src/shared/fixtures/crew-stock.ts`.

Limits: 8 zones, 64 places, finite numbers, no place within 1.5 metres of arrival or within the one-metre half-width corridor extending seven metres behind its facing. The same validation runs when mounting a model map. Include the default camera corridor when converting an office; never use worker seats for crew places.

Teams and seats initially follow feed order. Surviving people retain their positions when others join or leave; vacancies are reused. A team change reforms the blocks and updates its shirt colour. Empty inter-team places are dropped first on overflow. The overflow marker reserves its own place if coincident. Needs-you and stuck seats displace idle, then other nonurgent seats when capacity is exhausted; excess seats remain on the Cadre board. Urgent seats in the final zone trade with idle seats in earlier zones. If urgent seats alone exceed capacity, they cannot all be drawn. A seated needs-you person stands 0.35 metres behind their stool.

## Rendering and testing

One BatchedMesh draws the reduced-tessellation Person proportions; atlases draw tags/pins and team markers, and one instanced batch draws contact shadows. No crew casts shadow-map shadows. Four draws on browsers with WEBGL_multi_draw; without that extension the fallback uses seven part-geometry batches, ten draws total. Verify performance on the target device. Tags fit the name up to 0.6 metre wide and 0.12 metre high, with roughly 0.08 metre text capped at 22 CSS pixels up close. Place post markers one full 0.85 metre place toward the team gap. If overflow fills that gap, the marker moves to the nearest clear side of its block; it never occupies a person. Labels fade between 14 and 16 metres; amber pins remain visible. Each atlas uploads once at creation. Later updates repaint and copy only changed 256 x 128 pixel cells; unchanged names and pins retain their texture cells.

Picking uses analytic capsules, never room geometry or rendered body parts. Map-wide usable sources explicitly opt in, so stock-only interactions remain off custom maps.

Run `node --import tsx --import=#tests/css --test tests/crew.test.ts tests/fleet-owner.test.ts tests/fixture-slots.test.ts tests/client-structure.test.ts tests/size.test.ts`, then typecheck and build. The existing synthetic fleet-command fixture can exercise stopped, stuck, waiting, needs-you and 32-seat inputs without live fleet data. For GPU proof, measure the same pose with the crew visible and hidden, whole-frame renderer counters, headless Chrome, and a fresh disposable office.

The synthetic `tests/fixtures/crew-command.ts` accepts a count or a local JSON path containing `{"count":32,"states":{"31":"needs-you"}}`. Editing the file changes the next poll; counts from 0 through 64 are bounded. Keep fixtures and generated screenshots local.
