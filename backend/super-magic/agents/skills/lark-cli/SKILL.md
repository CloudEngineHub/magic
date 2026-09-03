---
name: lark-cli
description: "Use when the user wants to interact with Lark/Feishu in any way — including but not limited to: reading, querying, searching, sending, replying to, forwarding, or downloading Lark/Feishu IM messages and chat history; managing group chats; listing, viewing, searching, creating, or editing cloud docs/files, Drive, Markdown, spreadsheets, Base tables, wiki, whiteboards, slides, apps, calendars/events/meeting rooms, contacts/org structure, tasks/todos, approvals, attendance, mail, minutes, VC notes, OKRs, real-time events, or custom Lark CLI skills. Load this skill first to find the right sub-skill."
---

# Lark/Feishu CLI Skill Index

This skill is a directory. Find the sub-skill that matches the user's intent, load it with `read_skills`, then proceed.
All sub-skills are pre-installed at `~/.agents/skills/`.

---

## Prerequisite: Load lark-shared First

Before any Lark operation, load `lark-shared` first — it covers CLI initialization, identity switching (user/bot), scope management, and common error handling.

```
read_skills(skill_names=["lark-shared"])
```

---

## Sub-skill Directory

Load the skill that matches the user's request. Only load what you need for the current task.

| User intent | Load skill |
|-------------|-----------|
| Develop or deploy HTML apps and web pages | `lark-apps` |
| Wrap Lark API operations into a reusable custom Skill (atomic API wrapper or multi-step workflow) | `lark-skill-maker` |
| Send/receive messages, list P2P or group-chat messages, search chat history across chats, manage groups, upload/download chat files, batch get messages, list thread messages | `lark-im` |
| View/create/update events, manage attendees, check availability, book meeting rooms | `lark-calendar` |
| Query org structure, search employees, get user details | `lark-contact` |
| Create/edit Lark docs, search cloud drive documents | `lark-doc` |
| Manage cloud drive files/folders, upload/download, permissions, comments, rename files | `lark-drive` |
| Create/fetch/overwrite Drive-native Markdown files | `lark-markdown` |
| Create and operate spreadsheets, read/write cells, append rows, export | `lark-sheets` |
| Operate Base (multi-dimensional tables): create tables, manage fields, read/write records, views, workflows | `lark-base` |
| Create and manage presentations (slides) | `lark-slides` |
| Query and edit whiteboards, export whiteboard images | `lark-whiteboard` |
| Manage wiki spaces, space members, document node hierarchy | `lark-wiki` |
| Create todos, view/update task status, manage task lists | `lark-task` |
| Approval instance and approval task management | `lark-approval` |
| Query attendance and punch-in records | `lark-attendance` |
| Send/receive mail, manage drafts, folders, labels, contacts, mail rules | `lark-mail` |
| Query Minutes list, get Minutes info and AI artifacts (summary/todos/chapters) | `lark-minutes` |
| Query VC meeting records, get meeting note artifacts | `lark-vc` |
| Manage OKR objectives, key results, alignments, indicators, and progresses | `lark-okr` |
| Subscribe to real-time Lark events (messages, contact changes, calendar changes, etc.) | `lark-event` |
| Above skills insufficient; need to call native Lark OpenAPI directly | `lark-openapi-explorer` |
| Summarize meeting notes over a time range into a structured report | `lark-workflow-meeting-summary` |
| Generate daily/weekly agenda and unfinished task summary (standup/daily report) | `lark-workflow-standup-report` |

---

## Authentication in the Super Magic sandbox

Super Magic runs in an online sandbox. Do not use a blocking browser or
loopback-callback login flow. For user authentication, use the device split
flow so the authorization URL is returned to the user before polling:

```bash
# Start authorization and return immediately.
lark-cli auth login --domain <domain> --no-wait --json

# After the user completes authorization, finish with the returned device code.
lark-cli auth login --device-code <device_code>
```

Use `--scope "<scope>"` instead of `--domain <domain>` when a specific scope
is required. `auth login` must include `--scope`, `--domain`, or `--recommend`.
Do not run plain `lark-cli auth login` in the online sandbox: it can block while
waiting for a callback that the sandbox cannot receive. Check the current
identity and token state with:

```bash
lark-cli auth status --json --verify
```

When starting device authorization, pass the returned `verification_url` to the
user unchanged. Return the authorization link only. **Super Magic sandbox
exception: do not generate a QR-code image.** This avoids producing image files or image
attachments during the sandbox authentication flow. This exception takes
precedence over the generic QR-code requirement in `lark-shared` and over QR
code prompts emitted by the CLI. Therefore, do not call `lark-cli auth qrcode`
in the sandbox and do not use image tags or file attachments to display a
QR code; return `verification_url` unchanged as a text link. Do not expose
credentials or tokens.

When starting authorization, explicitly tell the user to open the authorization
link and return after completing it with "Authorization completed". After the
user confirms, execute `lark-cli auth login --device-code <device_code>` to
complete polling, then verify the user identity with
`lark-cli auth status --json --verify`. Start a new login only when the device
code has expired or authorization has failed.

If `auth login --device-code` exits with code `3` but the output also contains
`device-flow: token response received` and indicates that some scopes were not
granted, do not treat it as a login failure or retry immediately. First run
`auth status --json --verify` and report: "Authorization completed, but some
permissions were not granted."

---

## Load Examples

```
read_skills(skill_names=["lark-shared", "lark-im"])
read_skills(skill_names=["lark-shared", "lark-calendar"])
read_skills(skill_names=["lark-shared", "lark-base"])
```

---

## When Unsure About a Command

For any lark-cli subcommand, if parameters or usage are unclear, run it with `--help` — do not guess.

```bash
lark-cli --help
lark-cli <command> --help
lark-cli <command> <subcommand> --help
```

Examples:

```bash
lark-cli im --help
lark-cli calendar events --help
lark-cli base record --help
```
