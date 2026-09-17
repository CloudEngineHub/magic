# Digital Employee Logo Generation Guidelines

This document provides guidance for automatically generating a default logo (avatar) from `IDENTITY.md` and `SOUL.md` when creating or updating a digital employee. The logo is the digital employee's persistent `icon`, representing the visual persona and character portrait of the employee, not a temporary placeholder or a generic tool icon.

## Basic Requirements

| Item | Requirement |
|------|-------------|
| Subject | **Must be a person/character portrait**. Digital employees are personified virtual employees. The avatar must depict a recognizable human character bust (face, hair, professional attire, expression), never just tools, objects, logos, emblems, or mannequins |
| Format | PNG; JPG may be used when necessary |
| Generation size | `1024x1024` |
| Display size | Square; typically scaled to `512x512` in the marketplace |
| Style | Consistent cartoon or illustration style that is professional, natural, modern, and approachable |
| Content | Must align with the employee's role and character identity; professional tools (e.g. tablet, stylus, notebook, measuring tape) may only appear as handheld props or attire accessories, while the character portrait remains the primary subject |
| Text | Do not generate text in the image by default, to avoid garbled text at small display sizes |

## Negative Constraints (Strict Prohibitions)

- **No object-only images**: Do NOT generate images containing only tools, stationery, scissors, measuring tapes, rulers, sewing needles, computers, or devices.
- **No pure logos or emblems**: Do NOT generate graphic logos, app icons, badges, crests, or symbolic emblems.
- **No mannequins or dress forms**: Do NOT generate lifeless dress forms, headless mannequins, or clothing displays.
- **Always feature a character**: The avatar must always depict a living, personified character (bust portrait with head, face, upper body, and professional attire).

## Prompt Input Sources

The logo prompt must be generated from the current employee files and must construct a specific personified character rather than relying on abstract symbols or tools:

1. Read the YAML frontmatter in `IDENTITY.md` and extract `name`, `role`, and `description`.
2. Read the body of `IDENTITY.md` and extract the character identity, professional capabilities, target users, and typical work scenarios.
3. Read `SOUL.md`, if present, and extract the core personality, aesthetic preferences, communication style, and behavioral temperament.
4. Translate the role into a personified professional figure (e.g., fashion designer, financial analyst, customer service specialist) with suitable professional attire, hairstyle, and facial expression.
5. Convert professional capabilities into complementary visual details (e.g., wearing a stylish designer blazer, holding a sketch tablet, wearing glasses, holding a pen), while keeping the character's face and upper body as the central subject.
6. Do not infer sensitive personal attributes from the name. The name may only be used to establish the visual theme and recognizability.

## Prompt Structure

Assemble the prompt in the following order. The specific content must come from the employee files:

```text
[consistent style prefix] + [character subject: professional person/character portrait] + [attire & professional accessories/props] + [expression, personality and temperament] + [background and color palette] + [quality suffix]
```

Recommended fixed prefix:

```text
Professional cartoon-style illustration avatar of a person, clean professional composition, warm lighting and soft shadows,
```

Recommended fixed suffix:

```text
Square 1:1 composition, upper body bust portrait of the character, centered subject, clean simple background, no text, no watermark, high quality, professional, natural.
```

If `SOUL.md` is missing, generate the prompt using only the contents of `IDENTITY.md`. If the identity information is also incomplete, use the available fields to depict a generic professional character for that role without inventing a specific personal background.

## Generation and Storage

Treat the current working directory as the employee workspace root. All paths below are workspace-relative; do not prepend `.workspace/` even if the repository stores the workspace in a directory with that name.

1. Use the `generate_images` tool to generate one image. The `size` must be `1024x1024`.
2. Save the image as `.magic/avatars/logo.png` in the current employee workspace. If the tool cannot write directly to this path, move or rename the generated image afterward.
3. Confirm that the image exists, is readable, and is square, and verify that its file size does not exceed `500KB`. If it cannot be compressed to fit the limit, prefer converting it to a JPG of suitable quality while preserving the square aspect ratio.
4. If generation fails, do not falsely report success. Record the reason for failure and proceed with saving the employee definition files.
5. If a user-provided logo already exists, or the Agent already has an image icon, do not overwrite the existing image without user confirmation.

## Acceptance Criteria

- `.magic/avatars/logo.png`, or an equivalent JPG, has been generated and is square.
- The avatar clearly features a professional person/character bust portrait, not an object, tool, logo, or mannequin.
- The avatar file is persisted in `.magic/avatars/` as part of the employee definition files.
- An existing user-provided logo is not overwritten by the automatically generated logo without confirmation.
