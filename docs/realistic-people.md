# Realistic people: original assets, scalable rendering

The current pass replaces nearby primitive figures with original skinned surfaces and adds a resident studio for close inspection. It establishes the rendering and variation pipeline, but its faces and clothing are still stylized. Increasing polygon count alone will not deliver convincing realism.

## Production strategy

1. **Author a strong anatomical base.** Build original male and female neutral meshes with continuous shoulder, groin, neck and facial topology, separate mouth and eyelid loops, accurate hands, and measured adult proportions. Blender would be the appropriate authoring tool for this next stage. Keep the neutral base, sculpted detail and retopologized mesh in the repository; do not substitute downloaded people. Review untextured front, side, back and three-quarter renders before variation or animation.
2. **Vary anatomy with constrained morph targets.** Use authored targets for build, age, facial proportions and individual asymmetry. Separate these identity targets from expression and pose correctives. Constrain combinations so seeded variation does not produce distorted anatomy. Preserve a small deterministic parameter vector per resident instead of a separate mesh for every inhabitant.
3. **Build the material detail that faces need.** Bake original sculpted normal maps; paint original skin albedo, roughness and regional color variation. Add fine eyelid edges, tear-line geometry, brows, eyelashes, teeth and a mouth cavity. Use layered hair cards and varied hairstyles. Accurate eye depth and gaze matter more than visibly large eyeballs. Seed tint and texture variation without making every face uniformly smooth.
4. **Author and fit garments.** Create original garments with thickness, seams and a recognizable cut. Fit them to body morphs, with corrective shapes at elbows and shoulders. Bake fold detail and use pose-dependent large folds. Garments need clearance from the body across the full animation range, not just in the rest pose.
5. **Improve animation as a separate discipline.** Author walk, idle, stop, turn and flight poses on the same skeleton. Layer breathing, gaze, blink timing and environmental reactions. Add foot contacts, acceleration-based stride, head tracking and shoulder/elbow corrective shapes. Validate transitions and hand positions around carried objects in the studio.
6. **Keep realism local.** Use full skinning and facial detail only close to the camera, reduced meshes in the middle distance, and instanced animated proxies farther away. Cache morph combinations, build assets in small batches, pool skeleton resources, and enforce explicit GPU budgets. Resident identity, schedule and needs remain independent of visual LOD.

## What is implemented now

`human-surface.ts` builds seeded original parametric surfaces, material textures, 15-bone skinning, shaped hands and facial features, hair and a blink morph. It mirrors the existing articulated actor pose. `ActorRenderer` keeps a bounded near-model cache with distance hysteresis and builds at most one new surface per frame. The portrait studio exposes faces and gait without chasing a moving NPC.

The strongest remaining visual limitations are the parametric facial topology, simplified skin shading, hair volume, and garment intersections around difficult poses. The strategy above addresses each directly; this pass should not be presented as photorealistic completion.

## Technical references

- [Three.js SkinnedMesh](https://threejs.org/docs/pages/SkinnedMesh.html): bone weights, skeleton binding and deformation.
- [Khronos glTF facial morph targets](https://github.khronos.org/Vulkan-Site/tutorial/latest/Advanced_glTF/Morph_Targets_Facial_Animation/01_introduction.html): keeping facial shape variation and animation in an interoperable asset pipeline.
- [RVO2 documentation](https://gamma-web.iacs.umd.edu/RVO2/documentation/2.0/): local collision avoidance as a separate layer from identity and route planning. The current city uses a simpler predictive solver and positional constraints, not the RVO2 implementation.

No imported models, generated third-party bodies, or external texture packs are included in this pass. All shipped models and textures remain original procedural work.
