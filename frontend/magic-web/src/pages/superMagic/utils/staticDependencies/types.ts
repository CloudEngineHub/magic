import type { AttachmentIndex } from "@/pages/superMagic/components/TopicFilesButton/utils/attachmentIndex"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"

/** Project file shape used during dependency lookup. */
export type StaticDependencyAttachment = AttachmentItem

/** Supported document types that can declare local static-resource dependencies. */
export type StaticDependencyFileType = "html" | "markdown"

/** Inputs shared by all document dependency parsers. */
export interface StaticDependencyResolveContext {
	/** Document whose dependencies are being resolved. */
	file: StaticDependencyAttachment
	/** Text content of the document. */
	content: string
	/** Project files available for matching referenced resource paths. */
	attachments: StaticDependencyAttachment[]
	/** Prebuilt project-file index used for efficient path and hierarchy lookup. */
	attachmentIndex: AttachmentIndex
}

/** Raw parser output before common normalization. */
export interface CollectedStaticDependencies {
	/** Exact IDs of resource files referenced by the document. */
	dependencyFileIds: string[]
	/** Local resource paths that could not be matched to project files. */
	missingResourcePaths?: string[]
}

/** Normalized dependency result consumed by file operations. */
export interface StaticDependencyResult {
	/** Matched document type, or `null` when the file is unsupported. */
	fileType: StaticDependencyFileType | null
	/** Exact resource file IDs used by sharing and downloading. */
	dependencyFileIds: string[]
	/** Directory-aware resource IDs used by moving and copying. */
	dependencyTransferFileIds: string[]
	/** Referenced local paths that were not found in the project. */
	missingResourcePaths: string[]
}

/** Common contract implemented by every document dependency parser. */
export interface StaticDependencyParser {
	/** Reports whether this parser handles the given file. */
	supports(file: StaticDependencyAttachment): boolean
	/** Resolves and normalizes the file's static-resource dependencies. */
	resolve(context: StaticDependencyResolveContext): Promise<StaticDependencyResult>
}
