import { HtmlStaticDependencyParser } from "./parsers/HtmlStaticDependencyParser"
import { MarkdownStaticDependencyParser } from "./parsers/MarkdownStaticDependencyParser"
import type { StaticDependencyAttachment, StaticDependencyParser } from "./types"

const STATIC_DEPENDENCY_PARSERS: StaticDependencyParser[] = [
	new HtmlStaticDependencyParser(),
	new MarkdownStaticDependencyParser(),
]

/**
 * Returns the parser that supports a file.
 * @example `.md` → `MarkdownStaticDependencyParser`
 */
export function getStaticDependencyParser(
	file: StaticDependencyAttachment,
): StaticDependencyParser | undefined {
	return STATIC_DEPENDENCY_PARSERS.find((parser) => parser.supports(file))
}
