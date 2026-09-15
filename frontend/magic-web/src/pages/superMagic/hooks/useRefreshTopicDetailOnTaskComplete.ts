import { useEffect, useRef } from "react"
import { SuperMagicApi } from "@/apis"
import { superMagicStore } from "@/pages/superMagic/stores"
import type { Topic } from "../pages/Workspace/types"

interface UseRefreshTopicDetailOnTaskCompleteParams {
	selectedTopic: Topic | null
	onTopicDetailLoaded: (topic: Topic) => void
}

export function useRefreshTopicDetailOnTaskComplete({
	selectedTopic,
	onTopicDetailLoaded,
}: UseRefreshTopicDetailOnTaskCompleteParams) {
	const refreshTaskRef = useRef<null | Promise<void>>(null)
	const pendingRefreshRef = useRef(false)
	const lastHandledEventKeyRef = useRef<null | string>(null)
	const selectedTopicRef = useRef<Topic | null>(selectedTopic)

	selectedTopicRef.current = selectedTopic

	useEffect(() => {
		if (!selectedTopic?.id || !selectedTopic.chat_topic_id) return

		let isActive = true
		lastHandledEventKeyRef.current = null
		pendingRefreshRef.current = false

		const triggerRefresh = () => {
			if (!isActive) return

			// 终态消息可能短时间内连续到达，这里做串行刷新，避免重复并发拉取详情。
			if (refreshTaskRef.current) {
				pendingRefreshRef.current = true
				return
			}

			const currentTopic = selectedTopicRef.current
			if (!currentTopic?.id) return

			refreshTaskRef.current = SuperMagicApi.getTopicDetail(
				{ id: currentTopic.id },
				{ enableErrorMessagePrompt: false },
			)
				.then((topicDetail) => {
					if (!isActive || !topicDetail) return
					if (selectedTopicRef.current?.id !== topicDetail.id) return

					onTopicDetailLoaded(topicDetail)
				})
				.catch((error) => {
					console.error("Failed to refresh topic detail after task completion", error)
				})
				.finally(() => {
					refreshTaskRef.current = null

					if (!isActive || !pendingRefreshRef.current) return

					pendingRefreshRef.current = false
					triggerRefresh()
				})
		}

		const unregister = superMagicStore.subscribe(
			"task.completed",
			({ meta }) => {
				// task.completed 已在 Store 按 task identity 去重；保留 Hook 侧防线，避免
				// 订阅生命周期重建时同一持久结果触发重复请求。
				const eventKey = `${meta.taskId}:${meta.appMessageId}`
				if (lastHandledEventKeyRef.current === eventKey) return

				lastHandledEventKeyRef.current = eventKey
				triggerRefresh()
			},
			{ scope: { topicId: selectedTopic.chat_topic_id } },
		)

		return () => {
			isActive = false
			pendingRefreshRef.current = false
			unregister()
		}
	}, [onTopicDetailLoaded, selectedTopic?.chat_topic_id, selectedTopic?.id])
}
