import { useEffect, useMemo, useRef, useState } from "react"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import {
	buildMobileAttachmentTreeIndex,
	getAttachmentId,
	searchMobileAttachmentTree,
} from "../utils/attachmentTree"

/** Centralizes directory navigation, search state, and list scroll reset for mobile pickers. */
export function useMobileAttachmentBrowser(
	open: boolean,
	attachments: AttachmentItem[],
	includeItem: (item: AttachmentItem) => boolean,
) {
	const [pathStack, setPathStack] = useState<AttachmentItem[]>([])
	const [searchQuery, setSearchQuery] = useState("")
	const scrollPortRef = useRef<HTMLDivElement | null>(null)
	const index = useMemo(() => buildMobileAttachmentTreeIndex(attachments), [attachments])
	const currentNodes =
		pathStack.length === 0 ? attachments : (pathStack[pathStack.length - 1].children ?? [])
	const isSearching = searchQuery.trim().length > 0
	const searchResults = useMemo(
		() => searchMobileAttachmentTree(index, searchQuery, includeItem),
		[index, includeItem, searchQuery],
	)

	useEffect(() => {
		if (!open) return
		setPathStack([])
		setSearchQuery("")
	}, [open])

	useEffect(() => {
		// Reset stale offsets after navigation or filtering replaces the visible list.
		const reset = () => {
			if (scrollPortRef.current) {
				scrollPortRef.current.scrollTop = 0
				const dialog = scrollPortRef.current.closest('[role="dialog"]')
				if (dialog instanceof HTMLElement) dialog.scrollTop = 0
			}
		}
		reset()
		const frame = window.requestAnimationFrame(reset)
		return () => window.cancelAnimationFrame(frame)
	}, [attachments.length, currentNodes.length, isSearching, pathStack.length, searchQuery])

	/** Enters a directory while preserving the same attachment object for breadcrumb rendering. */
	const openFolder = (folder: AttachmentItem) => {
		if (!folder.children?.length) return
		setPathStack((previous) => [...previous, folder])
	}

	/** Moves to a breadcrumb item or returns to the root when index is negative. */
	const navigateTo = (index: number) => {
		if (index < 0) {
			setPathStack([])
			return
		}
		setPathStack((previous) => previous.slice(0, index + 1))
	}

	/** Clears transient browser state after a picker closes or a file is selected. */
	const resetBrowser = () => {
		setPathStack([])
		setSearchQuery("")
	}

	/** Opens a folder from search by restoring its complete parent path first. */
	const openSearchFolder = (pathItems: AttachmentItem[], folder: AttachmentItem) => {
		setPathStack([...pathItems, folder])
		setSearchQuery("")
	}

	return {
		index,
		pathStack,
		currentNodes,
		searchQuery,
		setSearchQuery,
		isSearching,
		searchResults,
		scrollPortRef,
		openFolder,
		openSearchFolder,
		navigateTo,
		resetBrowser,
		getItemById: (id: string) => index.getItemById(id),
		getPathById: (id: string) =>
			[...index.getParentItemsById(id), index.getItemById(id)].filter(
				(item): item is AttachmentItem => Boolean(item),
			),
		getParentId: (id: string) => getAttachmentId(index.getParentItemById(id) || {}) || null,
		getChildrenIds: (id: string) =>
			index
				.getChildKeysById(id)
				.map((key) => getAttachmentId(index.getItemByKey(key) || {}))
				.filter((childId): childId is string => Boolean(childId)),
		getRootId: (item: AttachmentItem) => getAttachmentId(item),
	}
}
