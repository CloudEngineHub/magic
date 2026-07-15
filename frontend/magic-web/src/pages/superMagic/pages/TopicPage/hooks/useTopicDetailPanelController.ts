import { useMemoizedFn } from "ahooks"
import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import type { DetailRef } from "../../../components/Detail"
import type { ActiveDetailTabType } from "../../../components/Detail/components/FilesViewer/types"
import type { AttachmentItem } from "../../../components/TopicFilesButton/hooks/types"
import { getTemporaryDownloadUrl } from "../../../utils/api"
import { downloadFileWithAnchor } from "../../../utils/handleFIle"

interface UseTopicDetailPanelControllerOptions {
	detailRef: RefObject<DetailRef>
	isReadOnly: boolean
	activeFileId: string | null
	setActiveFileId: (fileId: string | null) => void
	handleFileClick: (fileItem?: unknown) => void
	topicFilesProps: {
		onFileClick?: (fileItem?: unknown) => void
		[key: string]: unknown
	}
	/** 附件列表，用于 Open_File_Tab_By_Path 事件中按路径查找文件 */
	attachmentList?: AttachmentItem[]
}

interface UseTopicDetailPanelControllerReturn {
	shouldShowDetailPanel: boolean
	handleFileClickWithPanel: (fileItem?: unknown) => void
	topicFilesPropsWithPanel: {
		onFileClick?: (fileItem?: unknown) => void
		[key: string]: unknown
	}
	handleActiveDetailTabChange: (tabType: DetailTabType) => void
	clearActiveDetailTabType: () => void
}

type DetailTabType = ActiveDetailTabType

const DETAIL_OPEN_DELAY_MS = 100
const FILE_OPEN_FALLBACK_DELAY_MS = 300

