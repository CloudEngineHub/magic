import usePortalTarget from "@/hooks/usePortalTarget"
import { SCENE_INPUT_IDS, SCENE_ANIMATION_CONFIG } from "../../constants"
import { createPortal } from "react-dom"
import SceneSwitcher from "../../components/SceneSwitcher"
import { AnimatePresence, motion } from "framer-motion"
import { SceneItem } from "@/pages/superMagic/types/skill"
import DefaultMessageEditorContainer from "../../components/editors/DefaultMessageEditorContainer"
import { ScenePanelComponentBaseProps } from "../../types"
import { ScenePanelVariant } from "../../components/LazyScenePanel/types"
import { useOptionalScenePanelVariant, useSceneStateStore } from "../../stores"
import VideoProductionConfigPanel from "../../components/VideoProductionConfigPanel"
import { useConversationInputLayout } from "../../../ConversationInputResize/context"
import { cn } from "@/utils/cn"

interface GeneralInputContainerProps extends ScenePanelComponentBaseProps {
	scenes: SceneItem[] | undefined
}

function GeneralInputContainer({ scenes, editorContext, editorNodes }: GeneralInputContainerProps) {
	const sceneStateStore = useSceneStateStore()
	const variant = useOptionalScenePanelVariant()
	const inputLayout = useConversationInputLayout()
	// Propagate the resized conversation height through the general scene wrappers.
	const shouldFillHeight = Boolean(inputLayout?.fillHeight)
	const editorPortalTarget = usePortalTarget({
		portalId: SCENE_INPUT_IDS.INPUT_CONTAINER,
	})

	const scenesSwitcherPortalTarget = usePortalTarget({
		portalId: SCENE_INPUT_IDS.SCENES_SWITCHER,
	})

	const renderScenesSwitcher = () => {
		if (variant && [ScenePanelVariant.TopicPage, ScenePanelVariant.Mobile].includes(variant)) {
			return (
				scenesSwitcherPortalTarget &&
				createPortal(
					<SceneSwitcher
						scenes={scenes}
						onSceneClick={sceneStateStore.setCurrentScene}
					/>,
					scenesSwitcherPortalTarget,
				)
			)
		}

		return (
			<div className="flex min-h-9 w-full items-center justify-center">
				<SceneSwitcher scenes={scenes} onSceneClick={sceneStateStore.setCurrentScene} />
			</div>
		)
	}

	return (
		<>
			{editorPortalTarget &&
				createPortal(
					<AnimatePresence mode="wait">
						<motion.div
							key="general-editor"
							className={cn(shouldFillHeight && "h-full min-h-0")}
							initial={SCENE_ANIMATION_CONFIG.initial}
							animate={SCENE_ANIMATION_CONFIG.animate}
							exit={SCENE_ANIMATION_CONFIG.exit}
							transition={SCENE_ANIMATION_CONFIG.transition}
						>
							<div
								className={cn(
									"flex flex-col gap-2",
									shouldFillHeight && "h-full min-h-0",
								)}
							>
								<div
									className={cn(
										shouldFillHeight && "min-h-0 flex-1 [&>div]:h-full",
									)}
								>
									<DefaultMessageEditorContainer
										editorContext={editorContext}
										editorNodes={editorNodes}
									/>
								</div>
								<VideoProductionConfigPanel
									topicMode={editorContext?.topicMode}
									agentCode={editorContext?.agentCode}
									selectedTopic={editorContext?.selectedTopic}
									messagesLength={editorContext?.messagesLength}
								/>
							</div>
						</motion.div>
					</AnimatePresence>,
					editorPortalTarget,
				)}
			{renderScenesSwitcher()}
		</>
	)
}

export default GeneralInputContainer
