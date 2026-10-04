# Project files

`list_project_files(project_id, parent_id=None, page_size=50, next_parent_ids=None)` returns one bounded page. `next_parent_ids` is an opaque server traversal state; pass it back unchanged to continue. Use `get_project_file(file_id)` for basic metadata. Neither call returns a usable browser link.

For requested organization use `create_project_directory(project_id, parent_id, name)`, `rename_project_file(file_id, name)`, `copy_project_files(project_id, file_ids, target_project_id, target_parent_id)`, `move_project_files(...)`, or `delete_project_files(project_id, file_ids)`. If a batch returns `batch_key`, call `get_file_batch_status(batch_key)` until it reports a terminal state. Partial completion must be described item by item; never assume the batch rolled back.

To read selected file contents use `prepare_project_files(project_id, file_ids, purpose)` on at most ten file IDs obtained from a narrow metadata search. Successful entries provide absolute local paths. Pass those paths to the existing `read_files` or document tools. A failed entry does not invalidate paths for successful entries. Prepared files are eligible for cleanup after 24 hours on the next preparation and are local runtime files, not project artifacts.

Do not scan or download every file in a project. Do not expose signed URLs, object keys, or local runtime paths as browser-accessible links; use the separate `share` Skill if the user wants a browser link.
