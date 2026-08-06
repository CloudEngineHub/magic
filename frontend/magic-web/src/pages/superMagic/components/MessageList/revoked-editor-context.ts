import type { SceneEditorContext } from "@/pages/superMagic/components/MainInputContainer/components/editors/types"

export type RevokedMessageEditorContext = Partial<
	Pick<
		SceneEditorContext,
		| "selectedProject"
		| "selectedWorkspace"
		| "setSelectedTopic"
		| "setSelectedWorkspace"
		| "topicMode"
		| "modelTopicMode"
		| "topicStore"
		| "mentionPanelStore"
		| "projectFilesStore"
		| "topicModelStore"
		| "mergeSendParams"
	>
>
