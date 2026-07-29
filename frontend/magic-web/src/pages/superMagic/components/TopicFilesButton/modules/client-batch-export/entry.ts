import type { ClientBatchAttachment, ClientBatchDisplayConfig } from "./types"

function normalizeRelativePath(relativePath: string): string[] | null {
	const segments = relativePath.trim().replace(/\\/g, "/").split("/").filter(Boolean)
	if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
		return null
	}
	return segments
}

function getItemName(item: ClientBatchAttachment): string {
	return item.name || item.file_name || item.filename || item.display_filename || ""
}

function resolveEntryByRelativePath(
	children: ClientBatchAttachment[],
	relativePath: string,
): ClientBatchAttachment | undefined {
	const segments = normalizeRelativePath(relativePath)
	if (!segments) return undefined

	let currentLevel = children
	for (let index = 0; index < segments.length; index += 1) {
		const item = currentLevel.find((candidate) => getItemName(candidate) === segments[index])
		if (!item) return undefined
		if (index === segments.length - 1) return item.is_directory ? undefined : item
		if (!item.is_directory) return undefined
		currentLevel = item.children || []
	}
	return undefined
}

/** Resolve a logical project entry without depending on MessageAttachment UI utilities. */
export function getClientBatchAppEntryFile(
	children: ClientBatchAttachment[],
	displayConfig?: ClientBatchDisplayConfig,
): ClientBatchAttachment | undefined {
	const declaredEntry = displayConfig?.entry
	if (typeof declaredEntry === "string" && declaredEntry.trim()) {
		return resolveEntryByRelativePath(children, declaredEntry)
	}

	if (displayConfig?.type === "custom") {
		const customEntry = displayConfig.index ?? displayConfig.root_path
		if (typeof customEntry === "string" && customEntry.trim()) {
			return resolveEntryByRelativePath(children, customEntry)
		}
	}

	return children.find((item) => {
		const name = getItemName(item).toLowerCase()
		return name === "index.html" || name === "index.htm"
	})
}
