import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import SortableCheckList from "../../primitives/custom/SortableCheckList"
import type { LinkedTextConnection } from "./linkedTextPrompt"
import styles from "./LinkedEditorInputsBar.module.css"

interface LinkedEditorInputsBarProps {
	textConnections: LinkedTextConnection[]
	isTextConnectionSelected: (connectionId: string) => boolean
	onTextConnectionSelectedChange: (connectionId: string, selected: boolean) => void
	onReorderTextConnections: (activeConnectionId: string, overConnectionId: string) => void
}

export default function LinkedEditorInputsBar(props: LinkedEditorInputsBarProps) {
	const {
		textConnections,
		isTextConnectionSelected,
		onTextConnectionSelectedChange,
		onReorderTextConnections,
	} = props
	const { t } = useCanvasDesignI18n()
	const includeLinkedTextLabel = t("connectionEditor.includeLinkedText", "参与生成")
	const reorderLinkedTextLabel = t("connectionEditor.reorderLinkedText", "调整关联文本顺序")
	if (textConnections.length === 0) return null
	const textItems = textConnections.map((item) => ({
		id: item.connectionId,
		checked: isTextConnectionSelected(item.connectionId),
		content: item.text,
		contentTitle: item.text,
		checkboxAriaLabel: `${includeLinkedTextLabel}：${item.text}`,
		checkboxTitle: includeLinkedTextLabel,
		dragHandleAriaLabel: reorderLinkedTextLabel,
		dragHandleTitle: reorderLinkedTextLabel,
	}))

	return (
		<div className={styles.linkedInputsList}>
			<SortableCheckList
				items={textItems}
				onCheckedChange={onTextConnectionSelectedChange}
				onReorder={onReorderTextConnections}
			/>
		</div>
	)
}
