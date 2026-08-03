import type { AttachmentIndex } from "@/pages/superMagic/components/TopicFilesButton/utils/attachmentIndex"
import type { StaticDependencyAttachment } from "./types"

/**
 * Returns a lowercase extension from metadata or the file name.
 * @example `README.MD` -> `md`
 */
export function getStaticDependencyFileExtension(file: StaticDependencyAttachment): string {
	return (file.file_extension || file.file_name?.split(".").pop() || "").toLowerCase()
}

/**
 * Returns the document's relative directory, including its trailing slash.
 * @example `docs/guide/readme.md` -> `docs/guide/`
 */
export function getStaticDependencyDirectoryPath(relativeFilePath?: string): string {
	if (!relativeFilePath) return ""
	const lastSlashIndex = relativeFilePath.lastIndexOf("/")
	return lastSlashIndex === -1 ? "" : relativeFilePath.slice(0, lastSlashIndex + 1)
}

/**
 * Finds the first dependency node below the owner's directory.
 * @example Owner `docs/index.html` and dependency `docs/images/a.png` -> the `images` folder ID.
 */
function getDependencyTransferRootFileId({
	ownerDirectoryPathKeys,
	dependencyFileId,
	attachmentIndex,
}: {
	ownerDirectoryPathKeys: string[]
	dependencyFileId: string
	attachmentIndex: AttachmentIndex
}): string {
	const dependencyPathKeys = attachmentIndex.getPathKeysById(dependencyFileId)
	let commonPathLength = 0

	while (
		commonPathLength < ownerDirectoryPathKeys.length &&
		commonPathLength < dependencyPathKeys.length &&
		ownerDirectoryPathKeys[commonPathLength] === dependencyPathKeys[commonPathLength]
	) {
		commonPathLength += 1
	}

	return (
		attachmentIndex.getItemByKey(dependencyPathKeys[commonPathLength])?.file_id ||
		dependencyFileId
	)
}

/**
 * Collapses dependency files into roots that preserve relative paths during move/copy.
 * @example A dependency at `docs/images/a.png` becomes the `images` folder when the owner is
 * `docs/index.html`; a sibling file remains its own file ID.
 */
export function getDependencyTransferFileIds({
	ownerFileId,
	dependencyFileIds,
	attachmentIndex,
}: {
	ownerFileId: string
	dependencyFileIds: string[]
	attachmentIndex: AttachmentIndex
}): string[] {
	const ownerDirectoryPathKeys = attachmentIndex.getPathKeysById(ownerFileId).slice(0, -1)

	return Array.from(
		new Set(
			dependencyFileIds.map((dependencyFileId) =>
				getDependencyTransferRootFileId({
					ownerDirectoryPathKeys,
					dependencyFileId,
					attachmentIndex,
				}),
			),
		),
	)
}
