import type { SelfMediaPlatform } from "../../../types"
import type { SelfMediaAttachmentNode } from "../types"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import type {
	SelfMediaPostOpsArtifacts,
	SelfMediaPostOpsArtifactStates,
} from "../services/selfMediaOpsArtifactStates"

export function getSelfMediaHomeDisplayName(
	userInfo: { nickname?: string | null; real_name?: string | null } | null,
) {
	return (userInfo?.nickname || userInfo?.real_name || "").trim()
}

export function hasHomePreviewAsset({ platform, post }: SelfMediaPlatformPostItem) {
	if (platform === "wechat-official-accounts") {
		const cover = post.thumbnailCover || post.heroCover
		return Boolean(cover?.fileId || cover?.url)
	}
	const card = post.cards[0]
	return Boolean(card?.fileId || card?.url)
}

export function isAICardDisplayConfig(value: unknown): value is { type: "ai-card" } {
	return Boolean(
		value && typeof value === "object" && "type" in value && value.type === "ai-card",
	)
}

export function findSelfMediaFolderNode(
	nodes: SelfMediaAttachmentNode[] | undefined,
	folderFileId: string | undefined,
): SelfMediaAttachmentNode | null {
	if (!nodes?.length || !folderFileId) return null
	for (const node of nodes) {
		if (node.file_id === folderFileId) return node
		if (node.is_directory && node.children?.length) {
			const result = findSelfMediaFolderNode(
				node.children as SelfMediaAttachmentNode[],
				folderFileId,
			)
			if (result) return result
		}
	}
	return null
}

export function buildOpsArtifactStateSignature(
	statesByPostKey: Map<string, SelfMediaPostOpsArtifactStates>,
) {
	return buildOpsStateVersion(statesByPostKey)
}

export function buildOpsReviewDataVersion(states?: SelfMediaPostOpsArtifactStates) {
	if (!states) return ""
	const stateMap = new Map<string, SelfMediaPostOpsArtifactStates>([["active", states]])
	return buildOpsStateVersion(stateMap)
}

function buildOpsStateVersion(statesByPostKey: Map<string, SelfMediaPostOpsArtifactStates>) {
	const keys: Array<keyof SelfMediaPostOpsArtifacts> = ["source", "metrics", "comments", "review"]
	return Array.from(statesByPostKey.entries())
		.map(([postKey, states]) =>
			[
				postKey,
				...keys.flatMap((key) => {
					const state = states[key]
					return [key, state.ready ? "1" : "0", state.fileId || "", state.version || ""]
				}),
			].join(":"),
		)
		.join("|")
}

export type SelfMediaHomeOpenTarget = { platform: SelfMediaPlatform; index: number }

export type SelfMediaHomeLayout = "compact" | "comfortable" | "spacious"

export function getSelfMediaHomeLayout(width: number): SelfMediaHomeLayout {
	if (width >= 900) return "spacious"
	if (width >= 560) return "comfortable"
	return "compact"
}

export function getSelfMediaHomePostColumnCount(layout: SelfMediaHomeLayout) {
	if (layout === "spacious") return 3
	if (layout === "comfortable") return 2
	return 1
}
