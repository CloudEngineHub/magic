import { useMemoizedFn } from "ahooks"
import type { MutableRefObject, RefObject } from "react"
import type { MentionListItem } from "@/components/business/MentionPanel/tiptap-plugin/types"
import type { VoiceInputRef } from "@/components/business/VoiceInput"
import magicToast from "@/components/base/MagicToaster/utils"
import projectFilesStore from "@/stores/projectFiles"
import { replaceSuperPlaceholderToString } from "../extensions/super-placeholder/utils"
import { serializeInspectorContent } from "../extensions/inspector-detail"
import type { MessageEditorStore } from "../stores"
import type { MessageEditorProps } from "../types"
import { isEmptyJSONContent } from "../utils"
import { transformMarkerImagePathsToWorkspaceAbsolute } from "../utils/mention"

interface UseMessageSendHandlerParams {
	voiceInputRef: RefObject<VoiceInputRef>
	canSendMessage: boolean
	hasLoadingMarker: boolean
	isAllFilesUploaded: boolean
	isEditingQueueItem: boolean
	store: MessageEditorStore
	t: (key: string, options?: Record<string, unknown>) => string
	onSend?: MessageEditorProps["onSend"]
	topicMode?: MessageEditorProps["topicMode"]
	collectMentionItemsFromEditor: () => MentionListItem[]
	isMountedRef: MutableRefObject<boolean>
}

export default function useMessageSendHandler({
	voiceInputRef,
	canSendMessage,
	hasLoadingMarker,
	isAllFilesUploaded,
	isEditingQueueItem,
	store,
	t,
	onSend,
	topicMode,
	collectMentionItemsFromEditor,
	isMountedRef,
}: UseMessageSendHandlerParams) {
	return useMemoizedFn(async () => {
		if (voiceInputRef.current?.isRecording) voiceInputRef.current.stopRecording()

		if (isEditingQueueItem && isEmptyJSONContent(store.editorStore.value)) {
			return
		}

		const selectedModel = store.topicModelStore.selectedLanguageModel
		if (!isEditingQueueItem && !store.topicModelStore.isLanguageModelReady) {
			magicToast.error(t("messageEditor.pleaseSelectModel"))
			return
		}

		if (!canSendMessage) {
			if (hasLoadingMarker) {
				magicToast.error(t("messageEditor.waitForMarkerLoad"))
			} else if (isEmptyJSONContent(store.editorStore.value)) {
				magicToast.error(t("messageEditor.pleaseInputContent"))
			} else if (!isAllFilesUploaded) {
				magicToast.error(t("messageEditor.waitForFileUpload"))
			}
			return
		}

		let content
		try {
			content = store.editorStore.value
				? serializeInspectorContent(
						transformMarkerImagePathsToWorkspaceAbsolute(
							replaceSuperPlaceholderToString(store.editorStore.value, {
								validate: true,
							}),
							projectFilesStore.workspaceFilesList,
						),
						{
							title: t("stylePanel.inspector.agentPromptTitle"),
							selector: t("stylePanel.inspector.selector"),
							size: t("stylePanel.inspector.size"),
							computedStyles: t("stylePanel.inspector.computedStyles"),
							textContent: t("stylePanel.inspector.textContent"),
							elementAttributes: t("stylePanel.inspector.elementAttributes"),
							resource: t("stylePanel.inspector.resource"),
							domContext: t("stylePanel.inspector.domContext"),
							elementHtml: t("stylePanel.inspector.elementHtml"),
							selectorMatchCount: t("stylePanel.inspector.selectorMatchCount"),
						},
					)
				: undefined
		} catch (error: unknown) {
			const validationError = error as Error & {
				validationResult?: { isValid: boolean; emptyPlaceholder: string }
			}
			if (validationError.validationResult?.emptyPlaceholder) {
				const placeholder = validationError.validationResult.emptyPlaceholder
				magicToast.error(
					t("messageEditor.superPlaceholderEmpty", {
						placeholders: placeholder,
					}),
				)
			} else {
				magicToast.error(t("messageEditor.validationFailed"))
			}
			return
		}

		store.draftStore.startSendingGuard()
		const mentionItems = collectMentionItemsFromEditor()

		onSend?.({
			value: content,
			topicMode,
			mentionItems,
			selectedModel: selectedModel ? { ...selectedModel } : null,
			selectedImageModel: store.topicModelStore.selectedImageModel,
			selectedVideoModel: store.topicModelStore.selectedVideoModel,
		})

		store.draftStore.createSentDraft({
			value: store.editorStore.value,
			onError: (error) => {
				if (isMountedRef.current) {
					console.error("Failed to clear draft:", error)
				}
			},
		})
	})
}
