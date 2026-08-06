import { describe, it, expect, beforeEach } from "vitest"
import topicModelStore from "../topicModelStore"
import { ModelItem } from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/types"
import { DEFAULT_TOPIC_ID } from "@/services/superMagic/topicModel/constants"

describe("SuperMagicTopicModelStore", () => {
	const mockLanguageModel: ModelItem = {
		id: "1",
		group_id: "group-1",
		model_id: "gpt-4",
		model_name: "GPT-4",
		provider_model_id: "gpt-4",
		model_description: "GPT-4 model",
		model_icon: "icon",
		model_status: "normal",
		sort: 1,
	}

	const mockImageModel: ModelItem = {
		id: "2",
		group_id: "group-2",
		model_id: "dall-e-3",
		model_name: "DALL-E 3",
		provider_model_id: "dall-e-3",
		model_description: "DALL-E 3 model",
		model_icon: "icon",
		model_status: "normal",
		sort: 1,
	}

	beforeEach(() => {
		// Reset store to initial state
		topicModelStore.reset()
	})

	describe("initial state", () => {
		it("should have correct initial values", () => {
			expect(topicModelStore.selectedLanguageModel).toBeNull()
			expect(topicModelStore.selectedImageModel).toBeNull()
			expect(topicModelStore.isLoading).toBe(false)
			expect(topicModelStore.currentTopicId).toBe(DEFAULT_TOPIC_ID)
			expect(topicModelStore.currentProjectId).toBe("")
			expect(topicModelStore.currentTopicMode).toBe("general")
			expect(topicModelStore.currentAgentCode).toBe("")
		})
	})

	describe("setSelectedLanguageModel", () => {
		it("should set language model", () => {
			topicModelStore.setSelectedLanguageModel(mockLanguageModel)

			expect(topicModelStore.selectedLanguageModel).toEqual(mockLanguageModel)
		})

		it("should set language model to null", () => {
			topicModelStore.setSelectedLanguageModel(mockLanguageModel)
			topicModelStore.setSelectedLanguageModel(null)

			expect(topicModelStore.selectedLanguageModel).toBeNull()
		})
	})

	describe("setSelectedImageModel", () => {
		it("should set image model", () => {
			topicModelStore.setSelectedImageModel(mockImageModel)

			expect(topicModelStore.selectedImageModel).toEqual(mockImageModel)
		})

		it("should set image model to null", () => {
			topicModelStore.setSelectedImageModel(mockImageModel)
			topicModelStore.setSelectedImageModel(null)

			expect(topicModelStore.selectedImageModel).toBeNull()
		})
	})

	describe("setLoading", () => {
		it("should set loading to true", () => {
			topicModelStore.setLoading(true)

			expect(topicModelStore.isLoading).toBe(true)
		})

		it("should set loading to false", () => {
			topicModelStore.setLoading(true)
			topicModelStore.setLoading(false)

			expect(topicModelStore.isLoading).toBe(false)
		})
	})

	describe("isLanguageModelReady", () => {
		it("should require both a valid model and completed loading", () => {
			expect(topicModelStore.isLanguageModelReady).toBe(false)

			topicModelStore.setSelectedLanguageModel(mockLanguageModel)
			topicModelStore.setLoading(true)
			expect(topicModelStore.isLanguageModelReady).toBe(false)

			topicModelStore.setLoading(false)
			expect(topicModelStore.isLanguageModelReady).toBe(true)

			topicModelStore.setSelectedLanguageModel(null)
			expect(topicModelStore.isLanguageModelReady).toBe(false)
		})
	})

	describe("setCurrentContext", () => {
		it("should set all context values", () => {
			topicModelStore.setCurrentContext("topic-123", "project-456", "chat", "agent_x")

			expect(topicModelStore.currentTopicId).toBe("topic-123")
			expect(topicModelStore.currentProjectId).toBe("project-456")
			expect(topicModelStore.currentTopicMode).toBe("chat")
			expect(topicModelStore.currentAgentCode).toBe("agent_x")
		})

		it("should update context values", () => {
			topicModelStore.setCurrentContext("topic-1", "project-1", "general")
			topicModelStore.setCurrentContext("topic-2", "project-2", "chat")

			expect(topicModelStore.currentTopicId).toBe("topic-2")
			expect(topicModelStore.currentProjectId).toBe("project-2")
			expect(topicModelStore.currentTopicMode).toBe("chat")
		})
	})

	describe("reset", () => {
		it("should reset all state to initial values", () => {
			// Set some values
			topicModelStore.setSelectedLanguageModel(mockLanguageModel)
			topicModelStore.setSelectedImageModel(mockImageModel)
			topicModelStore.setLoading(true)
			topicModelStore.setCurrentContext("topic-123", "project-456", "chat")

			// Reset
			topicModelStore.reset()

			// Verify all values are reset
			expect(topicModelStore.selectedLanguageModel).toBeNull()
			expect(topicModelStore.selectedImageModel).toBeNull()
			expect(topicModelStore.isLoading).toBe(false)
			expect(topicModelStore.currentTopicId).toBe(DEFAULT_TOPIC_ID)
			expect(topicModelStore.currentProjectId).toBe("")
			expect(topicModelStore.currentTopicMode).toBe("general")
			expect(topicModelStore.currentAgentCode).toBe("")
		})
	})

	describe("multiple model updates", () => {
		it("should handle setting both models", () => {
			topicModelStore.setSelectedLanguageModel(mockLanguageModel)
			topicModelStore.setSelectedImageModel(mockImageModel)

			expect(topicModelStore.selectedLanguageModel).toEqual(mockLanguageModel)
			expect(topicModelStore.selectedImageModel).toEqual(mockImageModel)
		})

		it("should handle independent model updates", () => {
			topicModelStore.setSelectedLanguageModel(mockLanguageModel)

			expect(topicModelStore.selectedLanguageModel).toEqual(mockLanguageModel)
			expect(topicModelStore.selectedImageModel).toBeNull()

			topicModelStore.setSelectedImageModel(mockImageModel)

			expect(topicModelStore.selectedLanguageModel).toEqual(mockLanguageModel)
			expect(topicModelStore.selectedImageModel).toEqual(mockImageModel)
		})
	})

	describe("state isolation", () => {
		it("should not affect other state when updating models", () => {
			topicModelStore.setCurrentContext("topic-1", "project-1", "chat")
			topicModelStore.setLoading(true)

			topicModelStore.setSelectedLanguageModel(mockLanguageModel)

			expect(topicModelStore.currentTopicId).toBe("topic-1")
			expect(topicModelStore.currentProjectId).toBe("project-1")
			expect(topicModelStore.currentTopicMode).toBe("chat")
			expect(topicModelStore.isLoading).toBe(true)
		})

		it("should clear stale models when workspace-home mode changes", () => {
			topicModelStore.setCurrentContext(undefined, undefined, "data_analysis")
			topicModelStore.setSelectedLanguageModel(mockLanguageModel)
			topicModelStore.setSelectedImageModel(mockImageModel)
			topicModelStore.setLoading(false)

			topicModelStore.setCurrentContext(undefined, undefined, "summary")

			expect(topicModelStore.selectedLanguageModel).toBeNull()
			expect(topicModelStore.selectedImageModel).toBeNull()
			expect(topicModelStore.selectedVideoModel).toBeNull()
			expect(topicModelStore.isLoading).toBe(true)
			expect(topicModelStore.isLanguageModelReady).toBe(false)
		})

		it("should mark a non-home context change as loading without clearing its model", () => {
			topicModelStore.setCurrentContext("topic-2", "project-2", "general")
			topicModelStore.setSelectedLanguageModel(mockLanguageModel)
			topicModelStore.setSelectedImageModel(mockImageModel)
			topicModelStore.setLoading(false)

			topicModelStore.setCurrentContext("topic-3", "project-2", "general")

			expect(topicModelStore.selectedLanguageModel).toEqual(mockLanguageModel)
			expect(topicModelStore.selectedImageModel).toEqual(mockImageModel)
			expect(topicModelStore.isLoading).toBe(true)
			expect(topicModelStore.isLanguageModelReady).toBe(false)
		})

		it("should preserve readiness when setting the same non-home context", () => {
			topicModelStore.setCurrentContext("topic-2", "project-2", "general")
			topicModelStore.setSelectedLanguageModel(mockLanguageModel)
			topicModelStore.setSelectedImageModel(mockImageModel)
			topicModelStore.setLoading(false)

			topicModelStore.setCurrentContext("topic-2", "project-2", "general")

			expect(topicModelStore.selectedLanguageModel).toEqual(mockLanguageModel)
			expect(topicModelStore.selectedImageModel).toEqual(mockImageModel)
			expect(topicModelStore.isLoading).toBe(false)
		})

		it("should mark a same-topic agent change as loading", () => {
			topicModelStore.setCurrentContext("topic-2", "project-2", "custom_agent", "agent-a")
			topicModelStore.setSelectedLanguageModel(mockLanguageModel)
			topicModelStore.setLoading(false)

			topicModelStore.setCurrentContext("topic-2", "project-2", "custom_agent", "agent-b")

			expect(topicModelStore.isLoading).toBe(true)
			expect(topicModelStore.isLanguageModelReady).toBe(false)
		})
	})
})
