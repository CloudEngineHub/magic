import type { ComponentType } from "react"
import type { LucideProps } from "lucide-react"
import { Boxes, Bot, MessageCircle, Mic, Palette, Wrench } from "lucide-react"
import { useTranslation } from "react-i18next"

import MagicTooltip from "@/components/base/MagicTooltip"
import { MagiClaw } from "@/enhance/lucide-react"
import { cn } from "@/utils/cn"

/**
 * Recent project lists (web sidebar and H5 shell) show the type, pinned and collaboration marks
 * side by side at one 14px size. The pinned and collaboration tags force 12px icons (and keep an
 * 18px chip elsewhere), so this class drops the chip and overrides their inner svg.
 */
export const RECENT_PROJECT_MARK_CLASS_NAME =
	"h-3.5 w-3.5 border-0 bg-transparent p-0 [&_svg]:!h-[14px] [&_svg]:!w-[14px]"

/**
 * Stroke width of line icons on a 24-unit grid (lucide, tabler). Strokes scale with the icon, so
 * every mark keeps the same rendered line weight only when this is set per grid size.
 */
const LINE_STROKE_WIDTH = 1.8

/**
 * For the collaboration and shortcut marks (24-unit line icons with their own default stroke 2):
 * the same line weight as the type marks. Not for the pinned mark, which is a filled shape.
 */
// Literal class (Tailwind only generates classes it finds verbatim); 1.8 = LINE_STROKE_WIDTH.
export const RECENT_PROJECT_LINE_MARK_CLASS_NAME = `${RECENT_PROJECT_MARK_CLASS_NAME} [&_svg]:[stroke-width:1.8]`

/** Icon size of the type mark in recent project lists, matching RECENT_PROJECT_MARK_CLASS_NAME. */
export const RECENT_PROJECT_MARK_SIZE = 14

interface ProjectTypeTagProps {
	projectMode?: string | null
	/** Icon size in px; 16 by default. */
	size?: number
	/**
	 * Recent project lists: scale the stroke number by each icon's grid so every mark renders the
	 * same line weight. Elsewhere icons keep the plain 1.8 stroke.
	 */
	uniformStroke?: boolean
	tooltipDisabled?: boolean
	className?: string
}

type ProjectTypeTagLabelKey =
	| "projectTypeTag.aiCanvas"
	| "projectTypeTag.magicClaw"
	| "projectTypeTag.microApp"
	| "projectTypeTag.agent"
	| "projectTypeTag.skill"
	| "projectTypeTag.audio"
	| "projectTypeTag.chat"

const PROJECT_TYPE_ICONS: Record<
	string,
	{
		Icon: ComponentType<LucideProps>
		labelKey: ProjectTypeTagLabelKey
		/** Icon grid size when it is not lucide's 24 units; used to keep the line weight equal. */
		gridSize?: number
	}
> = {
	// Drawn on a 16-unit grid: the same stroke number would render about 1.5x heavier.
	magiclaw: { Icon: MagiClaw, labelKey: "projectTypeTag.magicClaw", gridSize: 16 },
	"micro-app": { Icon: Boxes, labelKey: "projectTypeTag.microApp" },
	agent_creator: { Icon: Bot, labelKey: "projectTypeTag.agent" },
	custom_agent: { Icon: Bot, labelKey: "projectTypeTag.agent" },
	skill_creator: { Icon: Wrench, labelKey: "projectTypeTag.skill" },
	custom_skill: { Icon: Wrench, labelKey: "projectTypeTag.skill" },
	audio: { Icon: Mic, labelKey: "projectTypeTag.audio" },
	chat: { Icon: MessageCircle, labelKey: "projectTypeTag.chat" },
	// Same icon as the sidebar's AI canvas entry.
	"ai-canvas": { Icon: Palette, labelKey: "projectTypeTag.aiCanvas" },
}

/** 最近项目将类型标记放在置顶和协作标记所在的位置，不发起额外请求。 */
export default function ProjectTypeTag({
	projectMode,
	tooltipDisabled = false,
	size = 16,
	uniformStroke = false,
	className,
}: ProjectTypeTagProps) {
	const { t } = useTranslation("super")
	const config = projectMode ? PROJECT_TYPE_ICONS[projectMode] : undefined
	if (!config) return null

	const label = t(config.labelKey)
	const Icon = config.Icon
	return (
		<MagicTooltip title={label} disabled={tooltipDisabled}>
			<span
				className={cn(
					"inline-flex shrink-0 items-center justify-center text-current",
					className,
				)}
				style={{ width: size, height: size }}
				role="img"
				aria-label={label}
				data-testid="project-type-tag"
			>
				<Icon
					size={size}
					strokeWidth={
						uniformStroke
							? (LINE_STROKE_WIDTH * (config.gridSize ?? 24)) / 24
							: LINE_STROKE_WIDTH
					}
					aria-hidden="true"
				/>
			</span>
		</MagicTooltip>
	)
}
