# Project Share

Read the common access, safety, deletion, and result-handling rules in [SKILL.md](../SKILL.md) first. Use this reference only when the user explicitly wants to share the entire current project.

## Workflow

1. Call `list_project_shares` with its defaults to find active shares for the current project.
2. Reuse one existing share when the user requested no changes. Ask the user to choose when multiple candidates exist.
3. If no share exists, identify the required `entry_file_path`. Ask which project file should open first when the user did not make it clear.
4. Ask for the access method when unspecified, following the common safety rules.
5. To inspect or change an existing project share, read [edit-share.md](edit-share.md). Do not use `create_project_share` for editing.

## Tools

```python
list_project_shares(
    current_project_only: bool = True,
    status: "active" | "expired" | "deleted" | "all" = "active",
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 20,
)
```

The default call performs an exact active-share lookup for the current project and returns the password when one exists. Set `current_project_only=False` only when the user wants to browse project shares beyond the current project; browsing results do not expose passwords.

```python
create_project_share(
    entry_file_path: str,
    access_type: "password" | "team" | "public" = "password",
    password: str | None = None,
    team_scope: "all" | "designated" = "all",
    team_user_ids: list[str] = [],
    team_department_ids: list[str] = [],
    expire_days: int | None = None,
    show_original_info: bool = True,
    allow_download: bool = True,
    allow_copy: bool = True,
    hide_super_magic_watermark: bool = False,
    immersive: bool = False,
)
```

`entry_file_path` is required and must identify a MagicFS-synchronized file in the current project. Project shares always expose the project file list, so this tool has no `show_file_list` parameter.

Project-only settings:

- `allow_copy=False` prevents viewers from copying the shared project into their workspace.
- `allow_download=False` prevents project file download or export.
- `hide_super_magic_watermark=True` and `immersive=True` follow the same rules as file shares.

## Common Calls

### Find the current project's existing share

```python
from sdk.tool import tool

result = tool.call("list_project_shares", {})
print(result.content)
```

### Create a team share

```python
result = tool.call("create_project_share", {
    "entry_file_path": "dashboard/index.html",
    "access_type": "team",
})
print(result.content)
```
