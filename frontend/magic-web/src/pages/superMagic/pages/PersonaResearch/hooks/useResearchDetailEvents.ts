import { useEffect, type RefObject } from "react"
import { useMemoizedFn } from "ahooks"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import type { DetailRef } from "@/pages/superMagic/components/Detail"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type {
	SuperMagicOpenFileTabByPathPayload,
	SuperMagicOpenFileTabPayload,
	SuperMagicOpenKnowledgeBaseTabPayload,
	SuperMagicOpenMicroAppTabPayload,
} from "@/pages/superMagic/events/openFileTab"
import type { SuperMagicOpenPlaybackTabPayload } from "@/pages/superMagic/events/openPlaybackTab"
import { useResearchFileDownload } from "./useResearchFileDownload"

/** The preview tab is force-mounted; wait one frame so a hidden panel has layout before opening. */
const DETAIL_OPEN_DELAY_MS = 100

interface UseResearchDetailEventsOptions {
	detailRef: RefObject<DetailRef>
	attachmentList: AttachmentItem[]
	/** Brings the "report and files" output tab into view before a preview opens. */
	revealFiles: () => void
	setActiveFileId: (fileId: string | null) => void
	setAutoDetail: (detail: unknown) => void
}

const normalizePath = (path: string) => path.replace(/^\//, "")

/**
 * Message cards (tool calls, file mentions, citations, micro-app mentions) do not call the host
 * directly; they publish pubsub events that the page owning the preview must consume, as the topic
 * and project pages do. The research studio hosts that preview in its files tab.
 */
export function useResearchDetailEvents({
	detailRef,
	attachmentList,
	revealFiles,
	setActiveFileId,
	setAutoDetail,
}: UseResearchDetailEventsOptions) {
	const downloadFile = useResearchFileDownload()

	const openInPreview = useMemoizedFn((open: (detail: DetailRef) => void) => {
		revealFiles()
		window.setTimeout(() => {
			if (detailRef.current) open(detailRef.current)
		}, DETAIL_OPEN_DELAY_MS)
	})

	const handleOpenFileTab = useMemoizedFn((payload: SuperMagicOpenFileTabPayload) => {
		// Messages may pass temporary file data that is not in the attachment tree yet.
		openInPreview((detail) =>
			detail.openFileTab(payload.fileData ?? { file_id: payload.fileId }),
		)
	})

	const handleOpenPlaybackTab = useMemoizedFn((toolData: SuperMagicOpenPlaybackTabPayload) => {
		setActiveFileId(null)
		// A user click on a tool card always activates the playback tab.
		openInPreview((detail) => detail.openPlaybackTab({ toolData, forceActivate: true }))
	})

	const handleOpenFileTabByPath = useMemoizedFn((payload: SuperMagicOpenFileTabByPathPayload) => {
		// @file_path mentions carry only a workspace path; resolve it against the attachment list.
		const targetPath = normalizePath(payload.filePath)
		const matched = attachmentList.find(
			(item) => normalizePath(item.relative_file_path || "") === targetPath,
		)
		if (payload.action === "download") {
			downloadFile(matched?.file_id)
			return
		}
		openInPreview((detail) =>
			detail.openFileTab(
				matched ?? {
					file_name: payload.fileName,
					relative_file_path: targetPath,
					file_path: targetPath,
				},
			),
		)
	})

	const handleOpenKnowledgeBaseTab = useMemoizedFn(
		(payload: SuperMagicOpenKnowledgeBaseTabPayload) => {
			openInPreview((detail) => detail.openKnowledgeBaseTab(payload))
		},
	)

	const handleOpenMicroAppTab = useMemoizedFn((payload: SuperMagicOpenMicroAppTabPayload) => {
		const appId = payload.appId?.trim()
		if (!appId) return
		openInPreview((detail) => detail.openMicroAppTab({ appId, appName: payload.appName }))
	})

	// Restored or switched file tabs report their file so the tab bar highlight stays in sync.
	const handleActiveFileIdUpdate = useMemoizedFn((fileId: string) => setActiveFileId(fileId))
	// Running tools push the live step shown by the playback tab.
	const handleAutoDetailUpdate = useMemoizedFn((detail: unknown) => setAutoDetail(detail))

	useEffect(() => {
		pubsub.subscribe(PubSubEvents.Open_File_Tab, handleOpenFileTab)
		pubsub.subscribe(PubSubEvents.Open_Playback_Tab, handleOpenPlaybackTab)
		pubsub.subscribe(PubSubEvents.Open_File_Tab_By_Path, handleOpenFileTabByPath)
		pubsub.subscribe(PubSubEvents.Open_Knowledge_Base_Tab, handleOpenKnowledgeBaseTab)
		pubsub.subscribe(PubSubEvents.Open_Micro_App_Tab, handleOpenMicroAppTab)
		pubsub.subscribe(PubSubEvents.Update_Active_File_Id, handleActiveFileIdUpdate)
		pubsub.subscribe(PubSubEvents.Super_Magic_Update_Auto_Detail, handleAutoDetailUpdate)
		return () => {
			// Remove only this page's listeners; other mounted hosts may share these events.
			pubsub.unsubscribe(PubSubEvents.Open_File_Tab, handleOpenFileTab)
			pubsub.unsubscribe(PubSubEvents.Open_Playback_Tab, handleOpenPlaybackTab)
			pubsub.unsubscribe(PubSubEvents.Open_File_Tab_By_Path, handleOpenFileTabByPath)
			pubsub.unsubscribe(PubSubEvents.Open_Knowledge_Base_Tab, handleOpenKnowledgeBaseTab)
			pubsub.unsubscribe(PubSubEvents.Open_Micro_App_Tab, handleOpenMicroAppTab)
			pubsub.unsubscribe(PubSubEvents.Update_Active_File_Id, handleActiveFileIdUpdate)
			pubsub.unsubscribe(PubSubEvents.Super_Magic_Update_Auto_Detail, handleAutoDetailUpdate)
		}
	}, [
		handleActiveFileIdUpdate,
		handleAutoDetailUpdate,
		handleOpenFileTab,
		handleOpenFileTabByPath,
		handleOpenKnowledgeBaseTab,
		handleOpenMicroAppTab,
		handleOpenPlaybackTab,
	])
}
