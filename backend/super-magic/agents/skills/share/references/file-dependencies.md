# File Dependencies Before Sharing

Use this reference when the user wants to share an HTML page, preview a rendered artifact, or the entry file may load local assets.

## Inspect the entry

Call the read-only Code Mode tool with the one required flat argument:

```python
inspection = tool.call("inspect_file_share", {
    "entry_file_path": "site/index.html",
})
print(inspection.content)
```

Read `inspection.content` first. Use `inspection.data` only for exact paths needed by the next step. The result distinguishes local dependencies, missing paths, files not synchronized with MagicFS, external references, and dynamic references.

The inspection is static. It does not fetch external URLs, execute JavaScript, or guess runtime-generated paths. A partial scan means the page may still be incomplete.

## Ask before adding files

If the user only asked to share the entry file and local dependencies were found, explain the practical effect and ask for approval:

```text
This page uses local files for its styles, images, fonts, video, or interactions. If I share only the entry file, the page may open with missing or broken content. Should I include the page’s referenced local files?
```

Do not add additional files without approval. A direct request to include the related files is approval for those confirmed dependencies; do not ask again. Do not include an entire directory when the page uses only a subset.

If a dependency is missing, not synchronized, or dynamically referenced, tell the user which part may not work. Do not invent a replacement path. The user may explicitly accept sharing the currently available set, but clearly state that the result may be incomplete.

## Review what will be shared

Before a mutating share call, read the entry and relevant text or configuration files when they are not already known and unchanged. Review actual visible images and videos when their meaning is unclear. Clearly prohibited material must not be shared, even if the user asks. For possible personal data, credentials, internal screenshots, customer material, private research, or an apparently wrong file, explain the concrete risk and ask the user to exclude it or cancel.

## Reuse, update, or create

1. Check the original requested file set with `list_file_shares`.
2. Inspect the entry and obtain the approved final file set.
3. If the original set has one active share and the user approved new dependencies, call `get_share` and then update that same resource:

```python
updated = tool.call("update_file_share", {
    "share_ref": "<resource-id>",
    "file_paths": [
        "site/index.html",
        "site/styles.css",
        "site/app.js",
        "site/images/cover.png",
    ],
    "entry_file_path": "site/index.html",
})
print(updated.content)
```

Do not call `create_file_share` for this case. The original resource ID, access method, password, and page settings must remain unchanged. `file_paths` is the complete final set, so keep every existing file that should remain shared.

4. If no original share exists, check the final complete file set with `list_file_shares` once more. Reuse one unambiguous match; ask the user when there are multiple matches; create only when there is no match.

Only include files confirmed by the Agent and approved by the user. Return the tool-provided URL unchanged; password-share URLs include the password query parameter when available.
