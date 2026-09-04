import type { ModelItem } from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/types"
import type { ProjectListItem, Topic, Workspace } from "@/pages/superMagic/pages/Workspace/types"

export interface RecordingStartContext {
	workspace: Workspace | null
	project: ProjectListItem | null
	topic: Topic | null
	model: ModelItem | null
}

/** Keep the current editor selection as the primary source, with the active
 * recording snapshot as a fallback before an override clears the store. */
export function resolveRecordingStartContext({
	selectedWorkspace,
	selectedProject,
	selectedTopic,
	selectedModel,
	activeWorkspace,
	activeProject,
	activeTopic,
	activeModel,
}: {
	selectedWorkspace?: Workspace | null
	selectedProject?: ProjectListItem | null
	selectedTopic?: Topic | null
	selectedModel?: ModelItem | null
	activeWorkspace?: Workspace | null
	activeProject?: ProjectListItem | null
	activeTopic?: Topic | null
	activeModel?: ModelItem | null
}): RecordingStartContext {
	return {
		workspace: selectedWorkspace ?? activeWorkspace ?? null,
		project: selectedProject ?? activeProject ?? null,
		topic: selectedTopic ?? activeTopic ?? null,
		model: selectedModel ?? activeModel ?? null,
	}
}
