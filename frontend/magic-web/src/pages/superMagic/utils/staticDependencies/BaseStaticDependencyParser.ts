import { getDependencyTransferFileIds } from "./pathUtils"
import type {
	CollectedStaticDependencies,
	StaticDependencyAttachment,
	StaticDependencyFileType,
	StaticDependencyParser,
	StaticDependencyResolveContext,
	StaticDependencyResult,
} from "./types"

export abstract class BaseStaticDependencyParser implements StaticDependencyParser {
	/** File type handled by the parser. */
	protected abstract readonly fileType: StaticDependencyFileType

	/** Checks whether the parser supports the file. */
	abstract supports(file: StaticDependencyAttachment): boolean

	/** Extracts format-specific dependencies. */
	protected abstract collectDependencies(
		context: StaticDependencyResolveContext,
	): CollectedStaticDependencies | Promise<CollectedStaticDependencies>

	/** Deduplicates and derives transfer roots. */
	async resolve(context: StaticDependencyResolveContext): Promise<StaticDependencyResult> {
		const collected = await this.collectDependencies(context)
		const dependencyFileIds = [...new Set(collected.dependencyFileIds)].filter(
			(fileId) => fileId !== context.file.file_id,
		)

		return {
			fileType: this.fileType,
			dependencyFileIds,
			dependencyTransferFileIds: getDependencyTransferFileIds({
				ownerFileId: context.file.file_id || "",
				dependencyFileIds,
				attachmentIndex: context.attachmentIndex,
			}),
			missingResourcePaths: [...new Set(collected.missingResourcePaths || [])],
		}
	}
}
