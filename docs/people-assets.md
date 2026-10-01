# Original people assets

All human geometry shipped by the city is freshly authored procedural geometry. No stock bodies, downloaded people, commercial scans or external texture packs are used. This pass adds three original bitmap assets generated with the built-in ImageGen tool. These are fictional people and synthetic texture references, not photographs of actual identified residents. The browser loads bundled local PNGs; it does not call an image service.

| Asset | Purpose |
|---|---|
| `public/textures/skin-detail.png` | Shared mean-normalized epidermal color detail; procedural pore relief and roughness are separate. |
| `public/textures/face-atlas.png` | Four fictional adult face plates, warped to seeded sculpt landmarks; shader color normalization preserves resident skin tones. |
| `docs/people-reference.png` | Original head reference for the rejected offline reconstruction experiment; not loaded by the city. |

Mode: built-in ImageGen, fresh generation, opaque background. No image edits, external reference images or downloaded source photographs. The following prompts are recorded verbatim.

## Skin detail

```text
Use case: photorealistic-natural. Asset type: original seamless skin micro-detail texture tile for a real-time 3D human material, NOT a portrait. Generate a square 1024x1024 flat cross-polarized macro albedo photograph-style texture of healthy adult cheek skin covering a 6cm by 6cm patch. Even uniform neutral ivory-beige color with very subtle warm pink capillary mottling, fine natural pores, delicate barely visible epidermal creases and a few tiny faint freckles. Lighting perfectly diffuse and shadow-free, no highlights, no gradients, no perspective, no face features, no eyes, no nose, no lips, no hair, no borders, no labels. The texture fills the entire square edge to edge and its opposite edges should tile seamlessly. Keep variations restrained for use as a shared multiplicative detail map on many different seeded skin colors. Create an original asset, not a scan or imitation of a named person.
```

## Reconstruction reference

```text
Create an original photorealistic asset reference for a 3D city pedestrian: a perfectly straight-on front view of the entire head and upper neck of a fictional adult man age 38. Real photographic appearance, healthy medium olive skin, asymmetric subtle pores and fine lines, dark brown eyes, natural closed relaxed lips, subtle one-day stubble. Shaved scalp with only very short stubble, no beard, no glasses, no jewelry. Head exactly upright, both ears fully visible and symmetrical in projection, eyes looking directly forward, neutral expression, full chin and crown in frame. Camera long lens at eye level, close to orthographic, no perspective distortion. Flat cross-polarized diffuse neutral studio illumination, no directional shadows, no glossy highlights, realistic epidermal color and details. Plain pure white background. Crop at base of neck, no shoulders or clothing visible. Head occupies 80 percent of image height and 65 percent of width, centered. A real living person, not a wax sculpture, not a 3D render, not an illustration. High detail photographic texture. This fictional identity is created fresh for the project, not a named or existing person.
```

## Face plates

```text
Original texture references for 3D people in a seeded browser city. Create a high resolution square contact sheet divided into an exact 2 by 2 grid of four equally sized photographic front-facing head portraits. No gaps, frames or labels. Each panel has plain pure white background. Four entirely fictional adults, realistic photographic appearance, not 3D renders, not sculptures, not illustrations. Top left: woman 30, light warm skin, hazel eyes, pulled back brown hair. Top right: woman 45, deep brown skin, brown eyes, pulled back black hair. Bottom left: man 32, East Asian facial features, fair neutral skin, brown eyes, extremely short black buzz cut, clean shaven. Bottom right: man 62, light neutral skin, grey buzz cut, blue eyes, weathered skin and subtle grey stubble. No glasses, jewelry or hats. Every head exactly upright, both ears fully visible, neutral closed relaxed lips, eyes straight forward. All heads at exactly same scale and framing: crown at 7 percent of panel height, eyes at 43 percent, lips at 69 percent, chin at 86 percent, base of neck at bottom edge. Face center exactly at panel horizontal center. Long lens eye level, near orthographic. Flat cross-polarized diffuse neutral studio illumination, minimize all cast shadows and highlights. Natural pores, wrinkles, capillaries, skin asymmetry and lip color. Keep illumination uniform and skin photographic, real living people. The four identities are freshly created original fictional people, not imitations of any existing or named person.
```
