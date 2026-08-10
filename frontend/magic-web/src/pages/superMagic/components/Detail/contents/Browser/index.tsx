import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { memo, useEffect, useMemo, useState } from "react"
import { Flex } from "antd"
import { IconWorld } from "@tabler/icons-react"
import { ChevronLeft, ChevronRight, Menu, Plus, RotateCw, ShieldCheck } from "lucide-react"
import MagicIcon from "@/components/base/MagicIcon"
import { useTranslation } from "react-i18next"
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
	const { t } = useTranslation("super")
	const { url, title, file_id, file_key } = data || {}
	const matchedAttachment = useMemo(
		() => browserAttachments.find((attachment) => attachment.file_key === file_key),
		[browserAttachments, file_key],
	)
	const snapshotUrl = matchedAttachment?.file_url || ""
	const resolvedFileId = matchedAttachment?.file_id || file_id || ""
	const [imgSrc, setImgSrc] = useState("")
	const [imageError, setImageError] = useState(false)

	const onOpenUrl = () => {
		window.open(data?.url, "_blank")
	}

	useEffect(() => {
		let cancelled = false
		setImageError(false)
		setImgSrc("")

		if (!resolvedFileId) {
			setImgSrc(snapshotUrl)
			return () => {
				cancelled = true
			}
		}

		getTemporaryDownloadUrl({ file_ids: [resolvedFileId], enableErrorMessagePrompt: false })
			.then((res: Array<{ url?: string }> = []) => {
				if (!cancelled) setImgSrc(res[0]?.url || snapshotUrl)
			})
			.catch(() => {
				if (!cancelled) setImgSrc(snapshotUrl)
			})

		return () => {
			cancelled = true
		}
	}, [resolvedFileId, snapshotUrl])

	const tabTitle = title || url

	return (
		<div className={cx(styles.browserContainer, className)}>
			<div className={styles.chrome}>
				<div className={styles.tabBar}>
					<div className={styles.windowControls} aria-hidden="true">
						<span />
						<span />
						<span />
					</div>
					<div className={styles.activeTab} title={tabTitle}>
						<MagicIcon component={IconWorld} size={14} stroke={1.8} />
						<span>{tabTitle}</span>
						<span className={styles.tabClose} aria-hidden="true">
							×
						</span>
					</div>
					<Flex className={styles.tabActions} align="center" gap={4}>
						<span className={styles.nonInteractiveControl} aria-hidden="true">
							<Plus size={16} strokeWidth={1.7} />
						</span>
						<CommonHeaderV2
							type={type}
							renderMode="actions"
							onFullscreen={onFullscreen}
							onDownload={onDownload}
							isFromNode={isFromNode}
							isFullscreen={isFullscreen}
							viewMode={viewMode}
							onViewModeChange={onViewModeChange}
							onCopy={onCopy}
							fileContent={fileContent || url}
							currentFile={currentFile}
							onOpenUrl={onOpenUrl}
							allowEdit={allowEdit}
						/>
						<span className={styles.nonInteractiveControl} aria-hidden="true">
							<Menu size={16} strokeWidth={1.7} />
						</span>
					</Flex>
				</div>
				<div className={styles.toolbar}>
					<div className={styles.navigationControls} aria-hidden="true">
						<ChevronLeft size={16} strokeWidth={1.8} />
						<ChevronRight size={16} strokeWidth={1.8} />
						<RotateCw size={15} strokeWidth={1.8} />
					</div>
					<div className={styles.addressBar} title={url}>
						<ShieldCheck size={15} strokeWidth={1.8} />
						<span>{url}</span>
					</div>
				</div>
			</div>
			<div className={styles.content}>
				{imgSrc && !imageError ? (
					<img
						className={styles.screenshot}
						src={imgSrc}
						alt={title}
						data-testid="browser-image"
						onError={() => setImageError(true)}
					/>
				) : imageError ? (
					<div className={styles.imageError} role="status">
						<div>{t("waterfallCard.imageUnavailable")}</div>
					</div>
				) : null}
			</div>
		</div>
	)
})
