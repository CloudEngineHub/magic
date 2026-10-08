import type { ComponentType } from "react"
import type { LucideProps } from "lucide-react"
import { Boxes, Bot, MessageCircle, Mic, Wrench } from "lucide-react"
import { useTranslation } from "react-i18next"

import MagicTooltip from "@/components/base/MagicTooltip"
import { MagiClaw } from "@/enhance/lucide-react"
import { cn } from "@/utils/cn"

interface ProjectTypeTagProps {
	projectMode?: string | null
	tooltipDisabled?: boolean
	className?: string
}

const PROJECT_TYPE_ICONS: Record<string, { Icon: ComponentType<LucideProps>; labelKey: string }> = {
	magiclaw: { Icon: MagiClaw, labelKey: "magicClaw" },
	"micro-app": { Icon: Boxes, labelKey: "microApp" },
	agent_creator: { Icon: Bot, labelKey: "agent" },
	custom_agent: { Icon: Bot, labelKey: "agent" },
	skill_creator: { Icon: Wrench, labelKey: "skill" },
	custom_skill: { Icon: Wrench, labelKey: "skill" },
	audio: { Icon: Mic, labelKey: "audio" },
	chat: { Icon: MessageCircle, labelKey: "chat" },
}

/** 最近项目将类型标记放在置顶和协作标记所在的位置，不发起额外请求。 */
export default function ProjectTypeTag({
	projectMode,
	tooltipDisabled = false,
	className,
}: ProjectTypeTagProps) {
	const { t } = useTranslation("super")
	const config = projectMode ? PROJECT_TYPE_ICONS[projectMode] : undefined
	if (!config) return null

	const label = t(`projectTypeTag.${config.labelKey}`)
	const Icon = config.Icon
	return (
		<MagicTooltip title={label} disabled={tooltipDisabled}>
			<span
				className={cn(
					"inline-flex size-4 shrink-0 items-center justify-center text-current",
					className,
				)}
				role="img"
				aria-label={label}
				data-testid="project-type-tag"
			>
				<Icon size={16} strokeWidth={1.8} aria-hidden="true" />
			</span>
		</MagicTooltip>
	)
}
