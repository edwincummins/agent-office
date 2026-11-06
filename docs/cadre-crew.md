# Cadre crew people

The crew feature consumes the existing owner-only fleet subscription. It creates no workers, terminals, credentials or extra fleet polling process. Only account IDs in the local Cadre owner allow-list receive the feed; another admin or shared-password visitor sees no people, tags or counts. Revocation and disconnect clear the scene and open card.

Each running seat gets a stable appearance and team shirt. Tags use the same state colors as the Cadre board. Amber pins identify needs-you seats; stuck seats lower their heads. E opens a read-only card with activity, reason and an honestly labeled observed timestamp when available. The standard modal close and Esc restore mouse-look.

## Map places

A map opts in with `fixtures.crew`. Missing or invalid crew data means no crew. Invalid crew reports a `fixtures.crew` path warning without discarding the rest of the map. Resolved data is available as `plan().slots.crew`. Coordinates belong to map files, not renderer code. Purchased-room coordinates stay local.

```json
{"crew":{"zones":[{"id":"waiting","defaults":{"rotY":0,"pose":"stand"},"places":[{"x":3,"z":3},{"x":4,"z":3}],"gapBetweenTeams":true,"marker":{"kind":"post","offset":{"x":0.5,"y":0,"z":0}}}],"overflow":{"x":4,"z":3,"rotY":0}}}
```

Place x/z must be inside the map bounds; y defaults to zero. Each place may override rotY, pose, seatHeight and marker offset. A seated place needs seatHeight between 0.3 and 1.2 metres. Marker kind is post or tent. Offsets rotate in the place frame: +z forward, +x the person's left. The stock office has 34 public places in `src/shared/fixtures/crew-stock.ts`.

Limits: 8 zones, 64 places, finite numbers, no place within 1.5 metres of arrival or within the one-metre half-width corridor extending seven metres behind its facing. The same validation runs when mounting a model map. Include the default camera corridor when converting an office; never use worker seats for crew places.

Teams and seats retain feed order. Empty inter-team places are dropped first on overflow. The overflow marker reserves its own place if coincident. Needs-you and stuck seats displace idle, then other nonurgent seats when capacity is exhausted; excess seats remain on the Cadre board. Urgent seats in the final zone trade with idle seats in earlier zones. If urgent seats alone exceed capacity, they cannot all be drawn. A seated needs-you person stands 0.35 metres behind their stool.

## Rendering and testing

One BatchedMesh draws the reduced-tessellation Person proportions; atlases draw tags/pins and team markers, and one instanced batch draws contact shadows. No crew casts shadow-map shadows. Four draws on browsers with WEBGL_multi_draw; without that extension the fallback uses seven part-geometry batches, ten draws total. Verify performance on the target device. Labels fade between 14 and 16 metres; amber pins remain visible. Atlas uploads occur only on changed snapshots; the current implementation uploads the bounded atlas rather than individual canvas cells.

Picking uses analytic capsules, never room geometry or rendered body parts. Map-wide usable sources explicitly opt in, so stock-only interactions remain off custom maps.

Run `node --import tsx --import=#tests/css --test tests/crew.test.ts tests/fleet-owner.test.ts tests/fixture-slots.test.ts tests/client-structure.test.ts tests/size.test.ts`, then typecheck and build. The existing synthetic fleet-command fixture can exercise stopped, stuck, waiting, needs-you and 32-seat inputs without live fleet data. For GPU proof, measure the same pose with the crew visible and hidden, whole-frame renderer counters, headless Chrome, and a fresh disposable office.
