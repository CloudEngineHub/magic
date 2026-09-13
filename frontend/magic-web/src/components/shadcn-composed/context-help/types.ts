import type { ReactElement, ReactNode, RefObject, UIEventHandler } from "react"

export type HelpTone = "neutral" | "indigo" | "red" | "amber" | "teal"

export interface HelpReadingLinks {
	further?: ReactNode
	recommended?: ReactNode
}

export interface HelpDefinition {
	title: string
	summary: string
	subtitle?: string
	identity?: { name: string; scope?: string; renderIcon: (size: number) => ReactNode }
	points?: readonly string[]
	tone?: HelpTone
	/** 仅在打开完整说明后调用，避免文件列表提前创建所有正文。 */
	renderBody: (reading?: HelpReadingLinks, identity?: HelpDefinition["identity"]) => ReactNode
}

export interface HelpDialogProps {
	id: string
	help: HelpDefinition
	onCloseAutoFocus: (event: Event) => void
	navigation?: ReactNode
	onBack?: () => void
	articleKey?: string
	reading?: HelpReadingLinks
	contentRef?: RefObject<HTMLDivElement>
	onContentScroll?: UIEventHandler<HTMLDivElement>
}

export interface ContextHelpProps {
	help: HelpDefinition
	mode: "preview" | "dialog"
	children: ReactElement
	renderDialog?: (props: HelpDialogProps) => ReactNode
}
