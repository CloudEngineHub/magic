import { useEffect } from "react"
import type { AudioProjectListItem } from "@/types/audioProject"
import { shouldResolveOptimisticItem } from "../utils/resolve-optimistic-item"

interface UseAudioRecordingsOptimisticSyncOptions {
	/** Raw server-side recording list from MobX store */
	storeList: AudioProjectListItem[]
	/** Locally managed optimistic upload/recording projects */
	optimisticItems: AudioProjectListItem[]
	/** Callback invoked to clear resolved optimistic item from facade cache */
	onResolveOptimisticItem?: (projectId: string) => void
	/** Action invoked to pull the latest list page from backend */
	onRefresh: () => void | Promise<void>
}

/**
 * Merges local optimistic uploading/recording items with authoritative backend rows,
 * prioritizing local file transfer progress over basic placeholders.
 */
export function mergeAudioRecordingItems(
	authoritativeItem: AudioProjectListItem,
	optimisticItem?: AudioProjectListItem,
): AudioProjectListItem {
	if (!optimisticItem) return authoritativeItem

	// If the optimistic item is currently uploading or has failed upload, preserve the upload state.
	// This ensures that the upload progress bar and controls remain visible even if the backend list
	// returns a preliminary record (e.g. not_summarized) for this project.
	const isUploading =
		optimisticItem.card_status === "uploading" ||
		optimisticItem.card_status === "upload_failed" ||
		optimisticItem.transferStatus === "transferring" ||
		optimisticItem.transferStatus === "failed"

	if (isUploading) {
		return {
			...authoritativeItem,
			card_status: optimisticItem.card_status,
			transferStatus: optimisticItem.transferStatus,
			transferProgress: optimisticItem.transferProgress,
			duration: optimisticItem.duration ?? authoritativeItem.duration,
		}
	}

	const optimisticIsSummarizing =
		optimisticItem.card_status === "summarizing" &&
		optimisticItem.current_phase === "summarizing" &&
		optimisticItem.phase_status === "in_progress"

	// Summary/re-summary submissions can beat the list endpoint by a few polling ticks.
	// Preserve local summarizing while the authoritative row still reports an older state
	// such as not_summarized, summarized, or summary_failed.
	if (optimisticIsSummarizing && authoritativeItem.card_status !== "summarizing") {
		return {
			...authoritativeItem,
			current_phase: optimisticItem.current_phase,
			phase_status: optimisticItem.phase_status,
			card_status: optimisticItem.card_status,
			is_summarized: optimisticItem.is_summarized,
			task_key: optimisticItem.task_key ?? authoritativeItem.task_key,
			topic_id: optimisticItem.topic_id ?? authoritativeItem.topic_id,
			audio_file_id: optimisticItem.audio_file_id ?? authoritativeItem.audio_file_id,
		}
	}

	return authoritativeItem
}

/**
 * Shared React hook to synchronize locally uploaded optimistic audio files with the
 * backend list. Merges state, runs pollers for unresolved items, and resolves optimistic items
 * once the server list catches up.
 */
export function useAudioRecordingsOptimisticSync({
	storeList,
	optimisticItems,
	onResolveOptimisticItem,
	onRefresh,
}: UseAudioRecordingsOptimisticSyncOptions): AudioProjectListItem[] {
	// 1. Calculate merged list dynamically to ensure MobX reactive tracking works flawlessly
	const mergedList = (() => {
		const mergedMap = new Map<string, AudioProjectListItem>()

		// Keep optimistic items first so newly added recording items appear at the top
		for (const item of optimisticItems) {
			mergedMap.set(item.id, item)
		}
		for (const item of storeList) {
			mergedMap.set(item.id, mergeAudioRecordingItems(item, mergedMap.get(item.id)))
		}

		return Array.from(mergedMap.values())
	})()

	// Serialize item statuses to prevent React useEffect deps issues
	const optimisticItemsStatusStr = optimisticItems
		.map((item) => `${item.id}-${item.card_status}-${item.duration}`)
		.join(",")
	const authoritativeItemsStatusStr = storeList
		.map((item) => `${item.id}-${item.card_status}-${item.duration}`)
		.join(",")
	const optimisticItemsIdsStr = optimisticItems.map((item) => item.id).join(",")
	const authoritativeItemsIdsStr = storeList.map((item) => item.id).join(",")

	// 2. Resolve optimistic item as soon as backend data catch up
	useEffect(() => {
		if (!optimisticItems.length) return

		const hydratedIds = optimisticItems
			.map((item) => item.id)
			.filter((projectId) => {
				const optimisticItem = optimisticItems.find((item) => item.id === projectId)
				const authoritativeItem = storeList.find((entry) => entry.id === projectId)
				if (!optimisticItem || !authoritativeItem) return false

				return shouldResolveOptimisticItem(optimisticItem, authoritativeItem)
			})

		if (!hydratedIds.length) return

		hydratedIds.forEach((projectId) => {
			onResolveOptimisticItem?.(projectId)
		})
	}, [
		onResolveOptimisticItem,
		optimisticItems,
		storeList,
		optimisticItemsStatusStr,
		authoritativeItemsStatusStr,
	])

	// 3. Poll backend list every 5s for items that exist only in optimistic queue
	useEffect(() => {
		if (!optimisticItems.length) return

		const unresolvedItems = optimisticItems.filter(
			(item) => !storeList.some((entry) => entry.id === item.id),
		)
		if (!unresolvedItems.length) return

		const timer = window.setInterval(() => {
			void onRefresh()
		}, 5000)

		return () => {
			window.clearInterval(timer)
		}
	}, [onRefresh, optimisticItems, storeList, optimisticItemsIdsStr, authoritativeItemsIdsStr])

	return mergedList
}
