# Photographic Persona Portraits

Use this reference when photographic avatars are requested. Generate them with the product Agent's `generate_images` tool from the saved persona, rather than depending on a developer-generated stock collection. Portraits represent fictional adults; retain the visible AI-simulated-persona disclosure. They are not photographs of interview participants and never count as evidence.

## Choose From the Persona, Not a Fixed Look

Read the saved persona's demographics, everyday situation, and explicitly stated preferences. Use known age and gender presentation; do not infer either from a name. A region does not establish ethnicity. When appearance is unspecified, keep it an acknowledged fictional design choice rather than adding it to the persona's facts. This brief covers adults; do not invent an adult age for a persona described as a minor.

All three directions below are valid in one panel. Choose the background, clothing, expression, and camera treatment to suit the person's everyday situation. Do not assign directions mechanically by age, gender, occupation, wealth, or research segment. Avoid turning all business owners into executives in suits or making older people uniformly solemn.

| Direction | Visual brief | Useful when |
|---|---|---|
| A: Everyday social profile | A believable photo taken by a friend on a phone; relaxed angle, ordinary clothing, a quiet home, cafe, or courtyard background; natural daylight and modest depth of field | The profile describes informal daily routines, or no particular photography preference is known |
| B: Bright everyday moment | A relaxed head-and-shoulders photo outdoors in soft morning light; a simple leafy or pale-building background; an unforced smile and fresh, accurate colors | An outdoor or social setting fits the person's stated routine; do not require it for a particular age or gender |
| C: Simple editorial portrait | Pale neutral background, clean diffuse light, relaxed shoulders, an individual expression, everyday cotton or linen clothing; no corporate staging | A quieter, uncluttered composition fits the person or the user wants a simple profile picture |

Keep the collection coherent through natural skin, restrained color, readable faces, and compatible framing. Coherence does not require identical backdrops, head tilts, smiles, clothing, or facial features. Different people must look distinct without caricature. Do not turn opinions, skepticism, willingness to pay, or personality labels into facial expressions.

## Reusable Prompt

Compose the actual prompt in the user's language, as required by `generate_images`. Replace the bracketed brief fields with known facts or a clearly fictional visual choice. Omit irrelevant or unknown details rather than printing empty fields. The English text below is the reusable specification, not a requirement to send an English prompt to a Chinese-language session.

```text
Create one square photographic avatar of one entirely fictional adult AI research persona.

Person: [known adult age or age range and gender presentation, if supplied].
Everyday context: [a short non-identifying situation from the saved persona].
Visual direction: [A, B, or C, expressed as a concrete photographic brief].
Scene and clothing: [ordinary setting and clothing consistent with that context].
Expression and pose: [one natural, comfortable choice; vary it across people].

Show the complete head, hair, and upper shoulders with clear margins for a circular crop.
Keep the face near the center and about half of the square's width. Eyes and facial
features must remain clear at small avatar size. Use soft natural-looking light,
accurate skin tones, realistic age-appropriate texture, and restrained color grading.
Make this a believable personal profile photo with individual human features.

No corporate glamour, mandatory suits, exaggerated business staging, fashion-model
casting, heavy makeup, beauty filters, waxy skin, aggressive sharpening, dramatic
cinematic lighting, exaggerated flaws, text, logos, watermarks, borders, collages,
or multiple people. Do not resemble a named real person or recreate an uploaded
participant's identity. This is a fictional visual representation, not evidence.
```

For A, describe realistic phone-camera perspective and a lightly informal composition rather than a cinematic lens. For B, keep outdoor light soft and the background quiet rather than bright blown-out highlights. For C, preserve a relaxed expression rather than a rigid ID-photo pose. These are directions to adapt, not three mandatory presets or a rule to generate three versions per person.

## Generate, Inspect, and Reuse

1. Reuse a suitable portrait already delivered for the same persona ID. Changing the research question, interview round, display name, or report style alone does not require a new face. A requested appearance change may justify regeneration; do not replace an existing usable image silently.
2. Before an initial batch, state how many portraits will be generated and the expected image cost under the deployment's normal media-generation rules. Generate only when this deliverable is authorized; research-plan approval alone is not approval for unmentioned image costs. Do not exceed the selected panel size or the study's persona limit.
3. Use `generate_images` with one task per person, never a contact sheet. Set `prompt`, `name`, `output_path`, and a square `size` supported by the current session's image-model information. Use a descriptive localized file stem and a localized portrait directory under the study directory; include the stable persona ID in the directory to distinguish namesakes. Read the tool's current schema rather than inventing model options or a response field.
4. Send only the non-identifying visual brief. Do not send raw interviews, private customer details, evidence quotations, or hypothesis verdicts to the image tool. Use text-only generation for fictional identity; an identifiable person's photo is not needed as a face reference. If the user supplies such an image, explain the conflict rather than silently forwarding it or ignoring it.
5. Inspect the actual returned images: one adult per file, appropriate age presentation, no malformed face or glasses, no duplicate-looking faces, a clear circular crop, readable features at roughly 32-48 CSS pixels, and natural texture. Link accepted files using the exact successful output paths reported by the tool. A successful request alone does not establish visual quality; if inspection is unavailable, say the images are unreviewed.
6. Keep successful images when a batch partly fails. Report which personas have no accepted portrait and retain their existing fallback; do not automatically retry a paid batch. Reuse the accepted file in every output that supports it. Regenerate a rejected portrait only within the user's image-generation authorization.

## Current Integration Boundary

`save_personas` currently has no portrait-path field, and the research frontend derives its avatar from the persona's name and demographics. Do not invent an `avatar_url` field, patch persona JSON, or promise that generating a file updates list rows, tool cards, or share views. Deliver the generated images as linked files until the application has an explicit portrait-attachment contract.

The current report template draws its own portraits, and `report-templates.md` prohibits generating personas for its image slots. This reference does not override that contract: keep the template's portraits and disclose the separately delivered photographic assets. Do not insert portraits into decorative image slots or change the template script. Report embedding requires a coordinated template contract change. The report's illustration budget is not an extra portrait-generation allowance.

Never persist a temporary download URL as the identity of a portrait. Keep the workspace file identity through the product's existing file tools; sharing and long-lived rendering must use their authorized file-resolution and expiry handling. Repository LFS rules apply if developers later check selected images into source control, not to ordinary Agent-generated user workspace files.
