import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDebounceFn, useDeepCompareEffect, useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"

import { SuperMagicApi } from "@/apis"
import type { UpdateMicroAppBody } from "@/apis/modules/superMagic"
import magicToast from "@/components/base/MagicToaster/utils"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import useCollaboratorUpdatePanel from "@/pages/superMagic/components/WithCollaborators/hooks/useCollaboratorUpdatePanel"
import { useCreateTopicListener } from "@/pages/superMagic/components/TopicMode"
import { useDefaultModeModelListRefreshOnMount } from "@/pages/superMagic/hooks"
import { useAttachmentsPolling } from "@/pages/superMagic/hooks/useAttachmentsPolling"
import { useProjectAttachmentsChangeRealtime } from "@/pages/superMagic/hooks/useProjectAttachmentsChangeRealtime"
import {
	normalizeUpdateAttachmentsPayload,
	releaseAttachmentsRefreshWaitersWithoutFetch,
	type SuperMagicUpdateAttachmentsRequest,
	withAttachmentsRefreshWaitersResolved,
} from "@/pages/superMagic/services/attachmentsTopicSync"
import { AttachmentDataProcessor } from "@/pages/superMagic/utils/attachmentDataProcessor"
import { canManageProject, isReadOnlyProject } from "@/pages/superMagic/utils/permission"
import { TaskStatus } from "@/pages/superMagic/pages/Workspace/types"
import { RouteName } from "@/routes/constants"
import useNavigate from "@/routes/hooks/useNavigate"
import pubsub, { PubSubEvents } from "@/utils/pubsub"

import type { DetailRef } from "@/pages/superMagic/components/Detail"
import { useAppStore } from "../context"
import { captureMicroAppCover } from "../utils/captureMicroAppCover"
import { canEditMicroAppMetadata, canPublishMicroApp } from "../utils/microAppPermissions"
import { resolveDefaultHtmlEntry } from "../utils/microAppFiles"
import { useMicroAppSelectedProjectSync } from "./useMicroAppSelectedProjectSync"

/**
 * 微应用桌面端和移动端共用的数据控制层。
 * 文件加载、默认入口恢复和项目权限只维护一份，页面组件只负责各自的布局。
 */
