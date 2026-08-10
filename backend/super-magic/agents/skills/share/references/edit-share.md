# Edit Existing Shares

Read the common safety and result-handling rules in [SKILL.md](../SKILL.md) first. Use this reference whenever the user wants to inspect or change an existing share.

## Contents

- [Workflow](#workflow)
- [Read One Share](#read-one-share)
- [Update Tools](#update-tools)
- [Update Rules](#update-rules)
- [Common Updates](#common-updates)

## Workflow

1. Identify one share without guessing:
   - If the user provides a resource ID or share URL, call `get_share` with it.
   - If the user identifies files, a project, a topic, or a name instead, use the corresponding `list_*_shares` tool first. Ask the user to choose when multiple shares match, then call `get_share` with the selected `resource_id`.
2. Check `result.ok` and `result.data["target"]` before writing. `get_share` returns only active shares.
3. Call the matching update tool: `update_file_share`, `update_project_share`, or `update_topic_share`.
4. Pass `share_ref` and only the fields the user explicitly wants to change. Every omitted field keeps its current value.
5. Return the resulting URL and password when one exists. If the password changed, clearly return the new password.

`get_share` and the update tools operate on active shares. An expired, manually disabled, or deleted share cannot be silently restored through a normal update. Explain that the existing link is inactive and do not create a replacement or restore access unless the user explicitly requests an available follow-up action.

## Read One Share

```python
get_share(
    share_ref: str,
)
```

`share_ref` accepts an active share resource ID or a complete `/share/files/{id}` or `/share/topic/{id}` URL. For a topic share, the topic ID is the share resource ID, so pass the topic ID directly. Reading a share does not modify it.

```python
from sdk.tool import tool

current = tool.call("get_share", {
    "share_ref": "https://example.com/share/files/123456",
})
print(current.content)
```

Do not continue to an update unless `current.ok` is true and its target matches the update tool.

## Update Tools

All update parameters are flat. `share_ref` is the only required parameter, but every call must include at least one change field.

### File Share

```python
update_file_share(
    share_ref: str,
    share_name: str | None = None,
    file_paths: list[str] | None = None,
    entry_file_path: str | None = None,
    access_type: "password" | "team" | "public" | None = None,
    password: str | None = None,
    regenerate_password: bool = False,
    team_scope: "all" | "designated" | None = None,
    team_user_ids: list[str] | None = None,
    team_department_ids: list[str] | None = None,
    expire_days: int | None = None,
    make_permanent: bool = False,
    show_original_info: bool | None = None,
    allow_download: bool | None = None,
    allow_copy: bool | None = None,
    show_file_list: bool | None = None,
    hide_super_magic_watermark: bool | None = None,
    immersive: bool | None = None,
)
```

- `file_paths` replaces the complete shared file set; it is not an add-only list. When passing it, also pass `entry_file_path`, and include the entry file in the replacement set.
- `file_paths` is the complete final file set. When adding files to an existing share, include the files that were already shared and the newly approved files, and keep `entry_file_path` in that complete list.
- To change only the entry file, omit `file_paths` and pass an `entry_file_path` that already belongs to the shared file set.
- `allow_copy=False` prevents viewers from copying the shared files into their workspace.

### Project Share

```python
update_project_share(
    share_ref: str,
    share_name: str | None = None,
    entry_file_path: str | None = None,
    access_type: "password" | "team" | "public" | None = None,
    password: str | None = None,
    regenerate_password: bool = False,
    team_scope: "all" | "designated" | None = None,
    team_user_ids: list[str] | None = None,
    team_department_ids: list[str] | None = None,
    expire_days: int | None = None,
    make_permanent: bool = False,
    show_original_info: bool | None = None,
    allow_download: bool | None = None,
    allow_copy: bool | None = None,
    hide_super_magic_watermark: bool | None = None,
    immersive: bool | None = None,
)
```

`entry_file_path` changes the file opened first. Omit it to preserve the current project entry file. `allow_copy=False` prevents viewers from copying the shared project into their workspace.

### Topic Share

```python
update_topic_share(
    share_ref: str,
    share_name: str | None = None,
    access_type: "password" | "team" | "public" | None = None,
    password: str | None = None,
    regenerate_password: bool = False,
    team_scope: "all" | "designated" | None = None,
    team_user_ids: list[str] | None = None,
    team_department_ids: list[str] | None = None,
    expire_days: int | None = None,
    make_permanent: bool = False,
    show_original_info: bool | None = None,
    allow_download: bool | None = None,
    show_file_list: bool | None = None,
)
```

Topic shares do not support file paths, an entry file, copy control, watermark hiding, or immersive mode.

## Update Rules

- Use `share_name` to rename the share without changing its source files, project, or topic.
- Use `expire_days` with an integer from 1 to 365. Use `make_permanent=True` to remove an existing expiry. Do not pass both.
- For an existing password share, omitting both `password` and `regenerate_password` preserves the current password.
- Use `password` to set a specific password. Use `regenerate_password=True` to generate a new secure password. Do not pass both.
- Switching a team or public share to `access_type="password"` generates a secure password when neither password option is supplied. File and project password access requires VIP; topic password access does not.
- Use `access_type="team"` and `team_scope="all"` for all team members.
- For selected team recipients, use `access_type="team"`, `team_scope="designated"`, and at least one known user or department ID. Never invent recipient IDs.
- Use `access_type="public"` only when the user explicitly chooses public access after understanding that anyone with the link can open it.
- `show_original_info=False` hides original author information and does not require VIP.
- `hide_super_magic_watermark=True` requires VIP and hides only the bottom-right “Created by Super Magic” watermark.
- `immersive=True` opens the entry file in a full-screen immersive presentation and hides both the share-page header and the file-preview header.

## Common Updates

Each example assumes `get_share` already returned one active share of the matching target type.

### Change only page behavior

```python
result = tool.call("update_file_share", {
    "share_ref": "123456",
    "immersive": True,
    "allow_download": False,
})
print(result.content)
```

### Generate a new password

```python
result = tool.call("update_file_share", {
    "share_ref": "123456",
    "regenerate_password": True,
})
print(result.content)
```

### Make a share permanent

```python
result = tool.call("update_project_share", {
    "share_ref": "123456",
    "make_permanent": True,
})
print(result.content)
```

### Change the entry file

```python
result = tool.call("update_project_share", {
    "share_ref": "123456",
    "entry_file_path": "dashboard/index.html",
})
print(result.content)
```

### Replace the complete file set

```python
result = tool.call("update_file_share", {
    "share_ref": "123456",
    "file_paths": [
        "site/index.html",
        "site/styles.css",
        "site/app.js",
        "site/README.md",
    ],
    "entry_file_path": "site/index.html",
})
print(result.content)
```

### Rename a share

```python
result = tool.call("update_topic_share", {
    "share_ref": "123456",
    "share_name": "Product review notes",
})
print(result.content)
```

### Switch access to selected team members

```python
result = tool.call("update_project_share", {
    "share_ref": "123456",
    "access_type": "team",
    "team_scope": "designated",
    "team_user_ids": ["<team-user-id>"],
    "team_department_ids": ["<team-department-id>"],
})
print(result.content)
```

### Switch to public access after explicit approval

```python
result = tool.call("update_file_share", {
    "share_ref": "123456",
    "access_type": "public",
})
print(result.content)
```

Never use the public-access example unless the user clearly authorized intentional public distribution.
