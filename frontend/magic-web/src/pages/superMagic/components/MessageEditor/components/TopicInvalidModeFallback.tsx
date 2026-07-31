import { useTranslation } from "react-i18next"
import { IconMessageCirclePlus } from "@tabler/icons-react"
import { Button } from "@/components/shadcn-ui/button"
import { useFileActionVisibility } from "@/pages/superMagic/providers/file-action-visibility-provider"
import { EDITOR_ICON_SIZE_MAP } from "../constants/constant"

export interface InvalidModeFallbackProps {
	onCreateTopic?: () => void
}

export function TopicInvalidModeFallback({ onCreateTopic }: InvalidModeFallbackProps) {
	const { t } = useTranslation("super")
	const { hideCreateNewTopic } = useFileActionVisibility()
	const shouldHideTopicEntry = hideCreateNewTopic

	return (
		<div className="mx-4 flex h-full min-h-[122px] flex-col items-center justify-center gap-2.5">
			<div className="text-xs leading-4 text-muted-foreground">
				{t("messageEditor.modeNotAvailableMessage")}
			</div>
			{!shouldHideTopicEntry ? (
				<Button variant="outline" size="sm" onClick={() => onCreateTopic?.()}>
					<IconMessageCirclePlus size={EDITOR_ICON_SIZE_MAP.default} />
					{t("messageEditor.newTopicButton")}
				</Button>
			) : null}
		</div>
	)
}
