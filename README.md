# Common Ground — Metropolis

An original TypeScript / Three.js / Rapier city running entirely in a browser. Buildings, pedestrians, vehicles, trees, furniture, textures, and sound are made procedurally from scratch. No downloaded models or external asset services are required.

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

`inhabitants.ts` creates seeded bodies with tapered torsos and limbs, procedural faces, hair, skin, clothing, hands, hats, bags, and backpacks. Hip, knee, ankle, shoulder, elbow, and wrist hierarchies animate with two-bone leg IK, planted-foot compensation, arm swing, breathing, head movement, pauses, and impact flight. Nearby faces and fingers receive finer detail. Animated geometry is instanced globally; distant actors are culled. People currently follow district sidewalk loops; traffic follows local road routes with alternating priority, spacing, and impact stops. This is local street life, not a citywide commuting simulation.

## Destruction and physics

`destruction.ts` removes individual geometry instances and subdivides them into physical fragments retaining their original dimensions. Each floor tracks its slab and four supports. Losing its slab or two supports propagates staged collapse upward; lower floors survive upper-floor damage. Buildings use explicit ownership references so district loading cannot invalidate structural identity.

Rapier supplies gravity, friction, rotation, sleeping, collision, stacking, continuous collision detection, and ragdoll joints. Vehicles and pedestrians retain their component geometry during fragmentation. Street furniture, road sections, paving, roofs, and facades can break. Rubble affects walking height. The foundation and surrounding landscape provide a stable underlying ground plane.

This is a real-time approximation, not engineering-grade structural analysis. Floor dependency chains replace finite-element stress, fragment collision uses box approximations, and intact walking uses footprint collision. Thin glazing and decorative trims do not each require static colliders. Pools cap rigid bodies at 650 and dust volumes at 100. Old fragments fade after 40 seconds or are recycled when the pool fills; large demolition cannot accumulate unlimited rubble.

`physics.ts` owns the WASM world and a fixed 60 Hz step with at most three substeps per frame. `audio.ts` synthesizes ambience, footfalls, and impacts. `sky.ts` supplies the sky shader; `surfaces.ts` generates original material textures. `main.ts` owns camera, lighting, postprocessing, controls, and lifecycle.

## Validation and performance

`npm test` verifies kilometer-scale deterministic plans, option bounds, architectural variety, detail-dependent geometry, structural graphs, streamed collapse, LOD damage reconstruction, seeded human variation, finite joint animation, foot IK, walking collision, partial collapse, fragment caps, physical stacking, ragdoll stability, road damage, restoration, and disposal without a GPU. Browser checks cover the production worker, presets, navigation, street/aerial views, live detail budgets, tools, and runtime errors.

Performance uses instanced static and animated meshes, sliced assembly, a worker, capped pixel ratio, and one shadow-casting light. The observed New York preset runs around 60 FPS in the tested browser; actual performance depends on hardware and selected detail/crowd budgets. Read-only DOM telemetry on the main canvas and `window.cityDiagnostics()` support QA.

Application code, Three.js, and Rapier are separate production chunks. Rapier includes WASM in a roughly 4.3 MB JavaScript chunk (about 1.7 MB gzip); the engine chunk-size warning is expected. There is no runtime CDN dependency other than optional Google Fonts with local fallbacks.
