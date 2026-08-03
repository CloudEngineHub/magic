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
	/** File type exposed to business callers after a successful match. */
	protected abstract readonly fileType: StaticDependencyFileType

	/** Lets each parser define which files it accepts. */
	abstract supports(file: StaticDependencyAttachment): boolean

	/** Extracts parser-specific dependencies; common normalization stays in `resolve`. */
	protected abstract collectDependencies(
		context: StaticDependencyResolveContext,
	): CollectedStaticDependencies | Promise<CollectedStaticDependencies>

	/** Deduplicates parser output and derives move/copy transfer roots. */
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
