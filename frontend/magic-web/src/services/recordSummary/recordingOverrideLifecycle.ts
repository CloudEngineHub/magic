import type { ModelItem } from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/types"
import type { ProjectListItem, Topic, Workspace } from "@/pages/superMagic/pages/Workspace/types"

export type RecordingOverrideSource = "currentTab" | "otherTab" | "history"
export type RecordingOverrideStatus = "recording" | "paused"

export interface RecordingOverrideStartContext {
	workspace: Workspace | null
	project: ProjectListItem | null
	topic: Topic | null
	model: ModelItem | null
}

export interface RecordingOverrideContext {
	sessionId?: string
	duration: string
	source: RecordingOverrideSource
	status: RecordingOverrideStatus
	/** Snapshot captured before completion clears the shared recording store. */
	startContext?: RecordingOverrideStartContext
}

export interface ForceOverrideFinalizationSteps {
	stopRecordingServices: () => void | Promise<void>
	flushSessionUploads: () => void | Promise<void>
	summarizeSession: () => void | Promise<void>
	completeSession: () => void | Promise<void>
}

/**
 * A recording session is not completed until its final audio upload, batch-save,
 * and summary operations have settled successfully.
 */
export async function runForceOverrideFinalization(
	steps: ForceOverrideFinalizationSteps,
): Promise<void> {
	await steps.stopRecordingServices()
	await steps.flushSessionUploads()
	await steps.summarizeSession()
	await steps.completeSession()
}
