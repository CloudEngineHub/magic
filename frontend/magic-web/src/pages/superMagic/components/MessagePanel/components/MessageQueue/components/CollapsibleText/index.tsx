import { cx } from "antd-style"
import RichText from "@/pages/superMagic/components/MessageList/components/Text/components/RichText"
import { useStyles } from "./styles"
import type { JSONContent } from "@tiptap/core"
import SuperTooltip from "@/pages/superMagic/components/SuperTooltip"

export interface CollapsibleTextProps {
	content: JSONContent | string
	maxLines?: number
	className?: string
	onFileClick?: (fileId: string, data: unknown) => void
}

function CollapsibleText({ content, maxLines = 2, className, onFileClick }: CollapsibleTextProps) {
	const { styles } = useStyles()
	const tooltipTitle = (
		<div className={styles.tooltipContent}>
			<RichText content={content} onFileClick={onFileClick} />
		</div>
	)

	return (
		<SuperTooltip title={tooltipTitle}>
			<div
				className={cx(styles.container, styles.textContainer, styles.collapsed, className)}
				style={{
					WebkitLineClamp: maxLines,
					maxHeight: `${maxLines * 16}px`,
				}}
				data-testid="collapsible-text"
			>
				<RichText content={content} onFileClick={onFileClick} />
			</div>
		</SuperTooltip>
	)
}

export default CollapsibleText
