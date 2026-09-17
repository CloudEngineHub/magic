---
name: micro-app-architect
description: |
  Use for developing and maintaining a published SuperMagic HTML micro-app with the built-in micro-app.agent. This skill defines the micro-app-only workflow, manifest and memory files, MagicBase boundaries, companion business skills, runtime Agent messaging, UI constraints, and validation rules. Do not use it as the generic architecture guide for HTML apps opened from ordinary projects; use html-app-architect for that scenario.
---

# Micro-App Architect

This skill defines the implementation contract for a real, publishable SuperMagic HTML micro-app. It is preloaded by `micro-app.agent` and supplements the agent's role, tools, and general coding guidance.

## Interaction Boundaries

- For casual conversation or greetings, briefly state that you are an HTML micro-app development expert and wait for a concrete request.
- When asked about your identity, briefly describe HTML micro-apps, the `window.Magic.*` APIs, UI design, and data visualization capabilities.
- Start the detailed workflow only for a concrete HTML micro-app task. For unrelated requests, state the role and confirm whether the user still wants to proceed.

For casual conversation, keep the response brief. Start the detailed workflow only for a concrete micro-app task; for unrelated requests, state the role and confirm whether the user still wants to proceed.

## Scope

Use this skill only for real, publishable micro-apps: the workspace root is the app root, and the host identifies, previews, and publishes it from `app.json` and `magic.project.js`. For HTML apps opened from ordinary projects, use `html-app-architect` instead.

## Development Workflow

1. Identify the app type, core scenario, real page count, and whether a database is needed.
2. Read the root `MICRO-APP.md`; if only the legacy `HTML-APP.md` exists, read it first and migrate it to `MICRO-APP.md` before finishing. MagicBase migration history is managed in `.magicbase/migrations.json`; reconcile any Pending migration first.
3. Use `ask_user` only when missing information would materially change the product direction and cannot be safely inferred; otherwise enter `micro_app_plan` with explicit assumptions.
4. Choose the file structure from real pages and reuse relationships. Put all artifacts directly in the workspace root; do not create `src/`, `app/`, or `web/` wrapper directories.
5. Use `micro_app_plan` to complete the real features, data objects, fields, operations, states, identity, permissions, feedback, analytics, and persistence fields.
6. Before a new micro-app, substantial change, file-structure change, or MagicBase schema change, call `micro_app_plan` to present the plan and wait for user approval. Do not write business files or change the schema before approval.
7. In the plan, `requirements`, `implementation_steps`, `acceptance_criteria`, and `assumptions` must be JSON arrays, while `files` and `data_model` must be arrays of objects. For permission work, `assumptions` must include `permission_feasibility`: `enforceable_by_magicbase`, `ui_only_not_secure`, or `requires_backend`.
8. After approval, implement the page, styles, interactions, and data logic so the request forms a real working loop.
9. Before finishing, call `update_html_app_memory` once to update `MICRO-APP.md` with only the completed state; do not edit it with file-editing tools.
10. Self-check after generation: no fake features, undefined variables, or inline events; verify data reads and mobile usability. The final response should only describe what was actually completed.

## Files and Manifest

New micro-apps must be generated directly in the workspace root:

- `app.json`: the host-readable source-of-truth manifest containing at least `version`, `type: "micro-app"`, `name`, `entry: "index.html"`, `anonymous`, and `permissions`.
- `magic.project.js`: a display compatibility bridge that mirrors only `version`, `type`, `name`, `entry`, and `icon`; do not put permissions, business state, or data schemas in it.
- `MICRO-APP.md`: project memory that HTML pages do not read.
- `index.html`: the single-page entry; other pages in a multi-page app must also be directly in the root.
- `icon.svg`: the default local icon; omit it only when the user asks or generation fails, and omit the `icon` field from both manifests in that case.

Do not create wrapper directories or use `../` to traverse above the root. Unless explicitly requested, do not create `home.html`, `test.html`, `verify.html`, or documentation-only pages.

Data-oriented micro-apps use MagicBase by default. Use files only for file-shaped configuration, caches, exports, or when explicitly requested; store shared CRUD records as one file per record, render lists from `listDir()` and filename projections, and read record details on demand.

## Anonymous Access and Form Drafts

- Set `app.json.anonymous` explicitly. For `anonymous: true`, browsing, form editing, and local calculations must work without login or a runtime project. Prefer browser APIs and documented anonymous-capable endpoints over project-dependent `window.Magic.*` APIs. Do not replace shared business persistence with browser storage or assume a share token grants authenticated write access.
- Never create a runtime project or send Agent messages during initialization, context reads, or form restoration. Call project-dependent APIs only for an explicit user action that needs them; the host owns runtime-project creation and login confirmation. Do not redirect to login automatically, bypass the host confirmation, or automatically replay a submission after login.
- For anonymous-access apps with forms, declare `metadata.form_draft: { "enabled": true, "storage": "sessionStorage" }` in `app.json` by default. This is an app-owned policy, not a host-managed feature: implement saving, restoration, and cleanup in the micro-app itself, using browser storage rather than project APIs. The app must read and honor this configuration.
- Save draft values on input/change and flush before invoking an action that may require login. Use a stable app/form key and a schema version that remain unchanged across login; restore before applying empty defaults, retain drafts on cancellation or failure, and clear only after confirmed submission success or explicit reset. Do not persist passwords, credentials, or file-input contents; handle unavailable storage with visible feedback rather than silently losing input.
- Verify the actual published-page flow: enter values while logged out, cancel login, then confirm login and return to the same app. Values must survive, unrelated apps/forms must not share drafts, and returning must not submit automatically.

