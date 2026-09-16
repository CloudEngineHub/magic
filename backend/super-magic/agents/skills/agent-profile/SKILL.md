---
name: agent-profile
description: Manage, update, generate, and synchronize digital employee (agent) profiles and logos. Use when users want to update basic agent profile metadata (name, role, description), design/generate/change agent avatar logos, sync profile to the backend server, or check current profile status. Also use when user says "update agent profile", "sync employee profile", "generate agent logo", "change avatar", or "view agent profile".
---

# Agent Profile Manager

Manages the profile metadata and visual identity (Logo) of digital employees, providing specialized capabilities to generate logos from `IDENTITY.md` and `SOUL.md`, synchronize profiles to the backend service, and verify synchronization through server read-back.

---

## Language Awareness

- Prioritize the user's explicit request language or the language returned by `get_user_language()`.
- Conduct all interactions and feedback in that language.

---

## Core Capabilities and Workflow

### 1. View Current Employee Profile

When the user wants to check the employee profile currently stored on the backend:
1. Call `get_agent_info()` to retrieve the profile.
2. Present the agent information (name, role, description, public icon URL, and icon type).

---

### 2. Generate / Update Employee Logo (Avatar)

When generating a new logo or replacing an existing avatar:

1. **Extract Identity and Personality**:
   - Read `.magic/IDENTITY.md` to extract name, role, description, and capability characteristics.
   - Read `.magic/SOUL.md` (if present) to extract personality traits, aesthetic preferences, and communication style.
   - If `.magic/IDENTITY.md` is missing, notify the user that employee identity must be initialized first.
2. **Assemble Generation Prompt**:
   - Refer to `references/avatar-generation-guide.md`.
   - Assemble a prompt combining style prefix, character identity, professional visual elements, personality temperament, background color scheme, and quality suffix.
3. **Generate Image and Validate Locally**:
   - Call `generate_images` with `size="1024x1024"` to generate 1 square image.
   - Save to `.magic/avatars/agent-logo.png` (path relative to workspace root; never prepend `.workspace/`).
   - Validate that the image is square and its size does not exceed `500KB` (convert to high-quality JPG if necessary).
   - Preserve existing custom logos if user already provided one and did not request replacement.

---

### 3. Synchronize Agent Profile

Once definition files and optional logo are ready, sync the profile to magic-service:

1. Parse from `.magic/IDENTITY.md`:
   - `name_i18n`: employee name
   - `role_i18n`: employee role
   - `description_i18n`: employee description
2. If a valid local logo exists (e.g. `.magic/avatars/agent-logo.png`), pass the path to `icon_file_key`.
3. Call `update_agent` to submit updates. `update_agent` automatically uploads the local file to object storage and sets `icon` (`icon_type: 2`).
4. **Mandatory Read-Back Verification**:
   - After a successful `update_agent` response, **immediately call `get_agent_info()`** to read back the profile from the server.
   - Profile sync is only considered successful when `name_i18n`, `role_i18n`, and `description_i18n` match the submitted values, and `icon` resolves to a public URL starting with `http://` or `https://` with `icon_type: 2`.
   - If `icon.value` remains a local relative path, the image upload has not completed.
5. **Fallback Strategy**:
   - If logo generation or upload fails, retry with text metadata only (`name_i18n`, `role_i18n`, `description_i18n`) and record the logo failure reason. Do not block the overall sync process. Call `get_agent_info()` to verify text sync afterward.

---

## Agent Profile Verification Checklist

After synchronization completes, present the verification checklist to the user:

```markdown
## Agent Profile Verification Checklist

| Check Item | Status | Details |
|------------|--------|---------|
| Text Profile Updated | pass / failed | update_agent synchronized name_i18n, role_i18n, description_i18n |
| Logo Generated & Uploaded | pass / skipped / failed | Local logo uploaded to object storage and bound to icon_file_key |
| Server Profile Verified | pass / failed | get_agent_info() confirmed profile match and public logo URL (icon_type: 2) |
```

---

## Reference Files

- `references/avatar-generation-guide.md` — Size, compression limits, prompt structure, and quality guidelines.
