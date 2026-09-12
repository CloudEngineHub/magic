import type { ReactElement, ReactNode } from "react"

export interface HelpDefinition {
	title: string
	summary: string
	subtitle?: string
	/** 仅在打开完整说明后调用，避免文件列表提前创建所有正文。 */
	renderBody: () => ReactNode
}

export interface ContextHelpProps {
	help: HelpDefinition
	mode: "preview" | "dialog"
	children: ReactElement
}
