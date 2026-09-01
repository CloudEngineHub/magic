import { Tooltip } from "antd"
import { Loader2 } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"
import {
	MentionItemType,
	type ProjectFileMentionData,
	type UploadFileMentionData,
} from "@/components/business/MentionPanel/types"
import { useFileUrl } from "@/pages/superMagic/hooks/useFileUrl"

interface InspectorScreenshotPreviewProps {
	mention: TiptapMentionAttributes
	/** Optional trigger used when the screenshot itself is not displayed. */
	trigger?: ReactNode
}

export function InspectorScreenshotPreview({ mention, trigger }: InspectorScreenshotPreviewProps) {
	const { t } = useTranslation("super")
	const data =
		mention.type === MentionItemType.PROJECT_FILE ||
		mention.type === MentionItemType.UPLOAD_FILE
			? (mention.data as ProjectFileMentionData | UploadFileMentionData)
			: undefined
	const { fileUrl } = useFileUrl({ file_id: data?.file_id ?? "", type: "preview" })

	if (!data?.file_id) return null

	const thumbnail = fileUrl ? (
		<img
			src={fileUrl}
			alt={data.file_name}
			className="block h-16 w-full rounded-md object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
		/>
	) : (
		<span
			className="flex h-16 w-full items-center justify-center rounded-md bg-muted/50 text-muted-foreground"
			role="status"
			aria-label={t("stylePanel.inspector.screenshotProcessing")}
		>
			<Loader2 size={14} className="animate-spin" />
		</span>
	)

	return (
		<Tooltip
			placement="top"
			styles={{
				body: {
					width: "min(420px, calc(100vw - 32px))",
					maxWidth: "calc(100vw - 32px)",
					padding: 4,
				},
			}}
			title={
				fileUrl ? (
					<img
						src={fileUrl}
						alt={data.file_name}
						className="block max-h-[320px] w-full max-w-full rounded object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
						style={{ maxHeight: "min(320px, calc(100vh - 32px))" }}
					/>
				) : (
					t("stylePanel.inspector.screenshotProcessing")
				)
			}
		>
			{trigger ? (
				<span
					className="inline-flex max-w-full align-middle"
					data-testid="inspector-screenshot-preview-trigger"
				>
					{trigger}
				</span>
			) : (
				<span
					className="block rounded-md bg-muted/30 p-1"
					data-testid="inspector-screenshot-preview"
				>
					{thumbnail}
				</span>
			)}
		</Tooltip>
	)
}
