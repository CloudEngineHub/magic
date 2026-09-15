import type { FileReferenceSource } from "@/components/business/MentionPanel/utils/fileReferenceMention"
import { memo } from "react"
import AIEditButton from "../EditToolbar/AIEditButton"
import { AttachmentItem } from "../../../TopicFilesButton/hooks/types"

interface AIOptimizationProps {
	/** Attachment list for AI editing */
	attachmentList?: AttachmentItem[]
	/** Current file ID */
	file_id?: string
	file?: FileReferenceSource
	/** Whether to show button text */
	showButtonText?: boolean
}

/**
 * AI Optimization component wrapper
 * Reuses AIEditButton with showButtonText enabled
 */
function AIOptimization({ attachmentList, file_id, file, showButtonText }: AIOptimizationProps) {
	return (
		<AIEditButton
			showButtonText={showButtonText}
			attachmentList={attachmentList}
			fileId={file_id}
			file={file}
		/>
	)
}

export default memo(AIOptimization)
