import type { AttachmentItem } from "../hooks/types"

const REQUIRED_FILES = new Set(["template.json", "visual-spec.md", "theme.css"])

function getName(item: AttachmentItem): string {
	return item.file_name || item.filename || item.name || item.display_filename || ""
}

/** 只识别模板根目录的直接结构，不把普通文件夹误判为模板。 */
export function isSlidesTemplateFolder(item: AttachmentItem | undefined): boolean {
	if (!item?.is_directory || !Array.isArray(item.children)) return false

	let hasSlidesDirectory = false
	const files = new Set<string>()
	for (const child of item.children) {
		const name = getName(child)
		if (child.is_directory && name === "slides") {
			hasSlidesDirectory = true
			continue
		}
		if (!child.is_directory && REQUIRED_FILES.has(name)) files.add(name)
	}
	return hasSlidesDirectory && files.size === REQUIRED_FILES.size
}

export function toSlidesTemplatePreviewItem(item: AttachmentItem): AttachmentItem {
	return {
		...item,
		display_config: {
			type: "slide-template",
			source: "project-template",
		},
	}
}
