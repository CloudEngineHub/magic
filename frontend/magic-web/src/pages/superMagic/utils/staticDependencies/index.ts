export { BaseStaticDependencyParser } from "./BaseStaticDependencyParser"
export { HtmlStaticDependencyParser } from "./parsers/HtmlStaticDependencyParser"
export { MarkdownStaticDependencyParser } from "./parsers/MarkdownStaticDependencyParser"
export { getStaticDependencyParser } from "./parserRegistry"
export {
	mergeStaticDependencyFileIds,
	resolveSingleDocumentStaticDependencies,
	supportsStaticDependencies,
} from "./resolveStaticDependencies"
export type {
	CollectedStaticDependencies,
	StaticDependencyAttachment,
	StaticDependencyFileType,
	StaticDependencyParser,
	StaticDependencyResolveContext,
	StaticDependencyResult,
} from "./types"
