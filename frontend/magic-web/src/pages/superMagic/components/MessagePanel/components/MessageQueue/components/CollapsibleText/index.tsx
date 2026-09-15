import { cx } from "antd-style"
import RichText from "@/pages/superMagic/components/MessageList/components/Text/components/RichText"
import SmartTooltip from "@/components/other/SmartTooltip"
import { useStyles } from "./styles"
import type { JSONContent } from "@/infrastructure/editors/tiptap/core"

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
		<SmartTooltip content={tooltipTitle} maxLines={0} className="w-full">
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
		</SmartTooltip>
	)
}

export default CollapsibleText