export function useTopicDetailPanelController({
	detailRef,
	isReadOnly,
	activeFileId,
	setActiveFileId,
	handleFileClick,
	topicFilesProps,
	attachmentList = [],
}: UseTopicDetailPanelControllerOptions): UseTopicDetailPanelControllerReturn {
	const [activeDetailTabType, setActiveDetailTabType] = useState<DetailTabType>(null)
	const fileOpenFallbackTimerRef = useRef<number | null>(null)
	const activeFileIdRef = useRef<string | null>(activeFileId)
	const activeDetailTabTypeRef = useRef<DetailTabType>(null)

	const shouldShowDetailPanel = useMemo(() => {
		if (isReadOnly) {
			return true
		}
		return Boolean(activeFileId) || Boolean(activeDetailTabType)
	}, [activeDetailTabType, activeFileId, isReadOnly])

	useEffect(() => {
		activeFileIdRef.current = activeFileId
	}, [activeFileId])

	useEffect(() => {
		activeDetailTabTypeRef.current = activeDetailTabType
	}, [activeDetailTabType])

	const scheduleFileOpenFallback = useMemoizedFn((fallbackTabType: DetailTabType = null) => {
		if (fileOpenFallbackTimerRef.current) {
			window.clearTimeout(fileOpenFallbackTimerRef.current)
		}

		fileOpenFallbackTimerRef.current = window.setTimeout(() => {
			if (!activeFileIdRef.current) {
				setActiveDetailTabType((prev) => (prev === "file" ? fallbackTabType : prev))
			}
			fileOpenFallbackTimerRef.current = null
		}, FILE_OPEN_FALLBACK_DELAY_MS)
	})

	useEffect(() => {
		return () => {
			if (fileOpenFallbackTimerRef.current) {
				window.clearTimeout(fileOpenFallbackTimerRef.current)
			}
		}
	}, [])

	const handleFileClickWithPanel = useMemoizedFn((fileItem?: unknown) => {
		const fallbackTabType = activeDetailTabTypeRef.current
		setActiveDetailTabType("file")
		handleFileClick(fileItem)
		scheduleFileOpenFallback(fallbackTabType)
	})

	const topicFilesPropsWithPanel = useMemo(
		() => ({
			...topicFilesProps,
			onFileClick: handleFileClickWithPanel,
		}),
		[handleFileClickWithPanel, topicFilesProps],
	)

	useEffect(() => {
		const handleOpenFileTab = (data: unknown) => {
			const payload = data as { fileId: string; fileData?: unknown }
			window.setTimeout(() => {
				// Allow messages to pass temporary fileData through the detail panel open flow.
				detailRef.current?.openFileTab?.(
					payload.fileData ?? payload.fileData ?? { file_id: payload.fileId },
				)
			}, DETAIL_OPEN_DELAY_MS)
			scheduleFileOpenFallback()
		}

		const handleOpenPlaybackTab = (toolData: unknown) => {
			setActiveFileId(null)
			setActiveDetailTabType("playback")
			window.setTimeout(() => {
				detailRef.current?.openPlaybackTab?.({ toolData, forceActivate: true })
			}, DETAIL_OPEN_DELAY_MS)
		}

		const handleOpenFileTabByPath = (data: unknown) => {
			// Resolve the target file by relative_file_path from attachmentList.
			const payload = data as {
				filePath: string
				fileName: string
				action?: "open" | "download"
			}
			const normPath = (p: string) => p.replace(/^\//, "")
			const targetPath = normPath(payload.filePath)
			const matched = attachmentList.find(
				(item) => normPath(item.relative_file_path || "") === targetPath,
			)
			if (matched?.file_id) {
				if (payload.action === "download") {
					getTemporaryDownloadUrl({
						file_ids: [matched.file_id],
						is_download: true,
					}).then((res: any) => {
						downloadFileWithAnchor(res[0]?.url)
					})
				} else {
					window.setTimeout(() => {
						detailRef.current?.openFileTab?.(matched)
					}, DETAIL_OPEN_DELAY_MS)
					scheduleFileOpenFallback()
				}
				return
			}

			if (payload.action !== "download") {
				window.setTimeout(() => {
					detailRef.current?.openFileTab?.({
						file_name: payload.fileName,
						relative_file_path: targetPath,
						file_path: targetPath,
					})
				}, DETAIL_OPEN_DELAY_MS)
				scheduleFileOpenFallback()
			}

			if (payload.action !== "download") {
				window.setTimeout(() => {
					detailRef.current?.openFileTab?.({
						file_name: payload.fileName,
						relative_file_path: targetPath,
						file_path: targetPath,
					})
				}, DETAIL_OPEN_DELAY_MS)
				scheduleFileOpenFallback()
			}
		}

		const handleOpenKnowledgeBaseTab = (data: unknown) => {
			const payload = data as {
				knowledgeBaseId: string
				documentCode?: string
				fileKey?: string
				title: string
				knowledgeBaseName?: string
				fileExtension?: string
			}
			setActiveDetailTabType("knowledge_base")
			window.setTimeout(() => {
				detailRef.current?.openKnowledgeBaseTab?.(payload)
			}, DETAIL_OPEN_DELAY_MS)
		}

		pubsub.subscribe(PubSubEvents.Open_File_Tab, handleOpenFileTab)
		pubsub.subscribe(PubSubEvents.Open_Playback_Tab, handleOpenPlaybackTab)
		pubsub.subscribe(PubSubEvents.Open_File_Tab_By_Path, handleOpenFileTabByPath)
		pubsub.subscribe(PubSubEvents.Open_Knowledge_Base_Tab, handleOpenKnowledgeBaseTab)

		return () => {
			pubsub.unsubscribe(PubSubEvents.Open_File_Tab, handleOpenFileTab)
			pubsub.unsubscribe(PubSubEvents.Open_Playback_Tab, handleOpenPlaybackTab)
			pubsub.unsubscribe(PubSubEvents.Open_File_Tab_By_Path, handleOpenFileTabByPath)
			pubsub.unsubscribe(PubSubEvents.Open_Knowledge_Base_Tab, handleOpenKnowledgeBaseTab)
		}
	}, [detailRef, scheduleFileOpenFallback, setActiveFileId, attachmentList])

	const handleActiveDetailTabChange = useMemoizedFn((tabType: DetailTabType) => {
		setActiveDetailTabType(tabType)
	})

	const clearActiveDetailTabType = useMemoizedFn(() => {
		setActiveDetailTabType(null)
	})

	return {
		shouldShowDetailPanel,
		handleFileClickWithPanel,
		topicFilesPropsWithPanel,
		handleActiveDetailTabChange,
		clearActiveDetailTabType,
	}
}
