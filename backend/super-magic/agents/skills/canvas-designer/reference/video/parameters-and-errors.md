# Parameters and Error Handling

## Parameter Guidance
- Step 1: inspect the runtime video-model capability config already injected into the conversation
- Step 2: fill priority inputs first
  - the generation goal itself
  - canvas placement: `project_path`, `name`
  - user-requested `resolution` / `aspect_ratio` intent
  - user-requested duration intent
  - reference inputs such as reference images or start/end frames
- Step 3: `duration_seconds`, `resolution`, and `aspect_ratio` are optional; when the user did not specify them, infer legal values from the current video model rules only when the choice is clear for the user's request
- Step 4: when uncertain about an optional parameter, prefer omitting it rather than guessing
- Canvas layout dimensions are derived internally; do not invent generation parameters only for layout
- Let the default handling take care of the rest when the user did not explicitly ask for more controls

## Error Handling
- `queued` / `running` / `processing` are not failures
- When it truly fails, explain the error directly
- Do not auto-downgrade to image generation
- Do not silently create a new video job "to try again" unless the user explicitly asks for regeneration

## Reading Results
- `pending_videos`: source of truth for videos still being processed
- `created_elements`: elements created in this run
- `elements`: updated element details
