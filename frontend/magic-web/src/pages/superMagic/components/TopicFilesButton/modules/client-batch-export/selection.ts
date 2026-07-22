import { getClientBatchAppEntryFile } from "./entry"
import type {
	ClientBatchAttachment,
	ClientBatchExportFormat,
	ClientBatchExportSelection,
	ClientBatchExportTarget,
	ClientBatchDisplayConfig,
} from "./types"

const SUPPORTED_EXTENSIONS: Record<ClientBatchExportFormat, ReadonlySet<string>> = {
	pdf: new Set(["html", "htm", "md"]),
	pptx: new Set(["html", "htm"]),
}

function getDisplayConfig(item: ClientBatchAttachment): ClientBatchDisplayConfig | undefined {
	const config = item.display_config || item.metadata
	return config && typeof config === "object" ? (config as ClientBatchDisplayConfig) : undefined
}

export function isClientBatchSlideDisplayConfig(config?: ClientBatchDisplayConfig): boolean {
	return Boolean(
		config?.type === "slide" || (Array.isArray(config?.slides) && config.slides.length > 0),
	)
}

export function getClientBatchFileExtension(item: ClientBatchAttachment): string {
	const explicit = String(item.file_extension || "")
		.trim()
		.replace(/^\./, "")
		.toLowerCase()
	if (explicit) return explicit

	const name = item.file_name || item.name || item.filename || item.display_filename || ""
	const match = String(name).match(/\.([^.]+)$/)
	return match?.[1]?.toLowerCase() || ""
}

export function getClientBatchItemType(
	item: ClientBatchAttachment,
	labels: { folder: string; unknown: string },
): string {
	if (item.is_directory) return labels.folder
	return getClientBatchFileExtension(item).toUpperCase() || labels.unknown
}

function isSlideProject(item: ClientBatchAttachment): boolean {
	return Boolean(item.is_directory && isClientBatchSlideDisplayConfig(getDisplayConfig(item)))
}

function targetKey(
	format: ClientBatchExportFormat,
	item: ClientBatchAttachment,
	entryFile?: ClientBatchAttachment,
): string {
	return `${format}:${entryFile?.file_id || item.file_id || item.relative_file_path || item.file_name || item.name || "unknown"}`
}

/**
 * Converts tree selection into logical client-export targets in one traversal.
 * Folder resources are dependencies, not independent export jobs; only explicitly
 * selected unsupported files are rejected before any browser work starts.
 */
export function collectClientBatchExportTargets(options: {
	items: ClientBatchAttachment[]
	selectedItems: Set<string>
	getItemId: (item: ClientBatchAttachment) => string
	format: ClientBatchExportFormat
}): ClientBatchExportSelection {
	const { items, selectedItems, getItemId, format } = options
	const targets: ClientBatchExportTarget[] = []
	const unsupportedItems: ClientBatchAttachment[] = []
	const targetKeys = new Set<string>()
	const unsupportedKeys = new Set<string>()
	const supportedExtensions = SUPPORTED_EXTENSIONS[format]

	const addUnsupported = (item: ClientBatchAttachment) => {
		const key = getItemId(item) || item.relative_file_path || item.file_name || item.name || ""
		if (!key || unsupportedKeys.has(key)) return
		unsupportedKeys.add(key)
		unsupportedItems.push(item)
	}

	const addTarget = (target: ClientBatchExportTarget) => {
		const key = targetKey(format, target.item, target.entryFile)
		if (targetKeys.has(key)) return
		targetKeys.add(key)
		targets.push(target)
	}

	type TraversalFrame =
		| {
				kind: "visit"
				item: ClientBatchAttachment
				parentSelected: boolean
				attachmentScope: ClientBatchAttachment[]
		  }
		| { kind: "directory-end"; item: ClientBatchAttachment; targetCountBefore: number }
	const stack: TraversalFrame[] = items
		.slice()
		.reverse()
		.map((item) => ({
			kind: "visit",
			item,
			parentSelected: false,
			attachmentScope: items,
		}))

	// An explicit stack keeps this one-shot export scan safe for very deep/large trees.
	while (stack.length > 0) {
		const frame = stack.pop()
		if (!frame) break
		if (frame.kind === "directory-end") {
			if (targets.length === frame.targetCountBefore) addUnsupported(frame.item)
			continue
		}

		const { item, parentSelected, attachmentScope } = frame
		const explicitlySelected = selectedItems.has(getItemId(item))
		const selected = parentSelected || explicitlySelected

		if (!selected) {
			const children = item.children || []
			for (let index = children.length - 1; index >= 0; index -= 1) {
				stack.push({
					kind: "visit",
					item: children[index],
					parentSelected: false,
					attachmentScope: children,
				})
			}
			continue
		}

		if (isSlideProject(item)) {
			const children = item.children || []
			const entryFile = getClientBatchAppEntryFile(children, getDisplayConfig(item))
			const entryExtension = entryFile ? getClientBatchFileExtension(entryFile) : ""
			if (!entryFile?.file_id || !supportedExtensions.has(entryExtension)) {
				if (explicitlySelected) addUnsupported(item)
				continue
			}

			addTarget({
				item,
				attachmentScope: children,
				entryFile,
				folderChildren: children,
				isSlideProject: true,
			})
			continue
		}

		if (item.is_directory) {
			if (explicitlySelected) {
				stack.push({ kind: "directory-end", item, targetCountBefore: targets.length })
			}
			const children = item.children || []
			for (let index = children.length - 1; index >= 0; index -= 1) {
				stack.push({
					kind: "visit",
					item: children[index],
					parentSelected: true,
					attachmentScope: children,
				})
			}
			continue
		}

		if (item.file_id && supportedExtensions.has(getClientBatchFileExtension(item))) {
			addTarget({ item, attachmentScope, isSlideProject: false })
		} else if (explicitlySelected) {
			addUnsupported(item)
		}
	}

	return { targets, unsupportedItems }
}
