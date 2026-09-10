# Digital Employee Logo Generation Guidelines

This document provides guidance for automatically generating a default logo from `IDENTITY.md` and `SOUL.md` when creating a digital employee. The logo is the digital employee's persistent `icon`, not a temporary placeholder displayed only in the user interface.

## Basic Requirements

| Item | Requirement |
|------|-------------|
| Format | PNG; JPG may be used when necessary |
| Generation size | `1024x1024` |
| Display size | Square; typically scaled to `512x512` in the marketplace |
| Style | Consistent cartoon or illustration style that is professional, natural, and easy to recognize |
| Content | Must align with the employee's role and must not contain prohibited, sensitive, or difficult-to-identify content |
| Text | Do not generate text in the image by default, to avoid garbled text at small display sizes |

## Prompt Input Sources

The logo prompt must be generated from the current employee files and must not rely solely on a generic avatar template:

1. Read the YAML frontmatter in `IDENTITY.md` and extract `name`, `role`, and `description`.
2. Read the body of `IDENTITY.md` and extract the character identity, professional capabilities, target users, and typical work scenarios.
3. Read `SOUL.md`, if present, and extract the core personality, aesthetic preferences, communication style, and behavioral temperament.
4. Convert professional capabilities into a small number of visual symbols, and translate personality and aesthetics into expression, composition, color palette, and lighting.
5. Do not infer sensitive personal attributes from the name. The name may only be used to establish the visual theme and recognizability.

## Prompt Structure

Assemble the prompt in the following order. The specific content must come from the employee files:

```text
[consistent style prefix] + [character identity] + [professional visual elements] + [personality and temperament] + [background and color palette] + [quality suffix]
```

Recommended fixed prefix:

```text
Professional cartoon-style illustration avatar, clean professional composition, warm lighting and soft shadows,
```

Recommended fixed suffix:

```text
Square 1:1 composition, bust shot or symbolic emblem, centered subject, clean simple background, no text, no watermark, high quality, professional, natural.
```

If `SOUL.md` is missing, generate the prompt using only the contents of `IDENTITY.md`. If the identity information is also incomplete, use the available fields without inventing a specific personal background.

## Generation and Storage

Treat the current working directory as the employee workspace root. All paths below are workspace-relative; do not prepend `.workspace/` even if the repository stores the workspace in a directory with that name.

1. Use the `generate_images` tool to generate one image. The `size` must be `1024x1024`.
2. Save the image as `.magic/avatars/agent-logo.png` in the current employee workspace. If the tool cannot write directly to this path, move or rename the generated image afterward.
3. Confirm that the image exists, is readable, and is square, and verify that its file size does not exceed `500KB`. If it cannot be compressed to fit the limit, prefer converting it to a JPG of suitable quality while preserving the square aspect ratio.
4. If generation fails, do not falsely report success. Continue the employee creation process, record the reason for failure, and proceed with synchronizing the name, role, and description.
5. If a user-provided logo already exists, or the Agent already has an image icon, do not overwrite the existing image.

## Agent Synchronization Payload

The generated file must first obtain an object-storage key recognized by magic-service through the current Agent workspace's file synchronization/upload mechanism. Then use the Agent update tool to submit the employee metadata and logo in a single request:

```json
{
  "code": "<agent_code>",
  "name_i18n": {"default": "<name>"},
  "role_i18n": {"default": "<role>"},
  "description_i18n": {"default": "<description>"},
  "icon": {"type": "Image", "value": "<logo_file_key>"},
  "icon_type": 2
}
```

Language fields should retain the actual language used in `IDENTITY.md`; do not generate additional translation fields solely for synchronization. `icon.value` must be the object-storage key that magic-service can read after upload. It must not be a local path or raw image data. If logo synchronization fails, the text fields may be submitted on their own, and the failure must not block employee creation.

## Acceptance Criteria

- `.magic/avatars/agent-logo.png`, or an equivalent JPG, has been generated and is square.
- The Agent update tool receives the current employee's `code`, `name_i18n`, `role_i18n`, and `description_i18n`.
- When the logo is uploaded successfully, the update payload includes `icon` and `icon_type: 2`.
- If logo generation or upload fails, the text metadata is still synchronized and the reason for failure is reported to the user.
- An existing user-provided logo is not overwritten by the automatically generated logo.