import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import type { SelfMediaAttachmentNode } from "../types"

export interface SelfMediaPostOpsArtifacts {
	source: boolean
	metrics: boolean
	comments: boolean
	review: boolean
}

export type SelfMediaPostOpsArtifactKey = keyof SelfMediaPostOpsArtifacts
export type SelfMediaPostOpsArtifactAnimation = "created" | "updated"
export type SelfMediaPostOpsArtifactAnimations = Partial<
	Record<SelfMediaPostOpsArtifactKey, SelfMediaPostOpsArtifactAnimation>
>

export interface SelfMediaPostOpsArtifactState {
	ready: boolean
	path: string
	fileId?: string
	version?: string
}

export type SelfMediaPostOpsArtifactStates = Record<
	SelfMediaPostOpsArtifactKey,
	SelfMediaPostOpsArtifactState
>

const OPS_ARTIFACT_KEYS: SelfMediaPostOpsArtifactKey[] = ["source", "metrics", "comments", "review"]

export function buildPostOpsArtifactStates(
	item: SelfMediaPlatformPostItem,
	attachmentList?: SelfMediaAttachmentNode[],
): SelfMediaPostOpsArtifactStates {
	const opsPath = item.entry.entry.replace(/\/?post\.json$/, "/ops")
	const source = findFileByTargetPath(attachmentList, `${opsPath}/source.json`)
	const metrics = findFileByTargetPath(attachmentList, `${opsPath}/metrics.json`)
	const comments = findFileByTargetPath(attachmentList, `${opsPath}/comments.json`)
	const reviewHtml = findFileByTargetPath(attachmentList, `${opsPath}/review.html`)
	const reviewMd = reviewHtml
		? null
		: findFileByTargetPath(attachmentList, `${opsPath}/review.md`)

	return {
		source: toArtifactState(`${opsPath}/source.json`, source),
		metrics: toArtifactState(`${opsPath}/metrics.json`, metrics),
		comments: toArtifactState(`${opsPath}/comments.json`, comments),
		review: toArtifactState(
			reviewHtml ? `${opsPath}/review.html` : `${opsPath}/review.md`,
			reviewHtml || reviewMd,
		),
	}
}

export function getPostOpsArtifacts(
	states: SelfMediaPostOpsArtifactStates,
): SelfMediaPostOpsArtifacts {
	return {
		source: states.source.ready,
		metrics: states.metrics.ready,
		comments: states.comments.ready,
		review: states.review.ready,
	}
}

export function diffPostOpsArtifactAnimations(
	prev: SelfMediaPostOpsArtifactStates,
	next: SelfMediaPostOpsArtifactStates,
): SelfMediaPostOpsArtifactAnimations {
	const animations: SelfMediaPostOpsArtifactAnimations = {}
	OPS_ARTIFACT_KEYS.forEach((key) => {
		const before = prev[key]
		const after = next[key]
		if (!before.ready && after.ready) {
			animations[key] = "created"
			return
		}
		if (!before.ready || !after.ready) return
		if (before.fileId !== after.fileId || before.version !== after.version) {
			animations[key] = "updated"
		}
	})
	return animations
}

export function buildOpsMetricsRequestSignature(
	postKey: string,
	metricState?: SelfMediaPostOpsArtifactState,
) {
	if (!metricState?.ready) return `${postKey}:metrics:missing`
	return [
		postKey,
		"metrics",
		metricState.fileId || "no-file-id",
		metricState.version || "no-version",
		metricState.path,
	].join(":")
}

function toArtifactState(
	targetPath: string,
	file: SelfMediaAttachmentNode | null,
): SelfMediaPostOpsArtifactState {
	return {
		ready: Boolean(file),
		path: normalizeRelativePath(file?.relative_file_path || targetPath),
		fileId: file?.file_id,
		version: file?.updated_at,
	}
}

function findFileByTargetPath(
	attachmentList: SelfMediaAttachmentNode[] | undefined,
	targetPath: string,
) {
	if (!attachmentList?.length) return null
	const normalizedTarget = normalizeRelativePath(targetPath)
	const suffix = `/${normalizedTarget}`
	const stack: SelfMediaAttachmentNode[] = [...attachmentList]
	while (stack.length) {
		const node = stack.pop()
		if (!node) continue
		if (node.children?.length) stack.push(...(node.children as SelfMediaAttachmentNode[]))
		if (node.is_directory || !node.relative_file_path) continue
		const path = normalizeRelativePath(node.relative_file_path)
		if (path === normalizedTarget || path.endsWith(suffix)) return node
	}
	return null
}

function normalizeRelativePath(path: string) {
	return path.replace(/^\/+/, "").replace(/\/+/g, "/").replace(/\/+$/, "")
}
