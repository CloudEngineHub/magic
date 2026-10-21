import { useEffect, useMemo, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { SuperMagicApi } from "@/apis"
import magicToast from "@/components/base/MagicToaster/utils"
import EditorLayout from "@/pages/superMagic/components/MainInputContainer/scenes/EditorLayout"
import type { SceneEditorContext } from "@/pages/superMagic/components/MainInputContainer/components/editors/types"
import { createSceneStateStore } from "@/pages/superMagic/components/MainInputContainer/stores"
import type { MentionListItem } from "@/components/business/MentionPanel/tiptap-plugin/types"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { CreatedProject, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import { projectStore, topicStore } from "@/pages/superMagic/stores/core"
import SuperMagicService from "@/pages/superMagic/services"
import {
	buildAiCanvasMention,
	createAiCanvasDocument,
} from "@/pages/superMagic/pages/TopicPage/utils/aiCanvas"

interface AiCanvasCreatePromptProps {
	/** The ai-canvas workspace; sending is disabled until it is loaded. */
	workspace: Workspace | null
}

const noopTopicModeChange = () => undefined

/**
 * "Describe and create" composer of the AI canvas home.
 *
 * Reuses the task home's EditorLayout locked to the design mode, so the design employee's
 * playbook chips and their scene panels (guide, fields, inspiration) appear exactly as on the
 * task home. Only creation is overridden:
 * create the ai-canvas project → create its default canvas → bind that canvas as an implicit
 * mention → send with the design mode → open the project. If the canvas cannot be created the
 * send is aborted, so the agent never starts without a canvas path.
 */
function AiCanvasCreatePrompt({ workspace }: AiCanvasCreatePromptProps) {
	const { t } = useTranslation("aiCanvas")
	// Isolated scene state: the home composer must not share playbook state with other pages.
	const [sceneStateStore] = useState(() => createSceneStateStore())
	// Canvas mention per created project, consumed by getImplicitMentionItems in the same send.
	const canvasMentionsRef = useRef(new Map<string, MentionListItem>())

	useEffect(() => {
		// The home composer always creates a new project; never reuse a previously opened one.
		projectStore.setSelectedProject(null)
		topicStore.setSelectedTopic(null)
	}, [])

	const editorContext = useMemo<Partial<SceneEditorContext>>(
		() => ({
			selectedWorkspace: workspace,
			selectedProject: null,
			selectedTopic: null,
			// The AI canvas always talks to the design employee: mode switching is disabled.
			setTopicMode: noopTopicModeChange,
			recoverTopicMode: noopTopicModeChange,
			showModeToggle: false,
			modelTopicMode: TopicMode.Design,
			placeholder: t("home.placeholder"),
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
		<div className="w-full" data-testid="ai-canvas-create-prompt">
			<EditorLayout
				mode={TopicMode.Design}
				editorContext={editorContext}
				sceneStateStore={sceneStateStore}
			/>
		</div>
	)
}

export default observer(AiCanvasCreatePrompt)
