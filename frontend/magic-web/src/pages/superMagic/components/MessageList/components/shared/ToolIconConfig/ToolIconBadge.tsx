import { memo } from "react"
import { getToolIconConfig } from "./config"
import type { ToolIconBadgeProps } from "./types"

function ToolIconBadge({ toolName, size = 16, iconSize = 10, className = "" }: ToolIconBadgeProps) {
	const config = getToolIconConfig(toolName)
	const IconComponent = config.icon

	return (
		<span
			className={`flex flex-shrink-0 items-center justify-center rounded-sm ${className}`}
			style={{
				backgroundColor: config.assetUrl ? "transparent" : config.bgColor,
				width: `${size}px`,
				height: `${size}px`,
			}}
		>
			{config.assetUrl ? (
				<img src={config.assetUrl} alt="" width={size} height={size} aria-hidden />
			) : (
				<IconComponent size={iconSize} strokeWidth={2} className="text-white" />
			)}
		</span>
	)
}

export default memo(ToolIconBadge)
