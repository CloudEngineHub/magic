import { observer } from "mobx-react-lite"
import { useEffect, useMemo, useRef, useState } from "react"
import DefaultMessageEditorContainer from "@/pages/superMagic/components/MainInputContainer/components/editors/DefaultMessageEditorContainer"
import type { SceneEditorContext } from "@/pages/superMagic/components/MainInputContainer/components/editors/types"
import { ScenePanelVariant } from "@/pages/superMagic/components/MainInputContainer/components/LazyScenePanel/types"
import {
	SceneStateProvider,
	buildTopicInputScopeKey,
	createSceneStateStore,
} from "@/pages/superMagic/components/MainInputContainer/stores"
import { createMessageEditorDraftKey } from "@/pages/superMagic/components/MessageEditor/utils/draftKey"
import type { MessageEditorRef } from "@/pages/superMagic/components/MessageEditor/MessageEditor"
import { ToolbarButton } from "@/pages/superMagic/components/MessageEditor/types"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { buildSlidesTemplatePresetContent } from "@/pages/superMagic/components/MainInputContainer/scenes/Slides/slidesTemplateState"
import { roleStore } from "@/pages/superMagic/stores"
import { projectStore, topicStore, workspaceStore } from "@/pages/superMagic/stores/core"
import SuperMagicService from "@/pages/superMagic/services"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import SlidesTemplateSelectionPreview from "./SlidesTemplateSelectionPreview"

interface SlidesTemplatePromptDockProps {
	onClearSelectedTemplate?: () => void
	onFindSimilarColors?: (template: OptionItem) => void
	onPreviewSelectedTemplate?: () => void
	selectedTemplate?: OptionItem | null
}

const SLIDES_TEMPLATE_EDITOR_CONTAINER_CLASS_NAME = [
	"!rounded-xl !border !border-white/[0.12] !bg-zinc-950/[0.42] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_32px_rgba(0,0,0,0.14)] backdrop-blur-3xl backdrop-saturate-50 dark:!bg-zinc-950/[0.42]",
	"[&_[data-testid=super-message-editor-header]_button]:!size-8",
	"[&_[data-testid=super-message-editor-header]_button]:!rounded-lg",
	"[&_[data-testid=super-message-editor-header]_button]:!border",
	"[&_[data-testid=super-message-editor-header]_button]:!border-white/[0.08]",
	"[&_[data-testid=super-message-editor-header]_button]:!bg-white/[0.07]",
	"[&_[data-testid=super-message-editor-header]_button]:!p-0",
	"[&_[data-testid=super-message-editor-header]_button]:!text-white/[0.88]",
	"[&_[data-testid=super-message-editor-header]_button]:backdrop-blur-md",
	"[&_[data-testid=super-message-editor-header]_button:hover]:!bg-white/[0.13]",
	"[&_[data-testid=super-message-editor-toolbar]_button]:!rounded-lg",
	"[&_[data-testid=super-message-editor-toolbar]_button]:!border",
	"[&_[data-testid=super-message-editor-toolbar]_button]:!border-white/[0.08]",
	"[&_[data-testid=super-message-editor-toolbar]_button]:!bg-white/[0.07]",
	"[&_[data-testid=super-message-editor-toolbar]_button]:!text-white/[0.88]",
	"[&_[data-testid=super-message-editor-toolbar]_button]:backdrop-blur-md",
	"[&_[data-testid=super-message-editor-toolbar]_button:hover]:!bg-white/[0.13]",
	"[&_[data-testid=super-message-editor-toolbar-right]_button]:!size-8",
	"[&_[data-testid=super-message-editor-toolbar-right]_button]:!p-0",
	"[&_[data-testid=internet-search-button][aria-pressed=true]]:!border-white/[0.32]",
	"[&_[data-testid=internet-search-button][aria-pressed=true]]:!bg-white/[0.82]",
	"[&_[data-testid=internet-search-button][aria-pressed=true]]:!text-zinc-900",
	"[&_[data-testid=super-message-editor-model-switch]]:!h-8",
	"[&_[data-testid=super-message-editor-model-switch]]:!px-3",
	"[&_[data-testid=super-message-editor-toolbar-divider]]:!mx-1",
	"[&_[data-testid=super-message-editor-toolbar-divider]]:!bg-white/[0.14]",
].join(" ")

function SlidesTemplatePromptDock({
	onClearSelectedTemplate,
	onFindSimilarColors,
	onPreviewSelectedTemplate,
	selectedTemplate,
}: SlidesTemplatePromptDockProps) {
	const editorRef = useRef<MessageEditorRef>(null)
	const [sceneStateStore] = useState(() => createSceneStateStore())
	const selectedTopic = topicStore.selectedTopic
	const selectedProject = projectStore.selectedProject
	const selectedWorkspace = workspaceStore.selectedWorkspace ?? workspaceStore.firstWorkspace

	useEffect(() => {
		sceneStateStore.setInputScopeKey(
			buildTopicInputScopeKey(TopicMode.PPT, "", "slides-templates"),
		)

		return () => {
			sceneStateStore.setPresetSuffixContent(undefined)
			sceneStateStore.setInputScopeKey("")
		}
	}, [sceneStateStore])

	useEffect(() => {
		sceneStateStore.setPresetSuffixContent(buildSlidesTemplatePresetContent(selectedTemplate))
	}, [sceneStateStore, selectedTemplate])

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
			setSelectedWorkspace: workspaceStore.setSelectedWorkspace,
			topicMode: TopicMode.PPT,
			setTopicMode: roleStore.setCurrentRole,
			topicExamplesMode: TopicMode.PPT,
			enableMessageSendByContent: true,
			editorRef,
			skipInitialDraftRestore: true,
			containerClassName: SLIDES_TEMPLATE_EDITOR_CONTAINER_CLASS_NAME,
			className:
				"min-h-[76px] text-white/[0.92] [&_.ProseMirror_.is-editor-empty:first-child::before]:!text-white/[0.52]",
			layoutConfig: {
				topBarLeft: [ToolbarButton.DRAFT_BOX, ToolbarButton.AT],
				topBarRight: [ToolbarButton.TOKEN_USAGE],
				bottomLeft: [ToolbarButton.MODEL_SWITCH],
				bottomRight: [
					ToolbarButton.INTERNET_SEARCH,
					ToolbarButton.MCP,
					ToolbarButton.UPLOAD,
					ToolbarButton.DIVIDER,
					ToolbarButton.VOICE_INPUT,
					ToolbarButton.SEND_BUTTON,
				],
			},
			modules: {
				upload: {
					confirmDelete: false,
				},
			},
			onSendSuccess: ({ currentProject, currentTopic }) => {
				if (!selectedWorkspace || !currentProject || !currentTopic) return

				SuperMagicService.route.navigateToTopic({
					workspaceId: selectedWorkspace.id,
					projectId: currentProject.id,
					topicId: currentTopic.id,
				})
			},
		}),
		[selectedProject, selectedTopic, selectedWorkspace],
	)

	return (
		<SceneStateProvider store={sceneStateStore} variant={ScenePanelVariant.HomePage}>
			<div className="dark flex flex-col gap-2" data-testid="slides-template-prompt-dock">
				{selectedTemplate ? (
					<SlidesTemplateSelectionPreview
						template={selectedTemplate}
						onClear={onClearSelectedTemplate}
						onFindSimilarColors={onFindSimilarColors}
						onPreview={onPreviewSelectedTemplate}
					/>
				) : null}
				<DefaultMessageEditorContainer editorContext={editorContext} />
			</div>
		</SceneStateProvider>
	)
}

export default observer(SlidesTemplatePromptDock)
