import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"
import PluginTips from "../components/PluginTips"
import { AgentCommonModal } from "@/components/Agent/AgentCommonModal"
import { cn } from "@/lib/utils"

const AgentSettingsLazy = lazy(() => import("@/components/Agent/MCP/AgentSettings"))
import CurrentSceneBadge from "../components/SelectedSkillBadge"
import { SCENE_INPUT_IDS, INPUT_CONTAINER_MIN_HEIGHT, SCENE_PANEL_MIN_HEIGHT } from "../constants"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import { observer } from "mobx-react-lite"
import { defaultMCPStore } from "@/components/Agent/MCP/store/mcp-store"
import { useSkillPanelScroll } from "../hooks/useSkillPanelScroll"
import { useSceneSelection } from "../hooks/useSceneSelection"
import LazyScenePanel from "../components/LazyScenePanel"
import SelfMediaComposerConfigPanel from "../components/SelfMediaComposerConfigPanel"
import { shouldShowSelfMediaComposerConfigPanel } from "../utils/selfMediaComposerConfig"
import { roleStore } from "@/pages/superMagic/stores"
import { projectStore, topicStore, workspaceStore } from "@/pages/superMagic/stores/core"
import type { SceneEditorContext } from "../components/editors/types"
import type { MessageEditorRef } from "@/pages/superMagic/components/MessageEditor/MessageEditor"
import { ScenePanelVariant } from "../components/LazyScenePanel/types"
import {
	buildTopicInputScopeKey,
	SceneStateProvider,
	SceneStateStore,
	sceneStateStore as defaultSceneStateStore,
} from "../stores"
import SuperMagicService from "../../../services"
import { createMessageEditorDraftKey } from "@/pages/superMagic/components/MessageEditor/utils/draftKey"
import { userStore } from "@/models/user"

interface EditorLayoutProps {
	mode?: TopicMode
	sceneStateStore?: SceneStateStore
	autoFocus?: boolean
	onAutoFocusHandled?: () => void
}

