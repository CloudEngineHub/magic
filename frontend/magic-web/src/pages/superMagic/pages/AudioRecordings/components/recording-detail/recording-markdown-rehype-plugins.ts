import type { Schema } from "hast-util-sanitize"
import type { PluggableList } from "unified"
import rehypeRaw from "rehype-raw"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"

/**
 * GitHub default schema plus recording-specific tags and internal link protocols.
 * magic-time/magic-speaker hrefs are required for time/speaker chip components.
 */
const recordingMarkdownSanitizeSchema: Schema = {
	...defaultSchema,
	tagNames: [...(defaultSchema.tagNames ?? []), "mark"],
	protocols: {
		...defaultSchema.protocols,
		href: [...(defaultSchema.protocols?.href ?? []), "magic-time", "magic-speaker"],
	},
}

/**
 * Rehype pipeline for recording markdown: parse inline HTML then sanitize.
 * Summary content is AI-generated; sanitize still blocks script/iframe/event handlers.
 */
export const RECORDING_MARKDOWN_REHYPE_PLUGINS: PluggableList = [
	rehypeRaw,
	[rehypeSanitize, recordingMarkdownSanitizeSchema],
]
