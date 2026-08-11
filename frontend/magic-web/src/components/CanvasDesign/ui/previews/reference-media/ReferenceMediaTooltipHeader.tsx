import { X } from "lucide-react"
import styles from "../../editors/message/index.module.css"

interface ReferenceMediaTooltipHeaderProps {
	fileName: string
	onClose?: () => void
	closeAriaLabel?: string
}

/** 媒体 Tooltip 的统一悬浮标题：文件名覆盖在媒体内容顶部。 */
export function ReferenceMediaTooltipHeader(props: ReferenceMediaTooltipHeaderProps) {
	const { fileName, onClose, closeAriaLabel } = props

	return (
		<div className={styles.referenceMediaTooltipHeader} data-reference-media-tooltip-header="">
			<span
				className={styles.referenceMediaTooltipFileName}
				title={fileName}
				data-reference-media-tooltip-file-name=""
			>
				{fileName}
			</span>
			{onClose ? (
				<button
					type="button"
					className={styles.referenceMediaTooltipClose}
					aria-label={closeAriaLabel}
					onClick={(event) => {
						event.stopPropagation()
						onClose()
					}}
				>
					<X size={16} aria-hidden />
				</button>
			) : null}
		</div>
	)
}
