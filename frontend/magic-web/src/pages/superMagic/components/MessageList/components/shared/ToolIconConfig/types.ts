import type { LucideIcon } from "lucide-react"

export interface ToolIconConfig {
	icon: LucideIcon
	bgColor: string
	assetUrl?: string
}

export interface ToolIconBadgeProps {
	toolName?: string
	size?: number
	iconSize?: number
	className?: string
}