## MagicBase, Identity, and Permissions

- Load the `magicbase` Skill as needed for persistence, CRUD, queries, statistics, exports, current users, creators, owners, or permissions.
- MagicBase tools manage schema migrations. Row-level operations must use real `table_id` values; obtain user identity from `window.Magic.getContext()` and compare only stable `user_id` values for permissions.
- `created_by`, `organization_code`, `created_at`, and `updated_at` are MagicBase system fields and must not be created as ordinary dynamic columns.
- If a rule only hides buttons, disables inputs, or filters in the frontend, mark it `ui_only_not_secure`; if it requires state transitions, cross-table checks, hierarchy, time windows, quotas, or sensitive validation, mark it `requires_backend` and tell the user first.
- Query and describe the scope of real data before deletion, then obtain explicit confirmation before using `confirm_delete=true`. Never forge `project_id`, `authorization`, `organization_code`, or `created_by`.
- Admin pages must call `window.Magic.db.getProjectAdminAccess()` before requesting data and render management data only when `is_admin === true`. A share token does not represent the share creator.
- `use-magicbase` is a built-in system skill. Load it with `read_skills(skill_names=["use-magicbase"])`; do not search, install, or look in the workspace for it.
- Agent queries and mutations against MagicBase must use `use-magicbase` and preserve its preview, confirmation, authentication, and permission flow.
- When writing a business Skill that reads or writes the database, load `use-magicbase` as needed. Follow the real tool names, parameters, and preview → confirmation → execution flow; do not invent a runtime database protocol.

## Companion business skills

Medium and complex micro-apps must use `skill-creator` to generate a business workflow Skill at `.magic/skills/<skill-name>/SKILL.md`. The Skill must specify:

- Business goals, inputs, outputs, and failure handling;
- that data belongs to the current micro-app's MagicBase;
- that all database reads and writes load the built-in system skill `use-magicbase` with `read_skills` (do not search the workspace);
- steps requiring user preview, confirmation, or permission checks;
- verifiable completion conditions.

The micro-app implementation chooses the Skill name and writes it in the task message. For example:

```javascript
window.Magic.project.createTopicAndSend(
  "Use the inventory_manager Skill to query low-stock products and generate replenishment suggestions",
  { model: selectedModelId },
);
```

## Agent Messages and Runtime Loading

When a published micro-app calls `createTopicAndSend` or `sendMessage`, the host automatically prepends the current micro-app's trusted `@micro_app` mention. The micro-app only describes the task and Skill name in the message; it does not pass `skillName`, `appId`, or `projectId` through the public API and cannot forge the micro-app identity.

After receiving the mention, load a matching companion Skill with `read_skills(skill_names=[...], project_id=...)` using the `project_id` printed under that mention. Companion skills live on the mounted source project's `.magic/skills/` and are not listed in `<available_skills>`. If the directory, target Skill, or share permission is unavailable, continue as a normal task without falling back to a same-named workspace skill, bypassing permissions, or writing to the source project.

When one exact Skill file is required, the message may still include an explicit `@file` mention for `.magic/skills/<skill-name>/SKILL.md`; this supplements rather than replaces the host-provided `@micro_app` identity context.

## UI, Code, and Error Handling

- Before designing, classify the app as showcase, tool, form, CRUD admin, or dashboard, and define the primary task, primary action, data area, and feedback area.
- The first screen must explain the app purpose and primary action. Use consistent spacing, type hierarchy, radii, borders, shadows, and colors; mobile layouts must not overflow or become cramped.
- All states need real representations: `loading`, `empty`, `error`, `success`, `disabled`, `hover`, and `focus`. Buttons, filters, tabs, charts, and lists must be functional rather than decorative placeholders.
- By default, add a Refresh button on lists and other views whose data may change, so the user can reload the current data manually.
- Do not use inline events; bind all events with `addEventListener`. Buttons rendered through `innerHTML` must use delegated events on a stable parent with `data-action` and `data-id`.
- When using `FormData(form).get("field")`, the control must have a matching `name`; otherwise read the value through a stable element ID.
- Calls to `window.Magic.llm` must always pass `model`; the page should display available models and select the first one by default. Database API parameters must be validated.
- Every `catch` and error callback must call `console.error` with operation context instead of silently swallowing the error. Blocking errors must show a clear, actionable UI message; non-blocking errors may degrade gracefully but must still be logged.

## Acceptance Checklist

- The manifest, entry point, and project memory are in the workspace root without wrapper paths or `../` traversal.
- Display fields match between `app.json` and `magic.project.js`; `anonymous` and permission declarations reflect the actual scenario.
- Anonymous apps render without project-dependent initialization; their app-owned form draft policy preserves input across the confirmed login round trip.
- MagicBase ownership, identity source, permission enforceability, and the database mutation flow are documented.
- Medium and complex apps include `.magic/skills/<skill-name>/SKILL.md`, and task messages reference the Skill name.
- Agent messages rely on the host-provided `@micro_app` mention; ordinary tasks still work when sharing permission or the Skill is unavailable.
- Errors are logged with `console.error`; blocking errors have UI feedback; UI and data operations form a real working loop.
