import { useEffect, useMemo, useState } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
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
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { Workspace } from "@/pages/superMagic/pages/Workspace/types"
import { projectStore, topicStore, workspaceStore } from "@/pages/superMagic/stores/core"
import { resolveMicroAppModelSelectionMode } from "@/pages/superMagic/pages/MicroAppPage/utils/microAppModelMode"

interface MicroAppCreatePromptProps {
	workspace: Workspace | null
	onCreated: (projectId: string) => void
	onFocusChange?: (focused: boolean) => void
	mobile?: boolean
}

const EDITOR_CONTAINER_CLASS_NAME = [
	// 输入框悬浮在 Web App 页面云上方，需要用半透明边界和阴影建立清晰层级，同时只覆盖现有编辑器的视觉外观。
	"!rounded-2xl !border !border-white !bg-white",
	"shadow-[0_28px_90px_rgba(35,32,53,0.18),0_2px_10px_rgba(35,32,53,0.05),inset_0_1px_0_rgba(255,255,255,0.92)]",
	"backdrop-blur-2xl dark:!border-white/10 dark:!bg-zinc-950/[0.72]",
	"dark:shadow-[0_24px_80px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.06)]",
	"[&_[data-testid=super-message-editor-toolbar]_button]:!rounded-lg",
	"[&_[data-testid=super-message-editor-toolbar-right]_button]:!h-8",
	"[&_[data-testid=super-message-editor-toolbar-right]_button]:!min-w-8",
].join(" ")

function MicroAppCreatePrompt({
	workspace,
	onCreated,
	onFocusChange,
	mobile = false,
}: MicroAppCreatePromptProps) {
	const { t } = useTranslation("super")
	const [sceneStateStore] = useState(() => createSceneStateStore())
	const modelTopicMode = resolveMicroAppModelSelectionMode()

	useEffect(() => {
		sceneStateStore.setInputScopeKey(
			buildTopicInputScopeKey(TopicMode.MicroApp, "", "micro-apps-create"),
		)

		return () => sceneStateStore.setInputScopeKey("")
	}, [sceneStateStore])

	useEffect(() => {
		// 列表页的输入始终创建新项目，不能继承用户上一个详情页残留的项目和话题。
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
			topicMode: TopicMode.MicroApp,
			modelTopicMode,
			placeholder: t("microAppsPage.heroPlaceholder"),
			enableMessageSendByContent: true,
			skipInitialDraftRestore: true,
			size: mobile ? "mobile" : "default",
			containerClassName: EDITOR_CONTAINER_CLASS_NAME,
			className: mobile ? "min-h-[70px]" : "min-h-[92px]",
			layoutConfig: {
				topBarLeft: [ToolbarButton.AT],
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
				upload: { confirmDelete: false },
			},
			onSendSuccess: ({ currentProject }) => {
				if (currentProject?.id) onCreated(currentProject.id)
			},
		}),
		[mobile, modelTopicMode, onCreated, t, workspace],
	)

	return (
		<SceneStateProvider store={sceneStateStore} variant={ScenePanelVariant.HomePage}>
			<div
				className="w-full"
				data-testid="micro-apps-create-prompt"
				onFocus={() => onFocusChange?.(true)}
				onBlur={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
						onFocusChange?.(false)
					}
				}}
			>
				<DefaultMessageEditorContainer editorContext={editorContext} />
			</div>
		</SceneStateProvider>
	)
}

export default observer(MicroAppCreatePrompt)
