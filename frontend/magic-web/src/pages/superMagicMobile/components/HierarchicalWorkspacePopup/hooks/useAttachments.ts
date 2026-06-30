import { useState, useCallback } from "react"
import { useDownloadAll } from "@/pages/superMagic/components/TopicFilesButton/useDownloadAll"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import projectFilesStore from "@/stores/projectFiles"
import {
	releaseAttachmentsRefreshWaitersWithoutFetch,
	resolveAttachmentsRefreshWaitersForProject,
	withAttachmentsRefreshWaitersResolved,
} from "@/pages/superMagic/services/attachmentsTopicSync"
import { loadProjectAttachments } from "@/pages/superMagic/services"
import { recordAttachmentsStaleResponseDropped } from "@/pages/superMagic/utils/attachmentPerf"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import {
	isAbortError,
	useLatestAbortableRequest,
} from "@/pages/superMagic/hooks/useLatestAbortableRequest"
import { useProjectAttachmentsChangeRealtime } from "@/pages/superMagic/hooks/useProjectAttachmentsChangeRealtime"
import { useProjectFirstAttachmentRender } from "@/pages/superMagic/hooks/useProjectFirstAttachmentRender"
import { AttachmentDataProcessor } from "@/pages/superMagic/utils/attachmentDataProcessor"

export function useAttachments() {
	const { setWorkspaceFileTree: setAttachments } = projectFilesStore
	const [currentProjectId, setCurrentProjectId] = useState<string>()

	const { handleDownloadAll, allLoading } = useDownloadAll({
		projectId: currentProjectId,
	})
	const { startRequest: startAttachmentsRequest, cancelCurrent: cancelAttachmentsRequest } =
		useLatestAbortableRequest()
	const { shouldRenderProjectFirstRequest, resetProjectFirstRequestRender } =
		useProjectFirstAttachmentRender()

	useProjectAttachmentsChangeRealtime({
		projectId: currentProjectId,
	})

	const updateAttachments = useCallback(
		(selectedProject: ProjectListItem, callback?: () => void) => {
			const projectId = selectedProject?.id

			if (!projectId) {
				cancelAttachmentsRequest()
				resetProjectFirstRequestRender()
				setCurrentProjectId(undefined)
				projectFilesStore.setWorkspaceFileTree([])
				pubsub.publish(PubSubEvents.Update_Attachments_Loading, false)
				callback?.()
				releaseAttachmentsRefreshWaitersWithoutFetch()
				return
			}

			setCurrentProjectId(projectId)
			const request = startAttachmentsRequest()
			const shouldRenderIncrementally = shouldRenderProjectFirstRequest(projectId)
			let didCommitFinalSnapshot = false

			try {
				pubsub.publish(PubSubEvents.Update_Attachments_Loading, true)
				withAttachmentsRefreshWaitersResolved(
					projectId,
					loadProjectAttachments({
						projectId,
						signal: request.signal,
						onBatchSnapshot: shouldRenderIncrementally
							? ({ tree, list, phase, isFinal }) => {
									if (!request.isCurrent()) {
										recordAttachmentsStaleResponseDropped(
											"HierarchicalWorkspacePopup.updateAttachments",
											{ stage: "batch_snapshot", phase },
										)
										return
									}
									const processedData =
										AttachmentDataProcessor.processAttachmentData(
											{ tree, list },
											{ preserveList: true },
										)
									projectFilesStore.setWorkspaceFileTree(processedData.tree, {
										list: processedData.list,
										source: `HierarchicalWorkspacePopup.batch.${phase}`,
									})
									if (isFinal) {
										didCommitFinalSnapshot = true
									}
								}
							: undefined,
					})
						.then((res) => {
							if (!request.isCurrent()) {
								recordAttachmentsStaleResponseDropped(
									"HierarchicalWorkspacePopup.updateAttachments",
									{ stage: "load_result" },
								)
								return
							}
							if (!didCommitFinalSnapshot) {
								projectFilesStore.setWorkspaceFileTree(res.tree, {
									list: res.list,
									source: "HierarchicalWorkspacePopup.load_result",
								})
							}
						})
						.catch((error: unknown) => {
							if (isAbortError(error)) return
							if (!request.isCurrent()) {
								recordAttachmentsStaleResponseDropped(
									"HierarchicalWorkspacePopup.updateAttachments",
									{ stage: "load_error" },
								)
								return
							}
							console.error("Failed to fetch attachments:", error)
							projectFilesStore.setWorkspaceFileTree([])
						})
						.finally(() => {
							if (request.isCurrent()) {
								pubsub.publish(PubSubEvents.Update_Attachments_Loading, false)
							}
							request.release()
							callback?.()
						}),
				)
			} catch (error) {
				if (isAbortError(error)) return
				console.error("Failed to fetch attachments:", error)
				projectFilesStore.setWorkspaceFileTree([])
				pubsub.publish(PubSubEvents.Update_Attachments_Loading, false)
				resolveAttachmentsRefreshWaitersForProject(projectId)
				callback?.()
			}
		},
		[
			cancelAttachmentsRequest,
			resetProjectFirstRequestRender,
			shouldRenderProjectFirstRequest,
			startAttachmentsRequest,
		],
	)

	const clearAttachments = useCallback(() => {
		cancelAttachmentsRequest()
		resetProjectFirstRequestRender()
		setCurrentProjectId(undefined)
		projectFilesStore.setWorkspaceFileTree([])
		pubsub.publish(PubSubEvents.Update_Attachments_Loading, false)
	}, [cancelAttachmentsRequest, resetProjectFirstRequestRender])

	// 包装 setAttachments，使其在更新本地状态时也同步更新 projectFilesStore
	const setAttachmentsWithStoreSync = useCallback(
		(tree: AttachmentItem[]) => {
			setAttachments(tree)
			// 同步更新 projectFilesStore
			projectFilesStore.setWorkspaceFileTree(tree)
		},
		[setAttachments],
	)

	// // 包装 setAttachmentList，保持一致性（虽然通常不需要单独更新 list）
	// const setAttachmentListWithStoreSync = useCallback((list: any[]) => {
	// 	setAttachmentList(list)
	// 	// 如果 list 变化，可能需要重新计算 tree，但这里保持简单，只更新 list
	// 	// 注意：projectFilesStore 的 workspaceFilesList 是通过 setWorkspaceFileTree 自动计算的
	// }, [])

	// useEffect(() => {
	// 	return reaction(
	// 		() => [projectFilesStore.workspaceFileTree, projectFilesStore.workspaceFilesList],
	// 		([tree, list]) => {
	// 			setAttachments(tree)
	// 			setAttachmentList(list)
	// 		},
	// 	)
	// }, [])

	return {
		setAttachments: setAttachmentsWithStoreSync,
		currentProjectId,
		handleDownloadAll,
		allLoading,
		updateAttachments,
		clearAttachments,
		// setAttachmentList: setAttachmentListWithStoreSync,
	}
}
