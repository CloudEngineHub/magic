# Workspaces

Use `list_workspaces(keyword="", page=1, page_size=20)` to find workspaces. This is a read-only call; it does not create a workspace when the list is empty. Use `get_workspace(workspace_id)` for one exact ID.

For a requested change, use `create_workspace(name)`, `update_workspace(workspace_id, name)`, `archive_workspace(workspace_id, archived)`, or `delete_workspace(workspace_id)`. `archived=false` restores an archived workspace. Deletion follows the product's existing workspace deletion behavior; it is different from detaching projects.

IDs are exact decimal strings. An ambiguous name is not an ID. For all writes, inspect `result.content` and do not automatically repeat a request after a network timeout: the server may already have accepted it.
