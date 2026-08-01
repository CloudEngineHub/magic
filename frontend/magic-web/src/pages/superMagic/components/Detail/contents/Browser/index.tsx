import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { memo, useEffect, useState } from "react"
import BrowserNavigate from "../../components/BrowserNavigate"
import CommonHeaderV2 from "../../components/CommonHeaderV2"
import type { DetailBrowserAttachment, DetailBrowserData } from "../../types"
import { useStyles } from "./styles"

interface BrowserProps {
	data: DetailBrowserData
	browserAttachments?: DetailBrowserAttachment[]
	userSelectDetail: any
	setUserSelectDetail?: (detail: any) => void
	isFromNode?: boolean
	onClose?: () => void
	// Props from Render component
	type?: string
	currentIndex?: number
	totalFiles?: number
	onPrevious?: () => void
	onNext?: () => void
	onFullscreen?: () => void
	onDownload?: () => void
	hasUserSelectDetail?: boolean
	isFullscreen?: boolean
	// New props for ActionButtons functionality
	viewMode?: "code" | "desktop" | "phone"
	onViewModeChange?: (mode: "code" | "desktop" | "phone") => void
	onCopy?: () => void
	onShare?: () => void
	onFavorite?: () => void
	fileContent?: string
	isFavorited?: boolean
	// File sharing props
	topicId?: string
	baseShareUrl?: string
	currentFile?: {
		id: string
		name: string
		type: string
		url?: string
	}
	className?: string
	selectedProject?: any
	allowEdit?: boolean
}

export default memo(function Browser(props: BrowserProps) {
	const {
		data,
		browserAttachments = [],
		isFromNode,
		// Props from Render component
		type,
		onFullscreen,
		onDownload,
		isFullscreen,
		// New props for ActionButtons functionality
		viewMode,
		onViewModeChange,
		onCopy,
		fileContent,
		// File sharing props
		currentFile,
		className,
		allowEdit,
	} = props
	const { styles, cx } = useStyles()
	const { url, title, file_id, file_key } = data || {}
	const snapshotUrl = browserAttachments.find((attachment) => {
		return attachment.file_key && attachment.file_key === file_key && attachment.file_url
	})?.file_url
	const [imgSrc, setImgSrc] = useState(snapshotUrl || "")

	const onOpenUrl = () => {
		window.open(data?.url, "_blank")
	}

	useEffect(() => {
		if (snapshotUrl) {
			setImgSrc(snapshotUrl)
			return
		}

		setImgSrc("")
		if (file_id) {
			getTemporaryDownloadUrl({ file_ids: [file_id] }).then((res: any) => {
				setImgSrc(res[0]?.url)
			})
		}
	}, [file_id, snapshotUrl])

	return (
		<div className={cx(styles.browserContainer, className)}>
			<CommonHeaderV2
				type={type}
				onFullscreen={onFullscreen}
				onDownload={onDownload}
				isFromNode={isFromNode}
				isFullscreen={isFullscreen}
				// Pass new props for ActionButtons functionality
				viewMode={viewMode}
				onViewModeChange={onViewModeChange}
				onCopy={onCopy}
				fileContent={fileContent || url}
				// File sharing props
				currentFile={currentFile}
				onOpenUrl={onOpenUrl}
				allowEdit={allowEdit}
			/>
			<BrowserNavigate url={url} />
			<div className={styles.content}>
				{imgSrc && (
					<img
						className={styles.screenshot}
						src={imgSrc}
						alt={title}
						data-testid="browser-image"
					/>
				)}
			</div>
		</div>
	)
})
