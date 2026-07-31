import { GuideTourElementId } from "../LazyGuideTour"
import { ScenePanelVariant } from "../MainInputContainer/components/LazyScenePanel/types"
import CurrentSceneBadge from "../MainInputContainer/components/SelectedSkillBadge"
import { SCENE_INPUT_IDS, INPUT_CONTAINER_MIN_HEIGHT } from "../MainInputContainer/constants"
import { SceneStateProvider, SceneStateStore } from "../MainInputContainer/stores"
import { ModeToggle } from "../TopicMode"
import LazyScenePanel from "../MainInputContainer/components/LazyScenePanel"
import SelfMediaComposerConfigPanel from "../MainInputContainer/components/SelfMediaComposerConfigPanel"
import { cn } from "@/lib/utils"
import {
	SceneEditorContext,
	SceneEditorNodes,
} from "../MainInputContainer/components/editors/types"
import { MessageEditorSize } from "../MessageEditor/types"
import { observer } from "mobx-react-lite"
import { getEditorSpanClass } from "../MessageEditor/constants/editor_span_map"
import type { SceneItem } from "../../types/skill"
import { shouldShowSelfMediaComposerConfigPanel } from "../MainInputContainer/utils/selfMediaComposerConfig"
import { useInvalidTopicModeFallback } from "../MessageEditor/hooks/useInvalidTopicModeFallback"

interface DesktopInputContainerProps {
	sceneStateStore: SceneStateStore
	scenes?: SceneItem[]
	currentScene: SceneItem | null
	shouldShowCurrentSceneBadge: boolean
	shouldShowSceneControls: boolean
	containerRef?: React.RefObject<HTMLDivElement>
	className?: string
	classNames?: {
		container?: string
		editorWrapper?: string
		editor?: string
	}
	editorSize: MessageEditorSize
	isFocused: boolean
	editorContext: SceneEditorContext
	editorNodes?: SceneEditorNodes
}

function DesktopInputContainer({
	sceneStateStore,
	scenes,
	currentScene,
	shouldShowCurrentSceneBadge,
	shouldShowSceneControls,
	containerRef,
	className,
	classNames,
	editorSize,
	isFocused,
	editorContext,
	editorNodes,
}: DesktopInputContainerProps) {
	const { isActive, InvalidModeFallback, onCreateTopic } =
		useInvalidTopicModeFallback(editorContext)
	const shouldShowModeToggle = editorContext.showModeToggle ?? true
	const shouldShowHeaderControls = shouldShowModeToggle || shouldShowSceneControls
	const shouldShowSelfMediaConfig = shouldShowSelfMediaComposerConfigPanel({
		context: editorContext,
		hasSelectedScene: Boolean(currentScene),
		hasAvailableScenes: Boolean(scenes?.length),
		variant: ScenePanelVariant.TopicPage,
	})

	const containerClassName = cn(
		"relative flex w-full flex-none flex-col items-start gap-2 self-stretch",
		"rounded-2xl border border-border bg-sidebar p-2",
		getEditorSpanClass(editorSize),
		className,
		classNames?.container,
	)

	if (isActive && InvalidModeFallback) {
		return (
			<SceneStateProvider store={sceneStateStore} variant={ScenePanelVariant.TopicPage}>
				<div
					ref={containerRef}
					id={GuideTourElementId.MessagePanel}
					className={cn(containerClassName, "bg-muted")}
				>
					<div className="flex w-full flex-col gap-2 [&:empty]:hidden">
						{editorNodes?.taskDataNode}
						{editorNodes?.messageQueueNode}
					</div>
					<div className={cn("w-full", classNames?.editorWrapper)}>
						<div
							className={cn(
								"z-[2] flex flex-col gap-2 overflow-hidden border border-transparent",
								classNames?.editor,
							)}
							data-testid="message-panel-input-group"
						>
							<div
								className="flex h-full items-center justify-center [&>div]:w-full"
								style={{
									minHeight: INPUT_CONTAINER_MIN_HEIGHT.InvalidModeFallback,
								}}
							>
								<InvalidModeFallback onCreateTopic={onCreateTopic} />
							</div>
						</div>
					</div>
				</div>
			</SceneStateProvider>
		)
	}

	return (
		<SceneStateProvider store={sceneStateStore} variant={ScenePanelVariant.TopicPage}>
			<div
				ref={containerRef}
				id={GuideTourElementId.MessagePanel}
				className={containerClassName}
			>
				<div className="flex w-full flex-col gap-2 [&:empty]:hidden">
					{editorNodes?.taskDataNode}
					{editorNodes?.messageQueueNode}
				</div>
				{shouldShowHeaderControls ? (
					<div className="flex w-full items-center gap-4 overflow-hidden">
						{shouldShowModeToggle ? (
							<ModeToggle
								size={editorSize}
								topicMode={editorContext.topicMode}
								agentCode={
									editorContext.agentCode ??
									editorContext.selectedTopic?.agent_code
								}
								allowChangeMode={
									editorContext.allowChangeMode ??
									((editorContext.messagesLength ?? 0) > 0 ? false : true)
								}
								useChatTerminology={editorContext.useChatTerminology}
								onModeChange={editorContext.setTopicMode}
							/>
						) : null}
						{shouldShowModeToggle && shouldShowSceneControls ? (
							<div className="h-[60%] w-[1px] bg-border"></div>
						) : null}
						{shouldShowSceneControls ? (
							<>
								{shouldShowCurrentSceneBadge && currentScene ? (
									<CurrentSceneBadge
										scene={currentScene}
										variant="outlineButton"
										onClose={() => sceneStateStore.setCurrentScene(null)}
									/>
								) : (
									<div
										id={SCENE_INPUT_IDS.SCENES_SWITCHER}
										className="min-w-0 flex-1"
									></div>
								)}
							</>
						) : null}
					</div>
				) : null}
				<div className={cn("w-full", classNames?.editorWrapper)}>
					<div
						className={cn(
							"z-[2] flex flex-col gap-2 overflow-hidden border border-transparent",
							classNames?.editor,
							isFocused && "border-blue-500",
						)}
						data-testid="message-panel-input-group"
					>
						<div
							className={cn("flex flex-col", {
								"gap-1.5": editorSize !== "default",
							})}
						>
							<div
								id={SCENE_INPUT_IDS.INPUT_CONTAINER}
								className="flex h-full items-center justify-center [&>div]:w-full"
								style={{ minHeight: INPUT_CONTAINER_MIN_HEIGHT.TopicPage }}
							></div>
						</div>
						<LazyScenePanel
							scenes={scenes}
							editorContext={editorContext}
							editorNodes={editorNodes}
						/>
						{shouldShowSelfMediaConfig ? <SelfMediaComposerConfigPanel /> : null}
					</div>
				</div>
			</div>
		</SceneStateProvider>
	)
}

export default observer(DesktopInputContainer)
