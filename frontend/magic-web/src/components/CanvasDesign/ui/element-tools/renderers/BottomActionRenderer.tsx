import { LoaderCircle, Pencil, RotateCcw, SquarePen, ZapIcon } from "lucide-react"
import type { ElementToolIcon, ElementToolResolution } from "../../../runtime/element-tools"
import type { ElementBottomToolbarItem } from "../../canvas-editor/element-bottom-toolbar/ElementBottomToolbar"

const ACTION_ICONS: Record<ElementToolIcon, typeof Pencil> = {
	pencil: Pencil,
	"square-pen": SquarePen,
	"rotate-ccw": RotateCcw,
	loader: LoaderCircle,
	"chevron-left": Pencil,
	"chevron-right": Pencil,
	crown: Pencil,
	trash: Pencil,
}

interface BottomActionRendererProps {
	tools: readonly ElementToolResolution[]
	t: (key: string, fallback?: string | { defaultValue?: string }) => string
}

export function resolveToolLabel(tool: ElementToolResolution, t: BottomActionRendererProps["t"]) {
	return tool.presentation.labelKey
		? t(tool.presentation.labelKey, tool.presentation.labelFallback)
		: (tool.presentation.labelFallback ?? tool.id)
}

export default function BottomActionRenderer({ tools, t }: BottomActionRendererProps) {
	return tools.map<ElementBottomToolbarItem>((tool) => {
		const iconType = tool.loading ? "loader" : tool.presentation.icon
		const Icon = iconType ? ACTION_ICONS[iconType] : undefined
		const estimate = tool.data?.videoGenerationEstimate
		const label = resolveToolLabel(tool, t)
		return {
			id: tool.id,
			group: tool.presentation.group,
			icon: Icon ? (
				<Icon size={14} className={tool.loading ? "animate-spin" : undefined} />
			) : undefined,
			label: estimate ? (
				<span data-video-generation-estimate>
					<span>{label}</span>
					<span>{estimate.resolution}</span>
					{estimate.points != null ? (
						<span data-video-generation-estimate-points>
							<ZapIcon size={16} fill="currentColor" aria-hidden />
							<span>{estimate.points}</span>
						</span>
					) : null}
				</span>
			) : (
				label
			),
			shortcut: tool.presentation.shortcut,
			disabled: tool.visibility === "disabled" || Boolean(tool.loading),
			loading: tool.loading,
			onClick: () => void tool.execute?.(),
		}
	})
}
