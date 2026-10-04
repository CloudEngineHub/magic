# Projects

Call `list_projects(keyword="", scope="owned", page=1, page_size=20)` for projects owned by the user. Use `scope="participated"` to include projects in which they collaborate. Access to a project does not grant access to another person's private topic messages.

Use `get_project(project_id)` and `list_topics(project_id, page=1, page_size=20)` to narrow the search. A project name search is not a full-text search of its topics or files.

`create_project(workspace_id, name)` returns both the new project and its automatically created default topic. Reuse that default topic when suitable. The other operations are `update_project(project_id, name)`, `move_project(project_id, target_workspace_id)`, and `delete_project(project_id)`. These use exact IDs and current-user permissions. Do not claim that moving or creating a project duplicates its history; a complete project-copy tool is not provided.
