import { useEffect, useRef, type RefObject } from "react"
import { useMemoizedFn } from "ahooks"

import type { DetailRef } from "@/pages/superMagic/components/Detail"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type {
	OpenFileTabRecord,
	SuperMagicOpenFileTabPayload,
} from "@/pages/superMagic/events/openFileTab"
import pubsub, { PubSubEvents } from "@/utils/pubsub"

import { getAttachmentId } from "../utils/microAppFiles"

interface PendingFileOpen {
	file: AttachmentItem | OpenFileTabRecord
	locateFileId?: string
}

interface UseMicroAppMessageFileOpenOptions {
	attachmentList: AttachmentItem[]
	detailRef: RefObject<DetailRef | null>
	isFilesViewActive: boolean
	showFilesView: () => void
}

export function useMicroAppMessageFileOpen({
	attachmentList,
	detailRef,
	isFilesViewActive,
	showFilesView,
}: UseMicroAppMessageFileOpenOptions) {
	const pendingFileOpenRef = useRef<PendingFileOpen | null>(null)

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

	const handleOpenFileTab = useMemoizedFn((payload: SuperMagicOpenFileTabPayload) => {
		const matchedFile = attachmentList.find((item) => getAttachmentId(item) === payload.fileId)
		pendingFileOpenRef.current = {
			file: matchedFile ?? payload.fileData ?? { file_id: payload.fileId },
			locateFileId: matchedFile?.file_id,
		}

		if (isFilesViewActive && openPendingFile()) return
		showFilesView()
	})

	useEffect(() => {
		if (isFilesViewActive) openPendingFile()
	}, [isFilesViewActive, openPendingFile])

	useEffect(() => {
		pubsub.subscribe(PubSubEvents.Open_File_Tab, handleOpenFileTab)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Open_File_Tab, handleOpenFileTab)
		}
	}, [handleOpenFileTab])
}
