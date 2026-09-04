import { describe, expect, it } from "vitest"
import { resolveRecordingStartContext } from "../recordingStartContext"

const workspace = { id: "workspace-1" } as never
const project = { id: "project-1" } as never
const topic = { id: "topic-1" } as never
const model = { model_id: "model-1" } as never

describe("resolveRecordingStartContext", () => {
	it("preserves the active recording context when the editor selection is incomplete", () => {
		expect(
			resolveRecordingStartContext({
				selectedWorkspace: null,
				selectedProject: null,
				selectedTopic: null,
				selectedModel: null,
				activeWorkspace: workspace,
				activeProject: project,
				activeTopic: topic,
				activeModel: model,
			}),
		).toEqual({ workspace, project, topic, model })
	})

	it("prefers the editor selection when it is available", () => {
		const selectedWorkspace = { id: "selected-workspace" } as never
		const selectedProject = { id: "selected-project" } as never
		const selectedTopic = { id: "selected-topic" } as never
		const selectedModel = { model_id: "selected-model" } as never

		expect(
			resolveRecordingStartContext({
				selectedWorkspace,
				selectedProject,
				selectedTopic,
				selectedModel,
				activeWorkspace: workspace,
				activeProject: project,
				activeTopic: topic,
				activeModel: model,
			}),
		).toEqual({
			workspace: selectedWorkspace,
			project: selectedProject,
			topic: selectedTopic,
			model: selectedModel,
		})
	})

	it("uses the persisted session snapshot when the editor has no usable context", () => {
		const persistedWorkspace = { id: "persisted-workspace" } as never
		const persistedProject = { id: "persisted-project" } as never
		const persistedTopic = { id: "persisted-topic" } as never
		const persistedModel = { model_id: "persisted-model" } as never

		expect(
			resolveRecordingStartContext({
				selectedWorkspace: null,
				selectedProject: null,
				selectedTopic: null,
				selectedModel: null,
				activeWorkspace: persistedWorkspace,
				activeProject: persistedProject,
				activeTopic: persistedTopic,
				activeModel: persistedModel,
			}),
		).toEqual({
			workspace: persistedWorkspace,
			project: persistedProject,
			topic: persistedTopic,
			model: persistedModel,
		})
	})
})
