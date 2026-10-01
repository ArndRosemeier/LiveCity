# Common Ground — Metropolis

An original TypeScript / Three.js / Rapier city running entirely in a browser. Models and sound are created procedurally from scratch. Nearby people also use original AI-generated photographic skin and face references, bundled locally; no downloaded human models or runtime asset services are required. [Asset provenance and exact generation prompts](docs/people-assets.md).

## Run

```sh
npm install
npm run dev
npm test
npm run build
npm run preview
```

Open the printed local URL. The build checks the full TypeScript project and bundles the generation worker and Rapier WASM locally.

## Create and explore

Ten sliders control grid extent, block size, built density, skyline height, architectural variety, people, traffic, facade detail, street-detail radius, and the number of detailed districts. **Apply city settings** regenerates the city. Radius and district budget also update immediately. Presets provide Metropolis, New York scale, and Old town. The complete seed and configuration are encoded in the URL.

The grid supports 4–64 blocks on each axis, with 48–100 meter blocks: up to roughly 6.4 kilometers across and more than 14,000 buildings at full density. The New York preset is an interpretation of metropolitan scale, not a geographic reconstruction of New York.

- Drag to orbit, scroll to zoom, or choose **Walk the streets**.
- **WASD / arrows** move, **Shift** sprints, **Space** jumps. **Esc** releases the mouse. **Tab** switches walking/aerial mode; **M** opens settings while walking. If mouse capture is refused, drag to look.
- Use **Explore the grid** to visit a numbered district in the current perspective. Street detail grows progressively around the destination.
- Change the time of day for sunlight, sky, and illuminated windows. Sound is opt-in.
- Enable **Destruction tools**: click for an impact; **E** for a larger blast. Walking tools use the crosshair with a 45 meter range. A distant proxy first requests structural detail; click again after it has grown to damage it.
- **Restore** or **R** regenerates the original city. Applying a seed or generation change also resets damage.

Keyboard and mouse with desktop WebGL are required for walking and tools. The interface adapts to smaller screens; touch walking is not implemented.

## Streaming architecture

`plan.ts` creates a compact deterministic master plan. Street spacing, parks, building styles, colors, footprints, merged office lots, heights, and a central skyline gradient vary with the seed. The whole skyline is immediately rendered with instanced massing and shader windows. Detailed city geometry is generated only for nearby districts.

`generation.worker.ts` runs `generation.ts` off the main thread and transfers packed geometry records. `streaming-city.ts` prioritizes proximity and camera visibility, assembles records in slices, swaps district proxies for detailed instances, and evicts distant detail. The detail radius and district budget bound the active neighborhood. Colliders are normally registered for only the closest four districts, with additional registration on impact. Incomplete collapses retain their district until the structure has finished falling.

Eviction stores removed part indices, building collapse levels, and surviving inhabitants. Revisiting regenerates identical geometry and reapplies that snapshot, including the reduced distant massing. Damage persists across LOD transitions within the current session; it is not saved across page reloads.

Detailed architecture includes floor slabs, structural columns, actual window apertures, glazing, mullions, storefronts, cornices, balconies, brownstone chimneys, tenement fire escapes and water tanks, industrial roofs, HVAC, Art Deco crowns, and stepped towers. This remains a procedural visual vocabulary, rather than photorealistic reconstructions of individual buildings. `world.ts` retains the original compact generator as a regression fixture; the application uses `StreamingCity`.

`inhabitants.ts` creates seeded bodies with tapered torsos and limbs, procedural faces, hair, skin, clothing, hands, hats, bags, and backpacks. Hip, knee, ankle, shoulder, elbow, and wrist hierarchies animate with two-bone leg IK, planted-foot compensation, arm swing, breathing, head movement, pauses, and impact flight. Nearby faces and fingers receive finer detail. Animated geometry is instanced globally; distant actors are culled. Nearby residents now follow persistent citywide schedules, with local crowd avoidance, danger reactions, and traffic braking.

