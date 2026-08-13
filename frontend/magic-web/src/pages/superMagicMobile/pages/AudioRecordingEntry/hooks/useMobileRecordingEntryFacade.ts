import { createElement } from "react"
import type { ComponentType, ReactNode } from "react"
import MessageList from "@/components/business/RecordingSummary/components/MessageList"
import AudioUploadAction from "@/components/business/RecordingSummary/AudioUploadAction"
import {
	useRecordingEntryFacade,
	type TranscriptMessage,
	type UseRecordingEntryFacadeResult,
} from "@/pages/superMagic/pages/AudioRecordings/hooks/useRecordingEntryFacade"

export interface UseMobileRecordingEntryFacadeResult extends UseRecordingEntryFacadeResult {
	AudioUploadActionComponent: ComponentType<{
		handler: (onUpload: () => void) => ReactNode
		onFileChange?: (files: FileList) => void
	}>
	MessageListComponent: ComponentType<{
		message: TranscriptMessage[]
		isExpanded: boolean
		className?: string
		mobile?: boolean
	}>
}

const AudioUploadActionComponent: UseMobileRecordingEntryFacadeResult["AudioUploadActionComponent"] =
	(props) => {
		return createElement(AudioUploadAction, props)
	}

const MessageListComponent: UseMobileRecordingEntryFacadeResult["MessageListComponent"] = (props) =>
	createElement(MessageList, props)

export function useMobileRecordingEntryFacade(): UseMobileRecordingEntryFacadeResult {
	const facadeResult = useRecordingEntryFacade()
	return {
		...facadeResult,
		AudioUploadActionComponent,
		MessageListComponent,
	}
}
