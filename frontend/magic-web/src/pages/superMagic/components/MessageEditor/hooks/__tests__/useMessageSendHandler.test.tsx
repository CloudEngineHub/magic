import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import magicToast from "@/components/base/MagicToaster/utils"
import type { ModelItem } from "../../types"
import type { MessageEditorStore } from "../../stores"
import useMessageSendHandler from "../useMessageSendHandler"

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		error: vi.fn(),
	},
}))

vi.mock("@/stores/projectFiles", () => ({
	default: {
		workspaceFilesList: [],
	},
}))

vi.mock("../../extensions/super-placeholder/utils", () => ({
	replaceSuperPlaceholderToString: vi.fn((content) => content),
}))

vi.mock("../../extensions/inspector-detail", () => ({
	serializeInspectorContent: vi.fn((content) => content),
}))

vi.mock("../../utils", () => ({
	isEmptyJSONContent: vi.fn(() => false),
}))

vi.mock("../../utils/mention", () => ({
	transformMarkerImagePathsToWorkspaceAbsolute: vi.fn((content) => content),
}))

describe("useMessageSendHandler", () => {
	const languageModel: ModelItem = {
		id: "model-1",
		group_id: "group-1",
		model_id: "model-1",
		model_name: "Model 1",
		provider_model_id: "model-1",
		model_description: "Model 1",
		model_icon: "",
		model_status: "normal",
		sort: 1,
	}

	let store: MessageEditorStore

	beforeEach(() => {
		const topicModelStore = {
			selectedLanguageModel: null as ModelItem | null,
			selectedImageModel: null,
			selectedVideoModel: null,
			isLoading: false,
			get isLanguageModelReady() {
				return !this.isLoading && Boolean(this.selectedLanguageModel?.model_id)
			},
		}
		store = {
			editorStore: {
				value: {
					type: "doc",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: "test" }],
						},
					],
				},
			},
			topicModelStore,
			draftStore: {
				startSendingGuard: vi.fn(),
				createSentDraft: vi.fn(),
			},
		} as unknown as MessageEditorStore
		vi.clearAllMocks()
	})

	function renderSendHandler(onSend = vi.fn()) {
		const { result } = renderHook(() =>
			useMessageSendHandler({
				voiceInputRef: { current: null },
				canSendMessage: true,
				hasLoadingMarker: false,
				isAllFilesUploaded: true,
				isEditingQueueItem: false,
				store,
				t: (key) => key,
				onSend,
				collectMentionItemsFromEditor: () => [],
				isMountedRef: { current: true },
			}),
		)

		return { result, onSend }
	}

	it("should block sending when no language model is selected", async () => {
		const { result, onSend } = renderSendHandler()

		await act(async () => result.current())

		expect(onSend).not.toHaveBeenCalled()
		expect(magicToast.error).toHaveBeenCalledWith("messageEditor.pleaseSelectModel")
	})

	it("should block sending while the selected language model is still loading", async () => {
		store.topicModelStore.selectedLanguageModel = languageModel
		store.topicModelStore.isLoading = true
		const { result, onSend } = renderSendHandler()

		await act(async () => result.current())

		expect(onSend).not.toHaveBeenCalled()
		expect(magicToast.error).toHaveBeenCalledWith("messageEditor.pleaseSelectModel")
	})

	it("should send after the selected language model is ready", async () => {
		store.topicModelStore.selectedLanguageModel = languageModel
		store.topicModelStore.isLoading = false
		const { result, onSend } = renderSendHandler()

		await act(async () => result.current())

		expect(onSend).toHaveBeenCalledWith(
			expect.objectContaining({
				selectedModel: languageModel,
			}),
		)
		expect(magicToast.error).not.toHaveBeenCalled()
	})

	it("should allow updating a queue item without a ready model", async () => {
		const onSend = vi.fn()
		const { result } = renderHook(() =>
			useMessageSendHandler({
				voiceInputRef: { current: null },
				canSendMessage: true,
				hasLoadingMarker: false,
				isAllFilesUploaded: true,
				isEditingQueueItem: true,
				store,
				t: (key) => key,
				onSend,
				collectMentionItemsFromEditor: () => [],
				isMountedRef: { current: true },
			}),
		)

		await act(async () => result.current())

		expect(onSend).toHaveBeenCalledWith(
			expect.objectContaining({
				selectedModel: null,
			}),
		)
		expect(magicToast.error).not.toHaveBeenCalled()
	})
})