Close residents use a separate anatomical sculpt, landmark-warped facial pigment, layered wet eyes, blinking lids, pore relief, thin-tissue light diffusion, finer fingers, directional hair strands and a connected implicit garment mesh. A dedicated `human.worker.ts` builds these meshes serially and transfers geometry buffers; distant proxies remain visible until detailed people arrive. Shared maps and a bounded near cache keep the cost local. **The people of Common Ground** opens a portrait studio for inspecting faces and gait. This is a substantial realism improvement; hair volumes, anatomy and animation still need work before the people can be called photorealistic. [Implementation, experiments and remaining limits](docs/realistic-people.md).

## Destruction and physics

`destruction.ts` removes individual geometry instances and subdivides them into physical fragments retaining their original dimensions. Each floor tracks its slab and four supports. Losing its slab or two supports propagates staged collapse upward; lower floors survive upper-floor damage. Buildings use explicit ownership references so district loading cannot invalidate structural identity.

Rapier supplies gravity, friction, rotation, sleeping, collision, stacking, continuous collision detection, and ragdoll joints. Vehicles and pedestrians retain their component geometry during fragmentation. Street furniture, road sections, paving, roofs, and facades can break. Rubble affects walking height. The foundation and surrounding landscape provide a stable underlying ground plane.

This is a real-time approximation, not engineering-grade structural analysis. Floor dependency chains replace finite-element stress, fragment collision uses box approximations, and the player uses a swept volume with substeps, clearance checks, gravity, roof landings, and energy-based impacts. Thin glazing and decorative trims do not each require static colliders. Pools cap rigid bodies at 650 and dust volumes at 100. Old fragments fade after 40 seconds or are recycled when the pool fills; large demolition cannot accumulate unlimited rubble.

`physics.ts` owns the WASM world and a fixed 60 Hz step with at most three substeps per frame. `audio.ts` synthesizes ambience, footfalls, and impacts. `sky.ts` supplies the sky shader; `surfaces.ts` generates original material textures. `main.ts` owns camera, lighting, postprocessing, controls, and lifecycle.

## Validation and performance

`npm test` verifies kilometer-scale deterministic plans, option bounds, architectural variety, detail-dependent geometry, structural graphs, streamed collapse, LOD damage reconstruction, seeded human variation, finite joint animation, foot IK, walking collision, partial collapse, fragment caps, physical stacking, ragdoll stability, road damage, restoration, and disposal without a GPU. Browser checks cover the production worker, presets, navigation, street/aerial views, live detail budgets, tools, and runtime errors.

Performance uses instanced static and animated meshes, sliced assembly, a worker, capped pixel ratio, and one shadow-casting light. Actual performance depends on hardware and selected detail/crowd budgets. Close skinned people and contact shadows increase GPU cost; their controls allow adjusting that cost. Read-only DOM telemetry on the main canvas and `window.cityDiagnostics()` support QA.

Application code, Three.js, and Rapier are separate production chunks. Rapier includes WASM in a roughly 4.3 MB JavaScript chunk (about 1.7 MB gzip); the engine chunk-size warning is expected. There is no runtime CDN dependency other than optional Google Fonts with local fallbacks.

## Player, lives, and interiors

Mouse wheel changes third-person camera distance, down to first person. **F** toggles flight; **Space** rises and **Ctrl / C** descends. The procedural player banks and poses in flight, with subtle hand trails.

**Numpad + / −** grows or shrinks the player (ordinary + / − also works). Clearance can prevent growth. Constant-density mass scales with volume; stride, speed, jump height, collision energy, and giant footstep forces change with size. Gravity remains constant.

**G** enters a nearby building, opens a room door, exits at the ground-floor entrance, or inspects a resident. **Visit building entrance** finds a door in the selected district. At the rear lift, **U / J** or the floor buttons travel between floors.

