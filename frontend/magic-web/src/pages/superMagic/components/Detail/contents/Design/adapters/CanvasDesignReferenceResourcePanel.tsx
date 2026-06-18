import MentionPanel from "@/components/business/MentionPanel"
import {
	PanelState,
	type MentionItem,
	type ProjectFileMentionData,
} from "@/components/business/MentionPanel/types"
import type {
	ReferenceResourcePanelItem,
	ReferenceResourcePanelRendererProps,
} from "@/components/CanvasDesign/types"
import { CANVAS_REFERENCE_MENTION_ITEM_TYPE } from "@/components/CanvasDesign/components/MessageEditor/reference-assets/canvasReferenceMention.constants"
import type { ComponentType } from "react"
import { useEffect } from "react"

const PANEL_CLASS_NAME = "canvas-design-reference-resource-panel"

interface CanvasMentionPanelProps {
	visible: boolean
	triggerRef?: React.RefObject<HTMLElement | null>
	language?: string
	className?: string
	initialState?: PanelState
	initialLoadOptions?: ReferenceResourcePanelRendererProps["initialLoadOptions"]
	initialNavigationStack?: ReferenceResourcePanelRendererProps["initialNavigationStack"]
	lockDismissToExplicitClose?: boolean
	onSelect: (item: MentionItem, context?: { reset?: () => void }) => void
	onClose: () => void
	dataService?: ReferenceResourcePanelRendererProps["dataService"]
	catalogBehavior?: ReferenceResourcePanelRendererProps["catalogBehavior"]
}

const TypedMentionPanel = MentionPanel as unknown as ComponentType<CanvasMentionPanelProps>

function isProjectFileMentionItem(item: MentionItem): item is MentionItem & {
	type: typeof CANVAS_REFERENCE_MENTION_ITEM_TYPE.projectFile
	data: ProjectFileMentionData
} {
	return item.type === CANVAS_REFERENCE_MENTION_ITEM_TYPE.projectFile && Boolean(item.data)
}

function toReferenceResourcePanelItem(item: MentionItem): ReferenceResourcePanelItem | null {
	if (!isProjectFileMentionItem(item)) return null
	return {
		type: item.type,
		data: item.data,
	}
}

// This adapter is intentionally thin: CanvasDesign passes the shared reference
// resource runtime into it. Rebuilding defaults, filters, limits, or navigation
// here would split behavior between the "@" entry and project-select entry.
export function CanvasDesignReferenceResourcePanel(props: ReferenceResourcePanelRendererProps) {
	const {
		visible,
		triggerRef,
		language,
		dataService,
		initialLoadOptions,
		initialNavigationStack,
		catalogBehavior,
		onSelect,
		onClose,
	} = props

	useEffect(() => {
		if (!visible) return

		function handlePointerDown(event: PointerEvent) {
			const target = event.target
			if (!(target instanceof Element)) return
			if (target.closest(`.${PANEL_CLASS_NAME}`)) return
			if (triggerRef?.current instanceof Node && triggerRef.current.contains(target)) return
			onClose()
		}

		document.addEventListener("pointerdown", handlePointerDown, true)
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown, true)
		}
	}, [visible, triggerRef, onClose])

	return (
		<TypedMentionPanel
			visible={visible}
			triggerRef={triggerRef}
			language={language}
			className={PANEL_CLASS_NAME}
			initialState={initialLoadOptions ? PanelState.FOLDER : undefined}
			initialLoadOptions={initialLoadOptions}
			initialNavigationStack={initialNavigationStack}
			lockDismissToExplicitClose
			onSelect={(item, context) => {
				const panelItem = toReferenceResourcePanelItem(item)
				if (!panelItem) return
				onSelect(panelItem, context)
			}}
			onClose={onClose}
			dataService={dataService}
			catalogBehavior={catalogBehavior}
		/>
	)
}
