# Common Ground

A TypeScript / Three.js / Rapier city that runs entirely in the browser. Every model is authored in procedural geometry: buildings, people, cars, trees, furniture, and landscape. All sound is locally synthesized. No model packs or external asset services are used.

## Run

```sh
npm install
npm run dev
```

Open the printed local URL. `npm run build` checks TypeScript and creates `dist`; `npm run preview` serves the production build.

## Explore

- Drag to orbit; scroll to zoom. Choose **Walk the streets** for first-person exploration.
- **WASD / arrows** move, **Shift** sprints, **Space** jumps. **Esc** releases the mouse. Click the scene to resume. **Tab** switches between walking and aerial views. **M** or **City settings** opens the editor while walking.
- Edit **City DNA** and press Enter to regenerate. Seeds are included in the URL for sharing. **Restore** or **R** regenerates the original city.
- Set the hour for changing sunlight, sky, and illuminated windows. Sound is opt-in.
- Enable **Destruction tools**: click for a local impact; **E** for a larger blast. Aerial blasts use the last pointed location; walking tools use the crosshair. Walking range is 45 meters.

## Architecture and limits

`world.ts` uses a deterministic PRNG to assemble hollow building floors and original articulated inhabitants. Static geometry is batched by shape and material with Three.js instancing. People and cars animate independently. Walking uses building-footprint collision and gravity; traffic alternates priority at intersections.

`destruction.ts` removes individual instances and subdivides nearby geometry into fragments that preserve the original dimensions. Each floor explicitly tracks its slab and four corner supports. Losing its slab or two supports propagates a staged collapse upward; lower floors survive upper-floor damage. A pool of at most 650 fragments uses Rapier rigid bodies with gravity, collision, friction, rotation, sleeping, and continuous collision detection; 100 dust volumes cap particle work. Bodies stack and collide with other fragments and surviving structural elements. Vehicles retain their component geometry during fragmentation; pedestrians retain their geometry and use fixed and spherical joints for an articulated fall. Settled rubble affects walking height and blocks steps that are too high. Road sections, pavement tiles, facade sections, vehicles, people, and street props can break; the underlying foundation and distant landscape provide a stable ground plane.

This is a real-time approximation, not engineering-grade structural analysis. Support tracking models a simplified floor dependency chain, not finite-element stress. Fragment collision uses box approximations. Static collision includes floor slabs, corner supports, masonry bands, roofs, and paving; thin glazing and decorative trims do not need individual colliders. Walking uses footprint collision for intact buildings and cars, plus physics queries for rubble height. Old fragments fade after 40 seconds or are recycled when the budget fills. Large demolition remains bounded rather than accumulating unlimited rubble.

Seeded generation is reproducible; debris scatter is intentionally nondeterministic. Layout is a walkable street grid with seed-dependent street spacing, building heights, colors, storefronts, parks, inhabitants, and traffic. Pedestrians wait at crossings; traffic follows intersection priority, brakes for cars ahead, and pauses around blasts. People and vehicles use animated instanced batches. Movement and tools require a keyboard/mouse desktop browser with WebGL. If pointer capture is refused, drag to look and use WASD. The responsive interface can be viewed on mobile, but touch walking is not implemented.

`physics.ts` owns the Rapier WASM world, static collider registration, fragment bodies, ragdoll constraints, downward walking queries, and a fixed 60 Hz simulation with at most three substeps per frame. The body pool also removes associated colliders and joints when recycling. `audio.ts` creates a filtered ambient noise bed, footfalls, and impact transients with Web Audio. `sky.ts` generates the sky and sun with a shader. `surfaces.ts` creates original masonry, paving, wood, and asphalt textures with world-space mapping. `main.ts` owns camera controls, day lighting, postprocessing, UI, and the lifecycle. Runtime has no network dependency except optional Google Fonts, which have local fallbacks. Rapier's WASM is bundled locally.

Performance: fixed debris/particle budgets, instanced static and animated meshes, capped pixel ratio, one shadow-casting light. The renderer exposes read-only `window.cityDiagnostics()` for QA. Target desktop hardware with WebGL; performance varies with GPU and browser.

## Validation

`npm test` exercises seed reproducibility, varied street spacing, finite model transforms, building-footprint collision, full and partial support collapse, debris and rigid-body caps, vehicle and pedestrian damage, joint stability, physical fragment stacking, rubble walking queries, road damage, restoration, and disposal without requiring a GPU. `npm run build` checks the full TypeScript project and generates the browser bundle. Browser QA also covers aerial and walking views, seed changes, visible impacts and collapse, time-of-day controls, sound activation, and the mouse-capture fallback. The test harness uses the installed TypeScript 7 compiler and a minimal canvas stub for procedural textures.

The application code, Three.js engine, and Rapier engine are separate production chunks. Rapier's compatibility build includes its WASM in a roughly 4.3 MB JavaScript chunk (about 1.7 MB gzipped); the initial load trades that size for portable, reliable physics without a CDN or a separate runtime download. The browser's large-chunk build warning is expected for that bundled engine.
