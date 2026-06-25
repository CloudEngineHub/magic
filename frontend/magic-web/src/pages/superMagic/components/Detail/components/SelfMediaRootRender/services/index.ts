export { SelfMediaPostsService } from "./SelfMediaPostsService"
export type { LifecycleArgs, SelfMediaSnapshot, TreeContext } from "./SelfMediaPostsService"
export { buildPlaceholderPost, cacheKey, normalizeSelfMediaError } from "./selfMediaHelpers"
export {
	buildSelfMediaPostIndexEntries,
	prefillSelfMediaMagicProjectIndex,
	upsertSelfMediaPostsIndex,
} from "./selfMediaMagicProjectIndex"
export type { SelfMediaPostIndexEntry } from "./selfMediaMagicProjectIndex"
export {
	buildArticlePostTargets,
	ensureArticlePostAssetDirectories,
	resolveSelfMediaRootPath,
} from "./selfMediaPostPaths"
export type { ArticlePostTarget } from "./selfMediaPostPaths"
export type {
	AttachmentNode,
	AttachmentDiff,
	FileRole,
	FileRoleKind,
	PlatformSlice,
	TreeSnapshot,
} from "./selfMediaHelpers"
export { generateTopics, generateOutline, streamGenerate } from "./selfMediaAiGenerate"
export type {
	GenerateTopicsOptions,
	GeneratedTopic,
	GenerateOutlineOptions,
	StreamGenerateOptions,
} from "./selfMediaAiGenerate"
