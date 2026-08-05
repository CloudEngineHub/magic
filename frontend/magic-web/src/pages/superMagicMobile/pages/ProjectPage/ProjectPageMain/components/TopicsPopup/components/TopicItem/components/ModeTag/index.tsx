import { memo, useMemo } from "react"
import { computed } from "mobx"
import { useTranslation } from "react-i18next"
import { getFallbackTopicModeIdentifier } from "@/services/superMagic/DefaultAgentSelectionService"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import IconComponent from "@/pages/superMagic/components/IconViewComponent"
import MagicIcon from "@/components/base/MagicIcon"
import { IconMessageCircleQuestion } from "@tabler/icons-react"
import type { ModeTagProps } from "./types"

function ModeTag({ mode, agentCode }: ModeTagProps) {
	const { t } = useTranslation("super")
	const resolvedMode = mode ?? getFallbackTopicModeIdentifier()

	const config = useMemo(() => {
		return computed(() => {
			return superMagicModeService.getModeConfigWithLegacy(resolvedMode, t, false, agentCode)
		}).get()
	}, [resolvedMode, t, agentCode])

	if (!config) {
		return (
			<div className="flex size-5 shrink-0 items-center justify-center rounded">
				<MagicIcon component={IconMessageCircleQuestion} size={16} />
			</div>
		)
	}

	return (
		<div className="flex size-5 shrink-0 items-center justify-center rounded">
			<IconComponent
				iconType={config.mode.icon_type}
				iconUrl={config.mode.icon_url}
				selectedIcon={config.mode.icon}
				size={16}
				iconColor={config.mode.color}
				showBorder={true}
			/>
		</div>
	)
}

export default memo(ModeTag)
