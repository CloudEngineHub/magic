import type { GenerateVideoRequest } from "../../../../public/magic-types"
import { getClipboardResourcePathKey } from "../../../../runtime/resources/clipboard/clipboardResourceReferences"

type MutableRecord = Record<string, unknown>

const URI_ARRAY_INPUT_FIELDS = [
	"frames",
	"reference_images",
	"reference_videos",
	"reference_audios",
	"audio",
] as const

function asRecord(value: unknown): MutableRecord | null {
	return value && typeof value === "object" ? (value as MutableRecord) : null
}

function addPath(paths: string[], seen: Set<string>, value: unknown): void {
	if (typeof value !== "string") return
	const path = value.trim()
	if (!path) return

	const pathKey = getClipboardResourcePathKey(path)
	if (!pathKey || seen.has(pathKey)) return

	seen.add(pathKey)
	paths.push(path)
}

function collectUriArray(paths: string[], seen: Set<string>, value: unknown): void {
	if (!Array.isArray(value)) return
	for (const item of value) {
		const record = asRecord(item)
		addPath(paths, seen, record?.uri)
	}
}

function collectPathArray(paths: string[], seen: Set<string>, value: unknown): void {
	if (!Array.isArray(value)) return
	for (const item of value) {
		addPath(paths, seen, item)
	}
}

/**
 * Collects only schema resource fields used by video generation. Prompt text is intentionally ignored.
 */
export function collectVideoGenerationRequestResourcePaths(
	request: Partial<GenerateVideoRequest> | null | undefined,
): string[] {
	const paths: string[] = []
	const seen = new Set<string>()
	const requestRecord = asRecord(request)
	const inputs = asRecord(request?.inputs)

	if (inputs) {
		for (const field of URI_ARRAY_INPUT_FIELDS) {
			collectUriArray(paths, seen, inputs[field])
		}
		addPath(paths, seen, asRecord(inputs.video)?.uri)
		addPath(paths, seen, asRecord(inputs.mask)?.uri)
	}

	// Tolerate legacy API-shaped request objects if they are passed through this hook.
	collectPathArray(paths, seen, requestRecord?.reference_images)
	collectUriArray(paths, seen, requestRecord?.frames)

	return paths
}

export function collectPendingVideoGenerationRequestResourcePaths(
	request: Partial<GenerateVideoRequest> | null | undefined,
	shouldDefer: (path: string) => boolean,
): string[] {
	return collectVideoGenerationRequestResourcePaths(request).filter((path) => shouldDefer(path))
}
