import type { AttachmentIndex } from "@/pages/superMagic/components/TopicFilesButton/utils/attachmentIndex"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"

/** Project file used during dependency lookup. */
export type StaticDependencyAttachment = AttachmentItem

/** File types with dependency parsers. */
export type StaticDependencyFileType = "html" | "markdown"

/** Shared parser input. */
export interface StaticDependencyResolveContext {
	/** Current document. */
	file: StaticDependencyAttachment
	/** Document text. */
	content: string
	/** Project files used for resource matching. */
	attachments: StaticDependencyAttachment[]
	/** File index for path and hierarchy lookup. */
	attachmentIndex: AttachmentIndex
}

/** Raw parser output. */
export interface CollectedStaticDependencies {
	/** Referenced resource IDs. */
	dependencyFileIds: string[]
	/** Unmatched local paths. */
	missingResourcePaths?: string[]
}

/** Normalized result for file operations. */
export interface StaticDependencyResult {
	/** Matched type, or `null` when unsupported. */
	fileType: StaticDependencyFileType | null
	/** Resource IDs for sharing and downloading. */
	dependencyFileIds: string[]
	/** Transfer-root IDs for moving and copying. */
	dependencyTransferFileIds: string[]
	/** Referenced paths missing from the project. */
	missingResourcePaths: string[]
}

/** Common dependency parser contract. */
export interface StaticDependencyParser {
	/** Whether the parser supports the file. */
	supports(file: StaticDependencyAttachment): boolean
	/** Resolves and normalizes dependencies. */
	resolve(context: StaticDependencyResolveContext): Promise<StaticDependencyResult>
}
