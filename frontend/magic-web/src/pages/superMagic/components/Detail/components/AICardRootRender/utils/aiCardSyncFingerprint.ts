export interface AICardSyncNode {
	file_id?: string
	file_name?: string
	relative_file_path?: string
	updated_at?: string
	created_at?: string
	file_version?: string
	is_directory?: boolean
	children?: AICardSyncNode[]
}

export function buildAICardSyncFingerprint(folderFileId?: string, children: AICardSyncNode[] = []) {
	const parts = [`folder:${folderFileId || ""}`]

	for (const child of children) {
		if (!child) continue
		const fileName = child.file_name || ""
		if (!child.is_directory) {
			if (
				fileName === "magic.project.js" ||
				fileName === "latest.html" ||
				fileName === "template.html"
			) {
				parts.push(getNodeFingerprint(child))
			}
			continue
		}

		if (fileName === "latest" || fileName === "template") {
			parts.push(getNodeFingerprint(child))
			const indexFile = findIndexHtml(child.children)
			if (indexFile) parts.push(getNodeFingerprint(indexFile))
			continue
		}

		if (fileName === "history") {
			parts.push(getNodeFingerprint(child))
			for (const entry of child.children || []) {
				if (!entry) continue
				if (!entry.is_directory && entry.file_name?.endsWith(".html")) {
					parts.push(getNodeFingerprint(entry))
				} else if (entry.is_directory) {
					parts.push(getNodeFingerprint(entry))
					const indexFile = findIndexHtml(entry.children)
					if (indexFile) parts.push(getNodeFingerprint(indexFile))
				}
			}
		}
	}

	return parts.sort().join("|")
}

function findIndexHtml(children?: AICardSyncNode[]) {
	return children?.find((item) => item?.file_name === "index.html" && !item?.is_directory)
}

function getNodeFingerprint(node: AICardSyncNode): string {
	return [
		node?.file_id || "",
		node?.file_name || "",
		node?.relative_file_path || "",
		node?.updated_at || "",
		node?.created_at || "",
		node?.file_version || "",
	].join(":")
}
