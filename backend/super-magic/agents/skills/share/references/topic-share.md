# Topic Share

Read the common access, safety, deletion, and result-handling rules in [SKILL.md](../SKILL.md) first. Use this reference only when the user wants to share the current topic or conversation.

## Workflow

1. Call `list_topic_shares` with its defaults to find the current topic's active share.
2. Reuse the existing share when the user requested no changes.
3. If no share exists, ask for the access method when unspecified, following the common safety rules.
4. To inspect or change an existing topic share, read [edit-share.md](edit-share.md). Do not use `create_topic_share` for editing.

## Tools

```python
list_topic_shares(
    current_topic_only: bool = True,
    status: "active" | "expired" | "deleted" | "all" = "active",
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 20,
)
```

The default call performs an exact lookup for the current topic and returns the password when one exists. Set `current_topic_only=False` only to browse other topic shares or deleted history; browsing results do not expose passwords.

```python
create_topic_share(
    access_type: "password" | "team" | "public" = "password",
    password: str | None = None,
    team_scope: "all" | "designated" = "all",
    team_user_ids: list[str] = [],
    team_department_ids: list[str] = [],
    expire_days: int | None = None,
    show_original_info: bool = True,
    allow_download: bool = True,
    show_file_list: bool = True,
)
```

`create_topic_share` uses the current topic ID as the share resource ID; do not pass a separate resource ID. To inspect, update, or delete that topic share later, pass the topic ID directly as `share_ref`. Topic shares do not support file paths, an entry file, copy control, watermark hiding, or immersive mode.

Password-protected topic shares do not require VIP. Other common access and page-setting rules still apply.

## Common Calls

### Find the current topic's existing share

```python
from sdk.tool import tool

result = tool.call("list_topic_shares", {})
print(result.content)
```

### Create a password share

```python
result = tool.call("create_topic_share", {})
print(result.content)
```
