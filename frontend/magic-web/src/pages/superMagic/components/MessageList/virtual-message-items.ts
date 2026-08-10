import { defaultRangeExtractor, type Range } from "@tanstack/react-virtual"
import type { SuperMagicMessageItem } from "./type"
import { getMessageNodeKey } from "./helpers"
import {
	buildMessageKeysAndTurnGroups,
	isToolRoleMessage,
	isUserRoleMessage,
	type MessageTurnGroup,
} from "./message-turn-groups"

export interface VirtualMessageItem {
	key: string
	node: SuperMagicMessageItem
	/** Position in the composed virtual sequence. */
	index: number
	/** Position in the source converted-message array used by the existing renderer. */
	sourceIndex: number
	role: SuperMagicMessageItem["role"]
	turnKey: string
	isUser: boolean
	isTool: boolean
	stickyCandidate: boolean
	renderMode: "message" | "revoked-editable" | "revoked-preview"
	exportSelectable: boolean
}

export interface VirtualMessageProjection {
	items: Array<VirtualMessageItem>
	messageKeys: Array<string>
	messageTurnGroups: Array<MessageTurnGroup>
	userIndices: Array<number>
}

/**
 * Builds the shared data projection for both the virtual DOM and turn-based export logic.
 * Keeping both products in one pass prevents DOM virtualization from changing business ownership.
 */
export function buildVirtualMessageProjection(
	messages: Array<SuperMagicMessageItem>,
): VirtualMessageProjection {
	const { messageKeys, messageTurnGroups } = buildMessageKeysAndTurnGroups(messages)
	const userIndices: Array<number> = []
	const items: Array<VirtualMessageItem> = []
	let currentTurnKey = "leading-messages"

	messages.forEach((node, index) => {
		const key = getMessageNodeKey(node) || `${node?.role || "message"}-${index}`
		const isUser = isUserRoleMessage(node)
		const isTool = isToolRoleMessage(node)

		if (isUser) {
			currentTurnKey = `turn-${key}`
			userIndices.push(index)
		}

		items.push({
			key,
			node,
			index,
			sourceIndex: index,
			role: node?.role,
			turnKey: currentTurnKey,
			isUser,
			isTool,
			stickyCandidate: isUser,
			renderMode: "message",
			exportSelectable: currentTurnKey !== "leading-messages",
		})
	})

	return { items, messageKeys, messageTurnGroups, userIndices }
}

interface ComposeVirtualMessageItemsOptions {
	normalItems: ReadonlyArray<VirtualMessageItem>
	revokedItems: ReadonlyArray<VirtualMessageItem>
	firstRevokedUserKey?: string | null
	includeRevoked: boolean
	showOnlyFirstRevoked?: boolean
	revokedPreviewExpanded: boolean
	collapsedPreviewLimit: number
}

/**
 * Reindexes normal and revoked sections into one TanStack list. Collapsing changes only the
 * projected revoked preview rows; canonical revoked messages remain available to expand again.
 */
export function composeVirtualMessageItems({
	normalItems,
	revokedItems,
	firstRevokedUserKey,
	includeRevoked,
	showOnlyFirstRevoked = false,
	revokedPreviewExpanded,
	collapsedPreviewLimit,
}: ComposeVirtualMessageItemsOptions): {
	items: Array<VirtualMessageItem>
	userIndices: Array<number>
} {
	const composed: Array<VirtualMessageItem> = normalItems.map((item) => ({
		...item,
		renderMode: "message",
	}))

	if (includeRevoked) {
		const editableItem = firstRevokedUserKey
			? revokedItems.find((item) => item.key === firstRevokedUserKey)
			: undefined
		const previewItems = revokedItems.filter((item) => item.key !== firstRevokedUserKey)
		const visiblePreviewItems = showOnlyFirstRevoked
			? []
			: revokedPreviewExpanded
				? previewItems
				: previewItems.slice(0, collapsedPreviewLimit)

		if (editableItem) {
			composed.push({
				...editableItem,
				turnKey: `revoked-${editableItem.turnKey}`,
				renderMode: "revoked-editable",
				exportSelectable: false,
			})
		}
		for (const item of visiblePreviewItems) {
			composed.push({
				...item,
				turnKey: `revoked-${item.turnKey}`,
				renderMode: "revoked-preview",
				exportSelectable: false,
			})
		}
	}

	const userIndices: Array<number> = []
	const items = composed.map((item, index) => {
		if (item.stickyCandidate) userIndices.push(index)
		return { ...item, index }
	})

	return { items, userIndices }
}

/** Binary-searches the ordered User indices without allocating during scroll. */
export function findActiveStickyIndex(
	userIndices: ReadonlyArray<number>,
	visibleStartIndex: number,
): number | undefined {
	let low = 0
	let high = userIndices.length - 1
	let activeIndex: number | undefined

	while (low <= high) {
		const middle = low + Math.floor((high - low) / 2)
		const candidate = userIndices[middle]
		if (candidate <= visibleStartIndex) {
			activeIndex = candidate
			low = middle + 1
		} else {
			high = middle - 1
		}
	}

	return activeIndex
}

/**
 * TanStack normally mounts only the overscanned range. Add the preceding User so the same
 * ordinary message row can remain sticky without rendering a second clone outside the list.
 */
export function createStickyRangeExtractor(
	userIndices: ReadonlyArray<number>,
): (range: Range) => Array<number> {
	return (range: Range) => {
		const indices = defaultRangeExtractor(range)
		const activeStickyIndex = findActiveStickyIndex(userIndices, range.startIndex)
		if (activeStickyIndex === undefined || indices.includes(activeStickyIndex)) return indices
		return [activeStickyIndex, ...indices].sort((left, right) => left - right)
	}
}
