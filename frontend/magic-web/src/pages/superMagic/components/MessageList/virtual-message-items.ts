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

export interface GroupedVirtualMessageGroup {
	key: string
	header?: VirtualMessageItem
	items: Array<VirtualMessageItem>
}

export interface GroupedVirtualMessageProjection {
	groups: Array<GroupedVirtualMessageGroup>
	items: Array<VirtualMessageItem>
	groupCounts: Array<number>
}

/**
 * Detects an inverse-pagination update without relying on raw page counts. The previous
 * projection must remain a contiguous sequence after a positive offset; a concurrent tail
 * append is valid, while middle inserts, replacements, and filtered/reordered updates are not.
 */
export function getPrependedVirtualItemCount(
	previousItems: ReadonlyArray<Pick<VirtualMessageItem, "key">>,
	nextItems: ReadonlyArray<Pick<VirtualMessageItem, "key">>,
) {
	if (previousItems.length === 0 || nextItems.length <= previousItems.length) return 0

	for (let offset = 1; offset <= nextItems.length - previousItems.length; offset += 1) {
		let matchesPreviousSequence = true
		for (let index = 0; index < previousItems.length; index += 1) {
			if (nextItems[offset + index]?.key !== previousItems[index]?.key) {
				matchesPreviousSequence = false
				break
			}
		}
		if (matchesPreviousSequence) return offset
	}
	return 0
}

function hasRenderableMessageValue(value: unknown) {
	if (value == null) return false
	if (typeof value === "string") return value.trim().length > 0
	if (Array.isArray(value)) return value.length > 0
	if (typeof value === "object") return Object.keys(value).length > 0
	return true
}

const terminalMessageStatuses = new Set([
	"completed",
	"finished",
	"failed",
	"error",
	"suspended",
	"response_missing",
])

function hasTerminalMessageStatus(node: SuperMagicMessageItem) {
	const debug = node?.debug as Record<string, unknown> | undefined
	const tool = node?.tool as Record<string, unknown> | undefined
	const debugTool = debug?.tool as Record<string, unknown> | undefined
	return [node?.status, debug?.status, tool?.status, debugTool?.status].some(
		(status) => typeof status === "string" && terminalMessageStatuses.has(status),
	)
}

/**
 * A message may render through Store-backed business sidecars even when its streaming payload
 * is empty. Tool responses are different: their visible branch is AttachmentSection, while
 * tool-call cards are rendered from the Assistant's tool_calls. Do not keep a role=tool row
 * merely because it reached a terminal status, otherwise Virtuoso measures an empty row.
 */
function shouldIncludeVirtualMessage(node: SuperMagicMessageItem) {
	if (node?.role === "user") return true
	const payloads = [node?.content, node?.reasoning_content, node?.tool_calls]
	const debug = node?.debug as Record<string, unknown> | undefined
	const tool = node?.tool as Record<string, unknown> | undefined
	const debugTool = debug?.tool as Record<string, unknown> | undefined
	const attachmentPayloads = [
		node?.attachments,
		debug?.attachments,
		tool?.attachments,
		debugTool?.attachments,
	]

	if (isToolRoleMessage(node)) {
		return (
			payloads.some(hasRenderableMessageValue) ||
			attachmentPayloads.some(hasRenderableMessageValue)
		)
	}

	if (payloads.some(hasRenderableMessageValue)) return true

	// Assistant sidecar UI can be rendered from fields outside the streaming payload trio.
	// Terminal status is retained here because the Store may fill the final Assistant projection
	// after the historical message enters the list.
	return attachmentPayloads.some(hasRenderableMessageValue) || hasTerminalMessageStatus(node)
}

/**
 * Maps the flat message projection to Virtuoso groups. User messages become native sticky
 * group headers, while the remaining messages stay as measured group items.
 */
export function buildGroupedVirtualMessageProjection(
	items: ReadonlyArray<VirtualMessageItem>,
): GroupedVirtualMessageProjection {
	const groups: Array<GroupedVirtualMessageGroup> = []
	let currentGroup: GroupedVirtualMessageGroup | undefined

	for (const item of items) {
		if (item.isUser) {
			currentGroup = {
				key: `turn-${item.key}`,
				header: item,
				items: [],
			}
			groups.push(currentGroup)
			continue
		}

		if (!currentGroup) {
			currentGroup = {
				key: "leading-messages",
				items: [],
			}
			groups.push(currentGroup)
		}
		currentGroup.items.push(item)
	}

	return {
		groups,
		items: groups.flatMap((group) => group.items),
		groupCounts: groups.map((group) => group.items.length),
	}
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

	messages.forEach((node, sourceIndex) => {
		const key = getMessageNodeKey(node) || `${node?.role || "message"}-${sourceIndex}`
		const isUser = isUserRoleMessage(node)
		const isTool = isToolRoleMessage(node)

		if (isUser) {
			currentTurnKey = `turn-${key}`
		}
		if (!shouldIncludeVirtualMessage(node)) {
			return
		}

		items.push({
			key,
			node,
			index: items.length,
			sourceIndex,
			role: node?.role,
			turnKey: currentTurnKey,
			isUser,
			isTool,
			stickyCandidate: isUser,
			renderMode: "message",
			exportSelectable: currentTurnKey !== "leading-messages",
		})
		if (isUser) userIndices.push(items.length - 1)
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
