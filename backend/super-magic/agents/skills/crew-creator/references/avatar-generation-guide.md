# Digital Employee Logo Generation Guidelines

This document provides guidance for automatically generating a default logo from `IDENTITY.md` and `SOUL.md` when creating or updating a digital employee. The logo is the digital employee's persistent `icon`, not a temporary placeholder displayed only in the user interface.

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
4. If generation fails, do not falsely report success. Record the reason for failure and proceed with saving the employee definition files.
5. If a user-provided logo already exists, or the Agent already has an image icon, do not overwrite the existing image without user confirmation.

## Acceptance Criteria

- `.magic/avatars/agent-logo.png`, or an equivalent JPG, has been generated and is square.
- The avatar file is persisted in `.magic/avatars/` as part of the employee definition files.
- An existing user-provided logo is not overwritten by the automatically generated logo without confirmation.