`life.ts` maintains resident identities, home/work/shop assignments, daily schedules, hunger, energy, earnings, deaths, displacement, and traffic delays in compact arrays and sparse event records. The New York preset has 138,240 residents; maximum settings support 491,520. Offscreen travel is evaluated analytically from the simulation clock, with needs and spatial indexing updated in bounded batches. Only nearby residents receive articulated models and local reactions. They commute, work, shop, return home, and sleep. A game hour takes five real minutes. Social relationships and an economic market are not implemented.

Nearby pedestrians avoid crowds, flee danger and giant players, and appear on their scheduled interior floor. Driver-owned vehicles accelerate, brake for people and vehicles ahead, wait at alternating intersection signals, and stop for rubble. Travel delays persist when models are evicted. Building collapse displaces occupants into evacuation; destroyed actors remain dead for the session.

`interiors.ts` generates only the entered building's current floor, with a central corridor, four furnished rooms, hinged room doors, and a lift. Floors have 2.88 meters of clear height and fit the actual setback footprint; tower floors retain usable dimensions. Entrance and room doors have physical collision openings. Furniture and interior walls share the destruction system, and interior damage survives floor changes and re-entry. Lift travel replaces stair geometry. Interior and resident state persist within the running session, not across reloads.

Additional tests verify deterministic resident schedules and needs, displacement, scaled mass and jumping, collision clearance, flight, camera obstruction, livable room dimensions, interior collider disposal, room doors, lift travel, and damage surviving re-entry.

## Beauty and actor-awareness pass

**Meet the residents** opens a seed-matched portrait studio with orbit, zoom, full-body and walking views. The simulation pauses while it is open. **Close character detail** sets a 4–32 person budget. The player and nearest residents use original weighted anatomical surfaces (`human-surface.ts`), with shaped facial features, fingers, clothing folds, seeded hair, procedural skin/fabric textures, and a blink morph. Surface construction is limited to one new near resident per frame; hysteresis prevents rapid LOD churn. Distant residents retain instanced articulated proxies. These people remain stylized, not photorealistic. See [the realistic-human strategy](docs/realistic-people.md).

Lighting now includes seed-generated environment reflections and optional walking-mode contact shadows. Cars have shaped continuous coachwork; trees have sloping branches and clustered crowns. Street detail adds visible traffic and pedestrian lamps, stop lines, drains, manholes, hydrants, bins, bicycle racks, utility cabinets, tram shelters, rails, and overhead catenary. Older neighborhoods also receive distribution wires. All of these use the streamed destructible part system. Tree crowns and signal/catenary attachments lose support when their trunk or post is destroyed.

`traffic.ts` uses a spatial hash, short-horizon conflict prediction, and repeated simultaneous separation constraints. Pedestrians respect street obstacles and crossing phases. This is a bounded local steering solver, not a complete ORCA implementation. Vehicle signals and visible lamps share green, amber, clearance, and pedestrian phases; cars use separate right-hand lanes and brake for actors and rubble. Indoors, residents use furniture slots or free floor positions; departures include a simulated lift delay.

`transit.ts` maintains deterministic service timetables independent of streamed models. Original streetcars accelerate, stop at stations, open doors, brake for actors and signals, and stop for damaged rails or wires. The New York preset provides 16 lines and 96 vehicles distributed across the city; only nearby services are rendered. Terminal loops are compact visual approximations, not engineering-accurate tram curvature. Passenger boarding, transit-based resident journeys, and a power-network simulation are not implemented.

Elevated interior support now comes from the actual intact floor footprint. Leaving a floor through a broken wall, stepping through a destroyed slab, or losing the active floor to collapse releases the player into gravity instead of keeping them at the previous floor height.

Regression tests cover skin weights and animated deformation, deterministic surfaces, head-on crowd passing and wall exclusion, exclusive signal phases, continuous tram timetables, supported street attachments, and falling after leaving an upper floor.