function EditorLayout({
	mode,
	sceneStateStore = defaultSceneStateStore,
	autoFocus = false,
	onAutoFocusHandled,
}: EditorLayoutProps) {
	const resolvedMode = mode ?? roleStore.currentRole
	const editorContainerRef = useRef<HTMLDivElement>(null)
	const editorRef = useRef<MessageEditorRef>(null)
	const [mcpModalOpen, setMcpModalOpen] = useState(false)

	const selectedTopic = topicStore.selectedTopic
	const selectedProject = projectStore.selectedProject
	const selectedWorkspace = workspaceStore.selectedWorkspace ?? workspaceStore.firstWorkspace

	const scenes = superMagicModeService.getModeConfigWithLegacy(
		resolvedMode,
		undefined,
		false,
		selectedTopic?.agent_code,
	)?.mode.playbooks
	const organizationCode = userStore.user.organizationCode
	const userId = userStore.user.userInfo?.user_id
	const editorContext = useMemo<SceneEditorContext>(
		() => ({
			draftKey: createMessageEditorDraftKey({
				selectedWorkspace,
				selectedProject,
				selectedTopic,
			}),
			selectedTopic,
			selectedProject,
			selectedWorkspace,
			setSelectedTopic: topicStore.setSelectedTopic,
			setSelectedProject: projectStore.setSelectedProject,
			topicMode: resolvedMode,
			setTopicMode: roleStore.setCurrentRole,
			recoverTopicMode: roleStore.applyResolvedRole,
			topicExamplesMode: resolvedMode,
			enableMessageSendByContent: true,
			autoFocus,
			onEditorFocus: onAutoFocusHandled,
			onSendSuccess: ({ currentProject, currentTopic }) => {
				if (!selectedWorkspace || !currentProject || !currentTopic) return

				SuperMagicService.route.navigateToTopic({
					workspaceId: selectedWorkspace.id,
					projectId: currentProject.id,
					topicId: currentTopic.id,
				})
			},
			editorRef,
			modules: {
				upload: {
					confirmDelete: false,
				},
			},
		}),
		[
			resolvedMode,
			selectedTopic,
			selectedProject,
			selectedWorkspace,
			autoFocus,
			onAutoFocusHandled,
		],
	)

	// Automatically scroll to scene panel when scene config loaded
	useSkillPanelScroll(editorContainerRef, sceneStateStore)

	// Defer MCP list load so first paint is not blocked; PluginTips still appears after init.
	useEffect(() => {
		const run = () => {
			defaultMCPStore.load().catch(console.error)
		}
		let scheduledId: number
		let usedIdleCallback = false
		if (typeof requestIdleCallback !== "undefined") {
			usedIdleCallback = true
			scheduledId = requestIdleCallback(run, { timeout: 2500 })
		} else {
			scheduledId = window.setTimeout(run, 1)
		}
		return () => {
			if (usedIdleCallback && typeof cancelIdleCallback !== "undefined") {
				cancelIdleCallback(scheduledId)
			} else {
				window.clearTimeout(scheduledId)
			}
		}
	}, [])

	useEffect(() => {
		sceneStateStore.resetState()
	}, [sceneStateStore, organizationCode, userId])

	useEffect(() => {
		sceneStateStore.setInputScopeKey(
			buildTopicInputScopeKey(
				String(resolvedMode),
				selectedTopic?.id ?? "",
				selectedTopic?.agent_code ?? "",
			),
		)
	}, [resolvedMode, selectedTopic?.id, selectedTopic?.agent_code, sceneStateStore])

	const { currentScene: selectedScene, shouldShowCurrentSceneBadge } = useSceneSelection({
		scenes,
		sceneStateStore,
	})
	const shouldShowSelfMediaConfig = shouldShowSelfMediaComposerConfigPanel({
		context: editorContext,
		hasSelectedScene: Boolean(selectedScene),
		hasAvailableScenes: Boolean(scenes?.length),
		variant: ScenePanelVariant.HomePage,
	})

	const shouldShowPluginTips =
		!selectedScene &&
		defaultMCPStore.initialized &&
		!defaultMCPStore.hasMCP &&
		!defaultMCPStore.hasEverAddedMcp

	return (
		<SceneStateProvider store={sceneStateStore} variant={ScenePanelVariant.HomePage}>
			<div className={cn("flex size-full flex-col items-center")}>
				{/* Main Input Container */}
				<div className="w-full max-w-4xl rounded-2xl border border-border bg-sidebar p-2">
					{/* skill editor input container with min height to prevent layout shift */}
					<div
						ref={editorContainerRef}
						id={SCENE_INPUT_IDS.INPUT_CONTAINER}
						style={{ minHeight: INPUT_CONTAINER_MIN_HEIGHT.HomePage }}
					></div>

					{/* Plugin Tips or Selected Skill Badge */}
					<div className="mt-2 [&:empty]:hidden">
						{shouldShowCurrentSceneBadge && selectedScene ? (
							<CurrentSceneBadge
								scene={selectedScene}
								onClose={() => {
									sceneStateStore.setCurrentScene(null)
								}}
							/>
						) : shouldShowPluginTips ? (
							<PluginTips onConnectClick={() => setMcpModalOpen(true)} />
						) : null}
					</div>
				</div>

				{/* skill config container with smooth transition */}
				<div
					data-testid="home-scene-config-container"
					className={cn(
						"w-full transition-all duration-200 ease-in-out",
						resolvedMode !== TopicMode.PPT && "max-w-4xl",
						shouldShowSelfMediaConfig ? "px-2 pb-8 pt-0" : "p-2 pb-[40px]",
					)}
					style={{
						minHeight: selectedScene ? SCENE_PANEL_MIN_HEIGHT.HomePage : undefined,
					}}
				>
					<LazyScenePanel scenes={scenes} editorContext={editorContext} />
					{shouldShowSelfMediaConfig ? <SelfMediaComposerConfigPanel /> : null}
				</div>
			</div>
			<AgentCommonModal
				open={mcpModalOpen}
				onOpenChange={setMcpModalOpen}
				width={900}
				footer={null}
				closable={false}
			>
				{mcpModalOpen ? (
					<Suspense fallback={null}>
						<AgentSettingsLazy onClose={() => setMcpModalOpen(false)} />
					</Suspense>
				) : null}
			</AgentCommonModal>
		</SceneStateProvider>
	)
}

export default observer(EditorLayout)
