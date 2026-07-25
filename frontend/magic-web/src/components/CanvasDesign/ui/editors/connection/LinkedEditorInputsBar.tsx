import { FileAudio, FileText, Image as ImageIcon, Video, X } from "lucide-react"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import type { TFunction } from "../../../public/i18n-types"
import type { LinkedTextConnection } from "./linkedTextPrompt"
import type {
	LinkedEditorMediaInactiveReason,
	LinkedEditorMediaItem,
	LinkedEditorMediaKind,
} from "./linkedEditorInputs"
import styles from "./LinkedEditorInputsBar.module.css"

interface LinkedEditorInputsBarProps {
	textConnections: LinkedTextConnection[]
	mediaItems?: LinkedEditorMediaItem[]
	onRemoveConnection: (connectionId: string) => void
}

function getMediaKindLabel(t: TFunction, kind: LinkedEditorMediaKind): string {
	if (kind === "image") return t("connectionEditor.mediaKindImage", "图片")
	if (kind === "video") return t("connectionEditor.mediaKindVideo", "视频")
	return t("connectionEditor.mediaKindAudio", "音频")
}

function getInactiveReasonLabel(
	t: TFunction,
	reason: LinkedEditorMediaInactiveReason | undefined,
): string {
	if (reason === "unsupported-type")
		return t("connectionEditor.linkedMediaUnsupportedType", "类型不支持")
	if (reason === "unsupported-mode")
		return t("connectionEditor.linkedMediaUnsupportedMode", "当前模式不支持")
	if (reason === "over-limit") return t("connectionEditor.linkedMediaOverLimit", "数量超限")
	if (reason === "missing-resource")
		return t("connectionEditor.linkedMediaMissingResource", "资源缺失")
	if (reason === "duplicate") return t("connectionEditor.linkedMediaDuplicate", "已添加")
	return t("connectionEditor.linkedMediaUnavailable", "不可用")
}

function renderMediaIcon(kind: LinkedEditorMediaKind) {
	if (kind === "image") return <ImageIcon size={14} />
	if (kind === "video") return <Video size={14} />
	return <FileAudio size={14} />
}

export default function LinkedEditorInputsBar(props: LinkedEditorInputsBarProps) {
	const { textConnections, mediaItems = [], onRemoveConnection } = props
	const { t } = useCanvasDesignI18n()
	if (textConnections.length === 0 && mediaItems.length === 0) return null
	const removeConnectionLabel = t("connectionEditor.removeConnection", "删除连线")

	return (
		<div className={styles.linkedInputsList}>
			{textConnections.map((item) => (
				<div key={item.connectionId} className={styles.linkedInputItem}>
					<FileText size={14} className={styles.linkedInputIcon} />
					<div className={styles.linkedInputContent} title={item.text}>
						{item.text}
					</div>
					<button
						type="button"
						className={styles.linkedInputRemoveButton}
						aria-label={removeConnectionLabel}
						title={removeConnectionLabel}
						onClick={() => onRemoveConnection(item.connectionId)}
					>
						<X size={14} />
					</button>
				</div>
			))}
			{mediaItems.map((item) => {
				const label = item.fileName || item.path || getMediaKindLabel(t, item.kind)
				const inactiveLabel =
					item.status === "inactive" ? getInactiveReasonLabel(t, item.reason) : null
				return (
					<div
						key={item.connectionId}
						className={styles.linkedInputItem}
						data-status={item.status}
					>
						<span className={styles.linkedInputIcon}>{renderMediaIcon(item.kind)}</span>
						<div
							className={styles.linkedInputContent}
							title={inactiveLabel ? `${label}：${inactiveLabel}` : label}
						>
							{label}
						</div>
						<span className={styles.linkedInputBadge}>
							{inactiveLabel || getMediaKindLabel(t, item.kind)}
						</span>
						<button
							type="button"
							className={styles.linkedInputRemoveButton}
							aria-label={removeConnectionLabel}
							title={removeConnectionLabel}
							onClick={() => onRemoveConnection(item.connectionId)}
						>
							<X size={14} />
						</button>
					</div>
				)
			})}
		</div>
	)
}
