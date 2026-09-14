import { useTranslation } from "react-i18next"
import type { ReactNode } from "react"
import SmartTooltip from "@/components/other/SmartTooltip"
import { MediaPreviewTrigger, type MediaPreviewSource } from "@/components/base/MediaPreview"
import {
	type ProjectFileImagePreviewSource,
	useProjectFileImagePreviewContext,
	useProjectFileImagePreviewState,
} from "./ProjectFileImagePreviewProvider"

interface ProjectFileImageSmartTooltipProps {
	source: ProjectFileImagePreviewSource
	children: ReactNode
	className?: string
	sideOffset?: number
}

/** Uses the shared media preview tooltip while retaining a name-only fallback without a provider. */
export function ProjectFileImageSmartTooltip({
	source,
	children,
	className,
	sideOffset = 0,
}: ProjectFileImageSmartTooltipProps) {
	const { t } = useTranslation("super")
	const manager = useProjectFileImagePreviewContext()
	const previewState = useProjectFileImagePreviewState(source)

	// Keep the name-only fallback for lightweight contexts that do not mount the
	// project-file preview provider.
	if (!manager || !previewState) {
		return (
			<SmartTooltip fileName placement="bottom" className={className} sideOffset={4}>
				{children}
			</SmartTooltip>
		)
	}

	const mediaSource: MediaPreviewSource = {
		mediaType: "image",
		thumbnailUrl: previewState.url,
		previewUrl: previewState.url,
		isLoading: previewState.status === "loading",
		hasError: previewState.status === "error" || previewState.status === "unavailable",
		loadPreview: async () => {
			manager.ensurePreview(source)
		},
	}

	return (
		<MediaPreviewTrigger
			fileName={source.fileName}
			source={mediaSource}
			fallback={null}
			renderTrigger={() => <span className={className}>{children}</span>}
			labels={{
				errorMessage: t("common.fileNotFoundOrLoadFailed", "文件不存在或加载错误"),
				audioLabels: {
					play: t("common.play", "播放"),
					pause: t("common.pause", "暂停"),
					loading: t("common.loading", "加载中"),
					progress: t("common.progress", "播放进度"),
				},
			}}
			side="right"
			sideOffset={sideOffset}
		/>
	)
}
