import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"
import {
	MentionItemType,
	type ProjectFileMentionData,
	type UploadFileMentionData,
} from "@/components/business/MentionPanel/types"
import { MediaPreviewTooltip } from "@/components/base/MediaPreview"
import { useFileUrl } from "@/pages/superMagic/hooks/useFileUrl"
import { htmlScreenshotUploadService } from "@/pages/superMagic/components/MessageEditor/services/HtmlScreenshotUploadService"

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
	const isLocalScreenshot =
		mention.type === MentionItemType.UPLOAD_FILE &&
		Boolean((data as UploadFileMentionData | undefined)?.is_html_screenshot)
	const {
		fileUrl,
		isLoading: remoteLoading,
		hasError: remoteError,
	} = useFileUrl({
		file_id: data?.file_id ?? "",
		type: "preview",
		enabled: !isLocalScreenshot,
	})
	const storageId = isLocalScreenshot
		? (data as UploadFileMentionData | undefined)?.storage_id
		: undefined
	const [localUrl, setLocalUrl] = useState<string | null>(null)
	const [localLoading, setLocalLoading] = useState(Boolean(storageId))
	const [localError, setLocalError] = useState(false)

	useEffect(() => {
		if (!storageId) {
			setLocalUrl(null)
			setLocalLoading(false)
			setLocalError(false)
			return
		}

		let disposed = false
		let localObjectUrl: string | null = null
		setLocalUrl(null)
		setLocalLoading(true)
		setLocalError(false)

		void (async () => {
			try {
				const blob = await htmlScreenshotUploadService.getStoredScreenshotBlob(storageId)
				if (disposed) return
				if (!blob) {
					setLocalError(true)
					setLocalLoading(false)
					return
				}
				localObjectUrl = URL.createObjectURL(blob)
				if (disposed) {
					URL.revokeObjectURL(localObjectUrl)
					return
				}
				setLocalUrl(localObjectUrl)
				setLocalLoading(false)
			} catch {
				if (disposed) return
				setLocalError(true)
				setLocalLoading(false)
			}
		})()

		return () => {
			disposed = true
			if (localObjectUrl) URL.revokeObjectURL(localObjectUrl)
		}
	}, [data?.file_name, storageId])

	const resolvedFileUrl = isLocalScreenshot ? localUrl : fileUrl
	const isLoading = isLocalScreenshot ? localLoading : remoteLoading
	const hasError = isLocalScreenshot
		? localError || (!localLoading && !localUrl)
		: remoteError || (!fileUrl && !remoteLoading)
	const previewUrl = resolvedFileUrl && !isLoading && !hasError ? resolvedFileUrl : null
	if (!data || !previewUrl) return trigger ? <>{trigger}</> : null

	const thumbnail = (
		<img
			src={previewUrl}
			alt={data.file_name}
			draggable={false}
			className="block h-16 w-full rounded-md object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
		/>
	)

	const previewTrigger = trigger ? (
		<span
			className="inline-flex min-w-0 max-w-full overflow-hidden align-middle"
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
	)

	return (
		<MediaPreviewTooltip
			mediaType="image"
			fileName={data.file_name}
			previewUrl={previewUrl}
			errorMessage={t("common.fileUrlFetchFailed", "预览加载失败")}
			closeLabel={t("common.close", "关闭")}
			audioLabels={{
				play: t("common.play", "播放"),
				pause: t("common.pause", "暂停"),
				progress: t("common.progress", "播放进度"),
			}}
			maxWidth={250}
			maxHeight={250}
		>
			{previewTrigger}
		</MediaPreviewTooltip>
	)
}
