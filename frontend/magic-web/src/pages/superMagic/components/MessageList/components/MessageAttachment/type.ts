import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
export interface AttachmentProps extends AttachmentItem {
	file_extension: string | undefined
	file_name: string
	filename: string
	contentLength: number
	url: string
	file_id: string
	display_filename?: string
	display_config?: {
		version: string
		type: string
		name: string
		slides?: string[]
	}
}
