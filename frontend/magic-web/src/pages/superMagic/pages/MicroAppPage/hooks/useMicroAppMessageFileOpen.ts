import { useEffect, useRef, type RefObject } from "react"
import { useMemoizedFn } from "ahooks"

import type { DetailRef } from "@/pages/superMagic/components/Detail"
import { isStandalonePreviewFile } from "@/pages/superMagic/components/Detail/components/FilesViewer/hooks/previewPolicy"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type {
	OpenFileTabRecord,
	SuperMagicOpenFileTabPayload,
	SuperMagicOpenMicroAppTabPayload,
} from "@/pages/superMagic/events/openFileTab"
import pubsub, { PubSubEvents } from "@/utils/pubsub"

import { getAttachmentId } from "../utils/microAppFiles"

interface PendingFileOpen {
	file: AttachmentItem | OpenFileTabRecord
	locateFileId?: string
}

interface PendingMicroAppOpen {
	appId: string
	appName?: string
}

interface UseMicroAppMessageFileOpenOptions {
	attachmentList: AttachmentItem[]
	detailRef: RefObject<DetailRef | null>
	isFilesViewActive: boolean
	showFilesView: () => void
}

const MICRO_APP_TAB_OPEN_DELAY_MS = 100

export function useMicroAppMessageFileOpen({
	attachmentList,
	detailRef,
	isFilesViewActive,
	showFilesView,
}: UseMicroAppMessageFileOpenOptions) {
	const pendingFileOpenRef = useRef<PendingFileOpen | null>(null)
	const pendingMicroAppOpenRef = useRef<PendingMicroAppOpen | null>(null)
	const microAppOpenTimerRef = useRef<number | null>(null)

	const clearMicroAppOpenTimer = useMemoizedFn(() => {
		if (microAppOpenTimerRef.current == null) return
		window.clearTimeout(microAppOpenTimerRef.current)
		microAppOpenTimerRef.current = null
	})

	const openPendingFile = useMemoizedFn(() => {
		const pendingFileOpen = pendingFileOpenRef.current
		if (!pendingFileOpen || !detailRef.current) return false

		detailRef.current.openFileTab(pendingFileOpen.file)
		if (pendingFileOpen.locateFileId) {
			pubsub.publish(PubSubEvents.Locate_File_In_Tree, pendingFileOpen.locateFileId)
		}
		pendingFileOpenRef.current = null
		return true
	})

	const openPendingMicroApp = useMemoizedFn(() => {
		const pendingMicroAppOpen = pendingMicroAppOpenRef.current
		if (!pendingMicroAppOpen || !detailRef.current) return false

		const payload = pendingMicroAppOpen
		pendingMicroAppOpenRef.current = null
		clearMicroAppOpenTimer()
		microAppOpenTimerRef.current = window.setTimeout(() => {
			microAppOpenTimerRef.current = null
			detailRef.current?.openMicroAppTab?.(payload)
		}, MICRO_APP_TAB_OPEN_DELAY_MS)
		return true
	})

	const handleOpenFileTab = useMemoizedFn((payload: SuperMagicOpenFileTabPayload) => {
		const matchedFile = attachmentList.find((item) => getAttachmentId(item) === payload.fileId)
		const standaloneFile =
			payload.fileData && isStandalonePreviewFile(payload.fileData as AttachmentItem)
				? payload.fileData
				: undefined
		pendingMicroAppOpenRef.current = null
		clearMicroAppOpenTimer()
		pendingFileOpenRef.current = {
			file: standaloneFile ?? matchedFile ?? payload.fileData ?? { file_id: payload.fileId },
			locateFileId: standaloneFile ? undefined : matchedFile?.file_id,
		}

		if (isFilesViewActive && openPendingFile()) return
		showFilesView()
	})

	const handleOpenMicroAppTab = useMemoizedFn((payload: SuperMagicOpenMicroAppTabPayload) => {
		const appId = payload.appId?.trim()
		if (!appId) return

		pendingFileOpenRef.current = null
		pendingMicroAppOpenRef.current = {
			appId,
			appName: payload.appName?.trim() || undefined,
		}

		if (isFilesViewActive && openPendingMicroApp()) return
		showFilesView()
	})

	useEffect(() => {
		if (!isFilesViewActive) {
			clearMicroAppOpenTimer()
			return
		}
		openPendingFile()
		openPendingMicroApp()
	}, [clearMicroAppOpenTimer, isFilesViewActive, openPendingFile, openPendingMicroApp])

	useEffect(() => {
		pubsub.subscribe(PubSubEvents.Open_File_Tab, handleOpenFileTab)
		pubsub.subscribe(PubSubEvents.Open_Micro_App_Tab, handleOpenMicroAppTab)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Open_File_Tab, handleOpenFileTab)
			pubsub.unsubscribe(PubSubEvents.Open_Micro_App_Tab, handleOpenMicroAppTab)
			clearMicroAppOpenTimer()
		}
	}, [clearMicroAppOpenTimer, handleOpenFileTab, handleOpenMicroAppTab])
}
