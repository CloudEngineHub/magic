import { useEffect, useMemo, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { SuperMagicApi } from "@/apis"
import magicToast from "@/components/base/MagicToaster/utils"
import DefaultMessageEditorContainer from "@/pages/superMagic/components/MainInputContainer/components/editors/DefaultMessageEditorContainer"
import type { SceneEditorContext } from "@/pages/superMagic/components/MainInputContainer/components/editors/types"
import { ScenePanelVariant } from "@/pages/superMagic/components/MainInputContainer/components/LazyScenePanel/types"
import {
	SceneStateProvider,
	buildTopicInputScopeKey,
	createSceneStateStore,
} from "@/pages/superMagic/components/MainInputContainer/stores"
import { createMessageEditorDraftKey } from "@/pages/superMagic/components/MessageEditor/utils/draftKey"
import { ToolbarButton } from "@/pages/superMagic/components/MessageEditor/types"
import type { MentionListItem } from "@/components/business/MentionPanel/tiptap-plugin/types"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { CreatedProject, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import { projectStore, topicStore, workspaceStore } from "@/pages/superMagic/stores/core"
import SuperMagicService from "@/pages/superMagic/services"
import {
	buildAiCanvasMention,
	createAiCanvasDocument,
} from "@/pages/superMagic/pages/TopicPage/utils/aiCanvas"

interface AiCanvasCreatePromptProps {
	/** The ai-canvas workspace; sending is disabled until it is loaded. */
	workspace: Workspace | null
}

/**
 * "Describe and create" composer of the AI canvas home.
 *
 * Send order: create the ai-canvas project → create its default canvas → bind that canvas as
 * an implicit mention → send with the design mode → open the project. If the canvas cannot be
 * created the send is aborted, so the agent never starts without a canvas path.
 */
function AiCanvasCreatePrompt({ workspace }: AiCanvasCreatePromptProps) {
	const { t } = useTranslation("aiCanvas")
	// Isolated scene state: the home composer must not share playbook state with project pages.
	const [sceneStateStore] = useState(() => createSceneStateStore())
	// Canvas mention per created project, consumed by getImplicitMentionItems in the same send.
	const canvasMentionsRef = useRef(new Map<string, MentionListItem>())

	useEffect(() => {
		sceneStateStore.setInputScopeKey(
			buildTopicInputScopeKey(TopicMode.Design, "", "ai-canvas-create"),
		)
		return () => sceneStateStore.setInputScopeKey("")
	}, [sceneStateStore])

	useEffect(() => {
		// The home composer always creates a new project; never reuse a previously opened one.
		projectStore.setSelectedProject(null)
		topicStore.setSelectedTopic(null)
	}, [])

	const editorContext = useMemo<SceneEditorContext>(
		() => ({
			draftKey: createMessageEditorDraftKey({
				selectedWorkspace: workspace,
				selectedProject: null,
				selectedTopic: null,
			}),
			selectedWorkspace: workspace,
			selectedProject: null,
			selectedTopic: null,
			setSelectedWorkspace: workspaceStore.setSelectedWorkspace,
			setSelectedProject: projectStore.setSelectedProject,
			setSelectedTopic: topicStore.setSelectedTopic,
			refreshProjectAfterTopicRename: true,
			topicMode: TopicMode.Design,
			modelTopicMode: TopicMode.Design,
			placeholder: t("home.placeholder"),
			enableMessageSendByContent: true,
			skipInitialDraftRestore: true,
			size: "default",
			className: "min-h-[92px]",
			showModeToggle: false,
			layoutConfig: {
				topBarLeft: [ToolbarButton.AT],
				bottomLeft: [ToolbarButton.MODEL_SWITCH],
				bottomRight: [
					ToolbarButton.UPLOAD,
					ToolbarButton.DIVIDER,
					ToolbarButton.VOICE_INPUT,
					ToolbarButton.SEND_BUTTON,
				],
			},
			modules: {
				upload: { confirmDelete: false },
			},
			createProject: async ({ workdir }): Promise<CreatedProject | null> => {
				if (!workspace?.id) return null
				try {
					const created = await SuperMagicApi.createAiCanvasProject({
						workspace_id: String(workspace.id),
						workdir,
					})
					const canvas = await createAiCanvasDocument(String(created.project.id))
					canvasMentionsRef.current.set(
						String(created.project.id),
						buildAiCanvasMention({
							...canvas.folder,
							display_config: { type: "design" },
						}),
					)
					return { project: created.project, topic: created.topic }
				} catch (error) {
					magicToast.error(t("home.createFailed"))
					return null
				}
			},
			getImplicitMentionItems: (project) => {
				const mention = canvasMentionsRef.current.get(String(project.id))
				return mention ? [mention] : []
			},
			onSendSuccess: ({ currentProject }) => {
				if (!currentProject) return
				canvasMentionsRef.current.delete(String(currentProject.id))
				// ai-canvas projects open in the normal project route, which renders the canvas layout.
				void SuperMagicService.switchProjectInDesktop(currentProject)
			},
		}),
		[t, workspace],
	)

	return (
		<SceneStateProvider store={sceneStateStore} variant={ScenePanelVariant.HomePage}>
			<div className="w-full" data-testid="ai-canvas-create-prompt">
				<DefaultMessageEditorContainer editorContext={editorContext} />
			</div>
		</SceneStateProvider>
	)
}

export default observer(AiCanvasCreatePrompt)