export function useMicroAppPageController(appId: string, projectId: string) {
	const { t } = useTranslation("super")
	const store = useAppStore()
	const { conversation } = store
	const navigate = useNavigate()
	const [isInitialAttachmentsLoaded, setIsInitialAttachmentsLoaded] = useState(false)
	const [activeFileId, setActiveFileId] = useState<string | null>(null)
	const [userSelectDetail, setUserSelectDetail] = useState<unknown>(null)
	const [isFileTabsCacheLoaded, setIsFileTabsCacheLoaded] = useState(false)
	const [publishDialogOpen, setPublishDialogOpen] = useState(false)
	const [editDialogOpen, setEditDialogOpen] = useState(false)
	const [editSubmitting, setEditSubmitting] = useState(false)
	const [isDatabasePanelOpen, setIsDatabasePanelOpen] = useState(false)
	const detailRef = useRef<DetailRef>(null)
	const defaultEntryOpenedKeyRef = useRef<string | null>(null)
	const selectedProject = conversation.selectedProject
	const selectedTopic = conversation.topicStore.selectedTopic
	const hasRunningTopic =
		selectedTopic?.task_status === TaskStatus.RUNNING ||
		conversation.topicStore.topics.some((topic) => topic.task_status === TaskStatus.RUNNING)
	const isReadOnly = isReadOnlyProject(selectedProject?.user_role)
	const canEdit = canEditMicroAppMetadata(selectedProject)
	const canPublish = canPublishMicroApp(selectedProject)
	const attachments = store.projectFilesStore.workspaceFileTree
	const attachmentList = store.projectFilesStore.workspaceFilesList
	const collaborationProject = useMemo(
		() =>
			selectedProject
				? {
						...selectedProject,
						// 协作接口继续使用 project_id，协作弹窗的访问地址使用微应用 app_id。
						app_id: appId,
					}
				: null,
		[appId, selectedProject],
	)

	const setAttachments = useMemoizedFn((nextAttachments: AttachmentItem[]) => {
		store.projectFilesStore.setWorkspaceFileTree(nextAttachments)
	})

	useEffect(() => {
		if (projectId && store.projectId !== projectId) {
			store.initFromProjectId(projectId)
		}
	}, [projectId, store])

	useEffect(() => {
		setActiveFileId(null)
		setUserSelectDetail(null)
		setIsFileTabsCacheLoaded(false)
		defaultEntryOpenedKeyRef.current = null
		setPublishDialogOpen(false)
		setEditDialogOpen(false)
		setEditSubmitting(false)
		setIsDatabasePanelOpen(false)
	}, [projectId])

	useDefaultModeModelListRefreshOnMount()
	useCreateTopicListener({
		selectedProject,
		topicStore: conversation.topicStore,
	})

	const updateAttachments = useDebounceFn(
		(pid?: string, callback?: (didLoad: boolean) => void) => {
			if (!pid) {
				store.projectFilesStore.setWorkspaceFileTree([])
				releaseAttachmentsRefreshWaitersWithoutFetch()
				callback?.(false)
				return
			}

			const temporaryToken =
				(window as Window & { temporary_token?: string }).temporary_token || ""
			let didLoad = false

			pubsub.publish(PubSubEvents.Update_Attachments_Loading, true)
			withAttachmentsRefreshWaitersResolved(
				pid,
				SuperMagicApi.getAttachmentsByProjectId({
					projectId: pid,
					temporaryToken,
				})
					.then((res) => {
						const processedData = AttachmentDataProcessor.processAttachmentData(res)
						store.projectFilesStore.setWorkspaceFileTree(processedData.tree)
						store.mentionPanelStore.finishLoadAttachmentsPromise(pid)
						didLoad = true
					})
					.catch((error) => {
						console.error("Failed to fetch micro app attachments:", error)
						store.projectFilesStore.setWorkspaceFileTree([])
					})
					.finally(() => {
						pubsub.publish(PubSubEvents.Update_Attachments_Loading, false)
						callback?.(didLoad)
					}),
			)
		},
		{ wait: 500 },
	).run

	const defaultEntryFile = useMemo(
		() => resolveDefaultHtmlEntry(attachmentList),
		[attachmentList],
	)
	const handleAttachmentsChange = useCallback(
		({ tree, list }: { tree: AttachmentItem[]; list: AttachmentItem[] }) => {
			const processedData = AttachmentDataProcessor.processAttachmentData({ tree, list })
			store.projectFilesStore.setWorkspaceFileTree(processedData.tree)
			setIsInitialAttachmentsLoaded(true)
		},
		[store.projectFilesStore],
	)

	useEffect(() => {
		if (!isInitialAttachmentsLoaded || !isFileTabsCacheLoaded || !defaultEntryFile?.file_id) {
			return
		}

		// FilesViewer 会异步恢复缓存标签，等待恢复完成后再打开默认入口，避免缓存覆盖入口页。
		const entryId = String(defaultEntryFile.file_id)
		const openKey = `${projectId}:${entryId}`
		if (defaultEntryOpenedKeyRef.current === openKey) return

		defaultEntryOpenedKeyRef.current = openKey
		setActiveFileId(entryId)
		detailRef.current?.openFileTab(defaultEntryFile)
	}, [defaultEntryFile, isFileTabsCacheLoaded, isInitialAttachmentsLoaded, projectId])

	useMicroAppSelectedProjectSync(store.projectFilesStore, selectedProject)

	const { checkNowDebounced: checkAttachmentsNowDebounced } = useAttachmentsPolling({
		projectId: selectedProject?.id,
		store: store.projectFilesStore,
		onAttachmentsChange: handleAttachmentsChange,
		onError: useMemoizedFn((error: unknown) => {
			console.error("Failed to poll micro app attachments:", error)
		}),
	})

	useProjectAttachmentsChangeRealtime({
		projectId: selectedProject?.id,
		store: store.projectFilesStore,
		onAttachmentsChange: handleAttachmentsChange,
		onFallbackError: useMemoizedFn((error: unknown) => {
			console.error("Failed to refresh realtime micro app attachments:", error)
		}),
	})

	useDeepCompareEffect(() => {
		const pid = selectedProject?.id
		if (!pid) {
			setIsInitialAttachmentsLoaded(false)
			return
		}

		let isActive = true
		setIsInitialAttachmentsLoaded(false)

		store.mentionPanelStore.initLoadAttachments(pid)
		updateAttachments(pid, (didLoad) => {
			if (!isActive || !didLoad) return
			setIsInitialAttachmentsLoaded(true)
		})

		return () => {
			isActive = false
			store.mentionPanelStore.clearInitLoadAttachmentsPromise(pid)
		}
	}, [selectedProject?.id])

	useEffect(() => {
		const handleUpdateAttachments = (
			payloadOrCallback?: SuperMagicUpdateAttachmentsRequest,
		) => {
			const payload = normalizeUpdateAttachmentsPayload(payloadOrCallback)
			const pid = selectedProject?.id
			if (!pid) {
				payload.callback?.()
				releaseAttachmentsRefreshWaitersWithoutFetch()
				return
			}
			updateAttachments(pid, payload.callback)
		}

		pubsub.subscribe(PubSubEvents.Update_Attachments, handleUpdateAttachments)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Update_Attachments, handleUpdateAttachments)
		}
	}, [selectedProject?.id, updateAttachments])

	const handleOpenFile = useMemoizedFn((value?: unknown) => {
		const fileItem = value as AttachmentItem | undefined
		if (!fileItem?.file_id) return
		detailRef.current?.openFileTab(fileItem)
	})

	const handleActiveFileChange = useMemoizedFn((fileId: string | null) => {
		setActiveFileId(fileId)
	})

	const topicFilesProps = useMemo(
		() => ({
			attachments,
			setUserSelectDetail: () => undefined,
			onFileClick: handleOpenFile,
			projectId: selectedProject?.id,
			activeFileId,
			selectedTopic,
			onAttachmentsChange: setAttachments,
			allowEdit: !isReadOnly,
			selectedWorkspace: undefined,
			selectedProject,
			projects: [],
			workspaces: [],
			isInProject: true,
		}),
		[
			attachments,
			handleOpenFile,
			activeFileId,
			isReadOnly,
			selectedProject,
			selectedTopic,
			setAttachments,
		],
	)

	const handleBackToMicroApps = useMemoizedFn(() => {
		navigate({ name: RouteName.MicroApps })
	})

	const handleOpenPublishDialog = useMemoizedFn(() => {
		if (!canPublish || !defaultEntryFile) return
		setPublishDialogOpen(true)
	})

	const handleToggleDatabasePanel = useMemoizedFn(() => {
		if (!selectedProject?.id) return
		setIsDatabasePanelOpen((current) => !current)
	})

	const handleFileTabsCacheLoaded = useMemoizedFn((loadedProjectId: string) => {
		if (loadedProjectId === selectedProject?.id) {
			setIsFileTabsCacheLoaded(true)
		}
	})

	const {
		openManageModal,
		CollaboratorUpdatePanel,
		canManageCollaborators: hasCollaboratorManagementCapability,
	} = useCollaboratorUpdatePanel({ selectedProject: collaborationProject })
	// 能力位只表示当前版本支持协作者管理，项目角色仍决定当前用户是否有权使用该入口。
	const canManageCollaborators =
		hasCollaboratorManagementCapability && canManageProject(selectedProject?.user_role)

	const handleManageCollaborators = useMemoizedFn(() => {
		if (!selectedProject || !canManageCollaborators) return
		openManageModal()
	})

	const handleProjectNameChange = useMemoizedFn((projectName: string) => {
		if (!selectedProject) return
		conversation.setSelectedProject({
			...selectedProject,
			project_name: projectName,
		})
	})

	const handleCaptureCover = useMemoizedFn(() => {
		if (!defaultEntryFile) return Promise.reject(new Error("Micro app index.html is not ready"))
		return captureMicroAppCover({
			entryFile: defaultEntryFile,
			attachments,
			attachmentList,
		})
	})

	const handleEditMicroApp = useMemoizedFn(async (changes: UpdateMicroAppBody) => {
		if (!selectedProject?.id || !canEdit) return false
		if (changes.app_name === undefined && changes.cover_file_key === undefined) return false

		setEditSubmitting(true)
		try {
			const metadata = await SuperMagicApi.updateMicroApp(appId, changes)
			const nextProjectName = metadata.app_name?.trim()
			if (changes.app_name !== undefined && nextProjectName) {
				handleProjectNameChange(nextProjectName)
				pubsub.publish(
					PubSubEvents.Update_Project_Name,
					selectedProject.id,
					nextProjectName,
				)
			}
			magicToast.success(t("microAppPage.edit.success"))
			return true
		} catch (error) {
			console.error("Failed to edit micro app:", error)
			magicToast.error(t("microAppPage.edit.failed"))
			return false
		} finally {
			setEditSubmitting(false)
		}
	})

	return {
		store,
		conversation,
		selectedProject,
		selectedTopic,
		hasRunningTopic,
		isReadOnly,
		canEdit,
		canPublish,
		attachments,
		attachmentList,
		activeFileId,
		userSelectDetail,
		setUserSelectDetail,
		defaultEntryFile,
		detailRef,
		topicFilesProps,
		handleOpenFile,
		handleActiveFileChange,
		handleBackToMicroApps,
		handleOpenPublishDialog,
		handleToggleDatabasePanel,
		handleFileTabsCacheLoaded,
		checkAttachmentsNowDebounced,
		publishDialogOpen,
		setPublishDialogOpen,
		editDialogOpen,
		setEditDialogOpen,
		editSubmitting,
		isDatabasePanelOpen,
		setIsDatabasePanelOpen,
		CollaboratorUpdatePanel,
		canManageCollaborators,
		handleManageCollaborators,
		handleProjectNameChange,
		captureCoverReady: Boolean(defaultEntryFile?.file_id),
		handleCaptureCover,
		handleEditMicroApp,
	}
}
