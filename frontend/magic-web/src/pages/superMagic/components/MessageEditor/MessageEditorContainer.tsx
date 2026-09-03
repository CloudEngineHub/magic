import type { Editor, JSONContent } from "@/infrastructure/editors/tiptap/react"
import { forwardRef, useEffect, useCallback, useMemo, useRef, type ClipboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { useAsyncEffect, useMemoizedFn } from "ahooks"
import { observer } from "mobx-react-lite"
import { useMessageEditor, useDragUpload, useSlideContentSync } from "./hooks"
import { useIsMobile } from "@/hooks/useIsMobile"
import { useMessageEditorProvider } from "./MessageEditorProvider"
import useMessageEditorToolbarContext from "./hooks/useMessageEditorToolbarContext"
import MessageEditorContainerView from "./components/MessageEditorContainerView"
import useResolvedEditorStore from "./hooks/useResolvedEditorStore"
import useSyncEditorStoreState from "./hooks/useSyncEditorStoreState"
import useEditorSlotContent from "./hooks/useEditorSlotContent"
import useUploadMentionFlow from "./hooks/useUploadMentionFlow"
import useMessageSendHandler from "./hooks/useMessageSendHandler"
import useCompressContext from "./hooks/useCompressContext"
import useMessageEditorImperativeRef from "./hooks/useMessageEditorImperativeRef"
import {
	EDITOR_ICON_SIZE_MAP,
	TOP_BAR_ICON_SIZE_MAP,
	DEFAULT_LAYOUT_CONFIG,
} from "./constants/constant"
import { isEmptyJSONContent } from "./utils"
import {
	type MessageEditorProps,
	type MessageEditorRef as MessageEditorRefType,
	ModelItem,
	type SendMessageByContentPayload,
} from "./types"
import {
	type DataService,
	McpMentionData,
	MentionItemType,
	type MentionSelectContext,
} from "@/components/business/MentionPanel/types"
import type {
	MentionRemoveItemPayload,
	TiptapMentionAttributes,
} from "@/components/business/MentionPanel/tiptap-plugin"
import AiCompletionService from "@/services/chat/editor/AiCompletionService"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { resetDocumentScrollPosition } from "@/utils/scroll"
import {
	checkMCPOAuth,
	MCPOAuthType,
} from "@/components/Agent/MCP/AgentSettings/AgentPanel/MCPPanel/helpers"
import GlobalMentionPanelStore from "@/components/business/MentionPanel/builtin-store"
import { insertMentionFromDroppedData } from "./utils/drag"
import { runActiveEditor, useLatestActiveEditor } from "./utils/editorLifecycle"
import useEditorPromptCarousel from "./hooks/useEditorPromptCarousel"
import useChooseUploadDirModal from "./hooks/useChooseUploadDirModal"
import { superMagicTopicModelService } from "@/services/superMagic/topicModel"
import { resolveModelTopicMode } from "./utils/modelTopicMode"
import type { Topic } from "../../pages/Workspace/types"
import useSharedDataFromApp from "./hooks/useSharedDataFromApp"
import type { VoiceInputRef } from "@/components/business/VoiceInput"
import useMessageEditorPubSub from "./hooks/useMessageEditorPubSub"
import { useMessageEditorMarker } from "./hooks/useMessageEditorMarker"
import { useCanvasPendingMentionBridge } from "./hooks/useCanvasPendingMentionBridge"
import { resolveMessageEditorModules } from "./utils/moduleConfig"
import { userStore } from "@/models/user"
import { useTaskInterrupt } from "../../hooks/useTaskInterrupt"
import { openMessageFile } from "@/pages/superMagic/components/MessageList/utils/openMessageFile"
import {
	createPastedTextFile,
	shouldConvertPastedTextToAttachment,
} from "./utils/pastedTextAttachment"
import magicToast from "@/components/base/MagicToaster/utils"
import { isAllowedMention as defaultIsAllowedMention } from "./utils/mention"
import {
	MessageSendModelWaitError,
	resolveMessageSendModels,
	type ResolvedMessageSendModels,
} from "./utils/messageSendModelFallback"
import {
	claimCanvasClipboardPasteEvent,
	getCanvasClipboardPasteController,
	hasCanvasClipboardMimeType,
	type CanvasClipboardAsset,
} from "@/components/CanvasDesign/runtime/resources/clipboard/CanvasClipboardPasteController"
import { CanvasDesignClipboard } from "@/components/CanvasDesign/runtime/resources/clipboard/CanvasDesignClipboard"

export type MessageEditorRef = MessageEditorRefType & {
	/**
	 * Add upload files.
	 * @param files - File list
	 */
	addUploadFiles: (files: File[]) => Promise<void>
	loadDraftReady: () => Promise<void>
	saveSuperMagicTopicModel: (params: {
		selectedTopic: Topic
		model: ModelItem
		imageModel: ModelItem | null
		videoModel?: ModelItem | null
	}) => void
}

export const MessageEditorContainer = observer(
	forwardRef<MessageEditorRef, MessageEditorProps>(
		(
			{
				className,
				containerClassName,
				onSend,
				placeholder,
				promptCarousel,
				onFileUpload,
				isTaskRunning = false,
				onInterrupt,
				stopEventLoading,
				selectedTopic,
				selectedProject,
				selectedWorkspace,
				draftKey,
				size = "default",
				modules,
				isSending = false,
				sendButtonLoading = false,
				topicMode,
				modelTopicMode,
				onFocus,
				onBlur,
				onReady,
				onMentionInsertItems,
				onFileClick,
				onEnsureProject,
				showLoading = false,
				attachments,
				isEditingQueueItem = false,
				editorModeSwitch,
				modelSwitch,
				mentionPanelStore = GlobalMentionPanelStore,
				isAllowedMention,
				projectFilesStore,
				topicModelStore,
				layoutConfig,
				enableMessageSendByContent = false,
				skipInitialDraftRestore = false,
			},
			ref,
		) => {
			const { t } = useTranslation("super")
			const voiceInputRef = useRef<VoiceInputRef>(null)
			const isMobile = useIsMobile()

			const iconSize = EDITOR_ICON_SIZE_MAP[size]
			const topBarIconSize = TOP_BAR_ICON_SIZE_MAP[size]

			const { config: providerConfig } = useMessageEditorProvider()

			const effectiveLayoutConfig = useMemo(
				() => ({
					topBarLeft: layoutConfig?.topBarLeft ?? DEFAULT_LAYOUT_CONFIG.topBarLeft,
					topBarRight: layoutConfig?.topBarRight ?? DEFAULT_LAYOUT_CONFIG.topBarRight,
					bottomLeft: layoutConfig?.bottomLeft ?? DEFAULT_LAYOUT_CONFIG.bottomLeft,
					bottomRight: layoutConfig?.bottomRight ?? DEFAULT_LAYOUT_CONFIG.bottomRight,
					outsideTop: layoutConfig?.outsideTop ?? DEFAULT_LAYOUT_CONFIG.outsideTop,
					outsideBottom:
						layoutConfig?.outsideBottom ?? DEFAULT_LAYOUT_CONFIG.outsideBottom,
				}),
				[layoutConfig],
			)

			const resolvedModules = useMemo(
				() =>
					resolveMessageEditorModules({
						modules,
						layoutConfig: effectiveLayoutConfig,
						providerConfig,
					}),
				[modules, effectiveLayoutConfig, providerConfig],
			)

			const shouldEnableMention = resolvedModules.mention.enabled

			const aiCompletionEnabled = !isMobile && resolvedModules.aiCompletion.enabled

			const uploadEnabled = resolvedModules.upload.enabled
			const mcpButtonConfig = resolvedModules.mcp
			const voiceInputEnabled = resolvedModules.voiceInput.enabled
			const sendEnabled = resolvedModules.send.enabled
			const shouldConfirmUploadDelete = resolvedModules.upload.confirmDelete

			const { store, parentStore } = useResolvedEditorStore({
				mentionPanelStore,
				projectFilesStore,
				topicModelStore,
			})

			const isMountedRef = useRef(true)
			const modelWaitAbortControllerRef = useRef<AbortController | null>(null)
			const isProjectContext = Boolean(selectedProject?.id)

			useSyncEditorStoreState({
				store,
				draftKey,
				mentionPanelStore,
				isSending,
				isTaskRunning,
			})

			const fileUploadStore = store.fileUploadStore
			const canvasClipboardEpochRef = useRef(0)
			const getCanvasClipboardSessionId = useMemoizedFn(
				() =>
					`${draftKey?.workspaceId ?? selectedWorkspace?.id ?? ""}:${selectedProject?.id ?? selectedTopic?.project_id ?? draftKey?.projectId ?? ""}:${selectedTopic?.id ?? draftKey?.topicId ?? ""}:${canvasClipboardEpochRef.current}`,
			)
			const tiptapEditorRef = useRef<Editor | null>(null)
			const shouldSkipMentionRemoveSyncRef = useRef(false)
			const promoteCanvasPendingMentionsRef = useRef<(() => void) | null>(null)

			const getEditor = useMemoizedFn(() => tiptapEditorRef.current)
			const promoteCanvasPendingMentions = useMemoizedFn(() => {
				promoteCanvasPendingMentionsRef.current?.()
			})
			const runWithoutMentionRemoveSync = useMemoizedFn((callback: () => void) => {
				shouldSkipMentionRemoveSyncRef.current = true
				try {
					callback()
				} finally {
					shouldSkipMentionRemoveSyncRef.current = false
				}
			})

			const {
				files,
				addFiles: _addFiles,
				clearFiles,
				clearFilesLocalOnly,
				isAllFilesUploaded,
				validateFileSize,
				validateFileCount,
				collectMentionItemsFromContent,
				collectMentionItemsFromEditor,
				handleRemoveFile,
				handleRemoveUploadedFile,
				handleMentionRemoveItems: handleUploadMentionRemoveItems,
				isAllowedUploadMention,
				shouldRestoreRemovedMention,
			} = useUploadMentionFlow({
				fileUploadStore,
				mentionPanelStore,
				getEditor,
				isProjectContext,
				// The main editor can enqueue messages while loading, but it is
				// still not a dedicated queue draft editor.
				isQueueDraftMode: false,
				confirmDelete: shouldConfirmUploadDelete,
				onFileUpload,
				runWithoutMentionRemoveSync,
				selectedProjectId: selectedProject?.id,
				selectedTopicId: selectedTopic?.id,
				t,
			})

			const { handleMarkerMentionRemove, hasLoadingMarker, syncInsertedMarkersToManager } =
				useMessageEditorMarker({
					getEditor,
					content: store.editorStore.value,
				})

			const {
				promptCarouselConfigured,
				effectiveAiCompletionEnabled,
				promptCarouselNode,
				acceptPromptCarousel,
				navigatePromptCarousel,
				setIsEditorFocused,
			} = useEditorPromptCarousel({
				promptCarousel,
				isMobile,
				hasEditorContent: !isEmptyJSONContent(store.editorStore.value),
				hasFiles: files.length > 0,
				isComposing: store.editorStore.isComposing,
				aiCompletionEnabled,
				editorRef: tiptapEditorRef,
			})

			const handleMentionRemove = useMemoizedFn((mentionAttrs: TiptapMentionAttributes) => {
				handleMarkerMentionRemove(mentionAttrs)
				handleRemoveFile(mentionAttrs)
			})

			const handleMentionRemoveItems = useMemoizedFn((items: MentionRemoveItemPayload[]) => {
				items.forEach(({ item, stillExists, deletionInput }) => {
					if (stillExists) return
					if (item.type === MentionItemType.DESIGN_MARKER) {
						handleMarkerMentionRemove(item)
					} else {
						handleUploadMentionRemoveItems([{ item, stillExists, deletionInput }])
					}
				})
			})

			const canSendMessage = useMemo(() => {
				if (!sendEnabled) return false
				if (hasLoadingMarker) return false
				if (isEditingQueueItem) {
					return isAllFilesUploaded && !isSending && !sendButtonLoading
				}
				if (!store.topicModelStore.isLanguageModelReady) return false
				const hasContent = !isEmptyJSONContent(store.editorStore.value)
				return hasContent && isAllFilesUploaded && !isSending && !sendButtonLoading
			}, [
				hasLoadingMarker,
				isEditingQueueItem,
				store.editorStore.value,
				isAllFilesUploaded,
				isSending,
				sendButtonLoading,
				sendEnabled,
				store.topicModelStore.isLanguageModelReady,
			])

			const sendButtonDisabled = !canSendMessage

			const { addFilesWithDir, UploadModal } = useChooseUploadDirModal({
				addFiles: _addFiles,
				selectedProject,
				attachments,
				validateFileSize,
				validateFileCount,
			})
			const uploadModal = uploadEnabled ? UploadModal : null

			const addFiles = useMemoizedFn(async (files: File[]) => {
				if (!uploadEnabled) return
				await addFilesWithDir(files)
			})

			const setValue = useMemoizedFn((content: JSONContent | undefined) => {
				store.setValue({ value: content })
			})

			const handleKeyboardInput = useMemoizedFn(() => {
				if (voiceInputRef.current?.isRecording) {
					voiceInputRef.current.stopRecording()
				}
			})

			const { isDragOver, dragEvents } = useDragUpload({
				enableFileDrop: uploadEnabled,
				onFilesDropped: uploadEnabled
					? (files) => {
							addFiles(Array.from(files))
						}
					: undefined,
				onDataDropped: (data) => {
					insertMentionFromDroppedData({ editor: tiptapEditorRef.current, data })
				},
			})

			const handleBlur = useMemoizedFn(() => {
				setIsEditorFocused(false)
				store.draftStore.saveDraftOnBlur({
					value: store.editorStore.value,
					onError: (error) => {
						if (isMountedRef.current) {
							console.error("Failed to save draft on blur:", error)
						}
					},
				})
				onBlur?.()
				if (isMobile) resetDocumentScrollPosition()
			})
			const handleFocus = useMemoizedFn(() => {
				promoteCanvasPendingMentions()
				setIsEditorFocused(true)
				onFocus?.()
			})

			const isAllowedEditorMention = useMemoizedFn(
				(attrs: TiptapMentionAttributes, dataService: DataService) =>
					isAllowedUploadMention(attrs) &&
					(isAllowedMention ?? defaultIsAllowedMention)(attrs, dataService),
			)

			const handleSend = useMessageSendHandler({
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
				promoteCanvasPendingMentions,
				onSendStart: () => {
					canvasClipboardEpochRef.current += 1
				},
				isMountedRef,
			})

			const { tiptapEditor, domRef } = useMessageEditor({
				value: store.editorStore.value,
				onSend: handleSend,
				placeholder: promptCarouselConfigured ? "" : placeholder,
				ariaLabel: placeholder,
				onPromptCarouselAccept: acceptPromptCarousel,
				onPromptCarouselNavigate: navigatePromptCarousel,
				onMentionInsertItems: (items) => {
					syncInsertedMarkersToManager(items)
					store.fileUploadStore.restorePastedUploadFileReferences(items)
					store.fileUploadStore.addPendingProjectFileReferences(items)
					onMentionInsertItems?.(items)
				},
				onChange: setValue,
				onMentionRemove: handleMentionRemove,
				onMentionRemoveItems: handleMentionRemoveItems,
				selectedTopic,
				onKeyboardInput: handleKeyboardInput,
				shouldEnableMention,
				sendEnabled,
				aiCompletionEnabled: effectiveAiCompletionEnabled,
				isOAuthInProgress: store.editorStore.isOAuthInProgress,
				onFocus: handleFocus,
				onBlur: handleBlur,
				size,
				topicMode,
				mentionPanelStore,
				isAllowedMention: isAllowedEditorMention,
				shouldSkipRemoveSync: () => shouldSkipMentionRemoveSyncRef.current,
				shouldSkipMentionValidation: () => store.editorStore.preserveMentionValidation,
				isTrustedMention: (attrs) => store.editorStore.isTrustedMention(attrs),
				shouldRestoreRemovedMention,
			})
			const activeEditorRef = useLatestActiveEditor(tiptapEditor)
			const canvasSelectionMentionScope = useMemo(
				() => ({
					workspaceId: selectedWorkspace?.id ?? draftKey?.workspaceId,
					projectId:
						selectedTopic?.project_id ?? selectedProject?.id ?? draftKey?.projectId,
					topicId: selectedTopic?.id ?? draftKey?.topicId,
				}),
				[
					draftKey?.projectId,
					draftKey?.topicId,
					draftKey?.workspaceId,
					selectedProject?.id,
					selectedTopic?.id,
					selectedTopic?.project_id,
					selectedWorkspace?.id,
				],
			)
			const { promotePending: promoteCanvasPending } = useCanvasPendingMentionBridge({
				editor: tiptapEditor,
				enabled: shouldEnableMention,
				scope: canvasSelectionMentionScope,
			})

			useEffect(() => {
				promoteCanvasPendingMentionsRef.current = promoteCanvasPending
				return () => {
					if (promoteCanvasPendingMentionsRef.current === promoteCanvasPending) {
						promoteCanvasPendingMentionsRef.current = null
					}
				}
			}, [promoteCanvasPending])

			useEffect(() => {
				tiptapEditorRef.current = tiptapEditor
				store.editorStore.setEditor(tiptapEditor)
				return () => {
					tiptapEditorRef.current = null
				}
			}, [tiptapEditor, store.editorStore])

			useEffect(() => {
				isMountedRef.current = true
				const controller = new AbortController()
				modelWaitAbortControllerRef.current = controller

				return () => {
					isMountedRef.current = false
					controller.abort()
					if (modelWaitAbortControllerRef.current === controller) {
						modelWaitAbortControllerRef.current = null
					}
				}
			}, [])

			const updateContent = useMemoizedFn(
				(
					content: JSONContent | undefined,
					options?: { preserveMentionValidation?: boolean },
				) => {
					store.editorStore.updateContent(content, options)
				},
			)

			const handleSendMessageByContent = useMemoizedFn(
				async (data: SendMessageByContentPayload) => {
					let models: ResolvedMessageSendModels | null
					try {
						models = await resolveMessageSendModels({
							topicModelStore: store.topicModelStore,
							selectedModel: data.selectedModel,
							selectedImageModel: data.selectedImageModel,
							selectedVideoModel: data.selectedVideoModel,
							signal: modelWaitAbortControllerRef.current?.signal,
						})
					} catch (error) {
						if (
							error instanceof MessageSendModelWaitError &&
							error.reason === "aborted"
						) {
							return
						}
						magicToast.error(t("messageEditor.modelLoadFailed"))
						return
					}
					if (!models) {
						magicToast.error(t("messageEditor.pleaseSelectModel"))
						return
					}
					onSend?.({
						value: data.jsonContent,
						mentionItems:
							data.mentionItems ?? collectMentionItemsFromContent(data.jsonContent),
						selectedModel: models.selectedModel,
						selectedImageModel: models.selectedImageModel,
						selectedVideoModel: models.selectedVideoModel,
						topicMode: data.topicMode ?? topicMode,
						shouldClearEditorAfterSend: data.shouldClearEditorAfterSend,
						extra: data.extra,
						targetTopic: data.targetTopic,
					})
				},
			)

			const { handleCompressContext } = useCompressContext({
				handleSendMessageByContent,
			})

			useMessageEditorPubSub({
				editor: tiptapEditor,
				isMobile,
				draftStore: store.draftStore,
				updateContent,
				enableMessageSendByContent,
				onSendMessageByContent: handleSendMessageByContent,
				onSendCurrentContent: handleSend,
			})

			useSharedDataFromApp({
				editor: tiptapEditor,
				addFiles,
				uploadEnabled,
			})

			const clearAllMarkers = useMemoizedFn(() => {
				pubsub.publish(PubSubEvents.Super_Magic_Clear_Canvas_Markers, {})
			})

			const clearContent = useMemoizedFn(() => {
				canvasClipboardEpochRef.current += 1
				clearAllMarkers()

				setValue(undefined)
				runActiveEditor(activeEditorRef.current, (editor) => {
					editor.commands.clearContent()
				})
				clearFiles()
			})

			const clearContentAfterSend = useMemoizedFn(() => {
				canvasClipboardEpochRef.current += 1
				shouldSkipMentionRemoveSyncRef.current = true
				try {
					clearAllMarkers()

					setValue(undefined)
					runActiveEditor(activeEditorRef.current, (editor) => {
						editor.commands.clearContent()
					})
					clearFilesLocalOnly()
				} finally {
					shouldSkipMentionRemoveSyncRef.current = false
				}
			})

			useEffect(() => {
				store.draftStore.setClearContentHandler(clearContent)
			}, [clearContent, store])

			const updateEditorValue = useMemoizedFn((content: JSONContent | undefined) => {
				setValue(content)
			})

			useSlideContentSync({ tiptapEditor, value: store.editorStore.value, updateContent })

			useAsyncEffect(async () => {
				store.draftStore.resetSendingGuard()
				clearAllMarkers()

				try {
					if (!draftKey || skipInitialDraftRestore) {
						store.draftStore.markDraftReady()
						return
					}

					await store.draftStore.loadLatestDraft({
						isClearContent: true,
						replaceDirectly: true,
					})
				} catch (error) {
					store.draftStore.markDraftReady()
					console.error("Failed to restore latest draft:", error)
				} finally {
					// Report readiness after the existing draft phase has settled.
					onReady?.()
				}
			}, [
				draftKey?.topicId,
				draftKey?.projectId,
				draftKey?.workspaceId,
				onReady,
				skipInitialDraftRestore,
			])

			const focus = useMemoizedFn(
				({
					enableWhenIsMobile = false,
					preventScroll = false,
				}: {
					enableWhenIsMobile?: boolean
					preventScroll?: boolean
				} = {}) => {
					if (!enableWhenIsMobile && isMobile) {
						return
					}
					runActiveEditor(activeEditorRef.current, (editor) => {
						editor.commands.focus(undefined, { scrollIntoView: !preventScroll })
						if (isMobile) {
							editor.commands.scrollIntoView()
						}
					})
				},
			)

			const loadDraftReady = useMemoizedFn(() => {
				return store.draftStore.waitForLoadDraft()
			})

			const saveSuperMagicTopicModel = useMemoizedFn(
				({
					selectedTopic: topic,
					model,
					imageModel,
					videoModel,
				}: {
					selectedTopic: Topic
					model: ModelItem
					imageModel: ModelItem | null
					videoModel?: ModelItem | null
				}) => {
					superMagicTopicModelService.saveModel(
						topic?.id,
						selectedProject?.id || "",
						model,
						imageModel,
						videoModel,
						store.topicModelStore,
					)
				},
			)

			const setModels = useMemoizedFn(
				({
					languageModel,
					imageModel,
					videoModel,
				}: {
					languageModel?: ModelItem | null
					imageModel?: ModelItem | null
					videoModel?: ModelItem | null
				}) => {
					superMagicTopicModelService.saveModel(
						selectedTopic?.id || "",
						selectedProject?.id || "",
						languageModel,
						imageModel,
						videoModel,
						store.topicModelStore,
					)
				},
			)

			useMessageEditorImperativeRef({
				ref,
				tiptapEditor,
				canSendMessage,
				files,
				clearFiles,
				store,
				clearContent,
				clearContentAfterSend,
				updateContent,
				focus,
				addFiles,
				loadDraftReady,
				saveSuperMagicTopicModel,
				setModels,
			})

			const { handleInterrupt } = useTaskInterrupt({
				selectedTopic: selectedTopic ?? null,
				userId: userStore.user.userInfo?.user_id,
				isStopping: store.stopEventLoading,
				setIsStopping: store.setStopEventLoading,
			})
			const effectiveHandleInterrupt = onInterrupt ?? handleInterrupt
			const effectiveStopEventLoading = stopEventLoading ?? store.stopEventLoading

			const handleFileUploadClick = useCallback(
				(files: FileList) => {
					const fileArray = Array.from(files)
					addFiles(fileArray)
				},
				[addFiles],
			)

			const ensureProjectContextForPastedText = useMemoizedFn(async () => {
				if (selectedProject?.id) {
					return selectedProject
				}

				const ensuredProject = await onEnsureProject?.()
				if (ensuredProject?.id) {
					fileUploadStore.updateOptions({ projectId: ensuredProject.id })
				}

				return ensuredProject ?? null
			})

			const handlePaste = useCallback(
				(e: ClipboardEvent) => {
					const clipboardData = e.clipboardData
					if (!clipboardData) return
					const nativeEvent = e.nativeEvent
					const hasCanvasMime = hasCanvasClipboardMimeType(nativeEvent)
					const nativeFiles = CanvasDesignClipboard.readAllEventFilesSnapshot(nativeEvent)

					if (hasCanvasMime && !uploadEnabled) {
						if (!claimCanvasClipboardPasteEvent(nativeEvent)) return
						e.preventDefault()
						e.stopPropagation()
						return
					}

					if (
						hasCanvasMime ||
						(nativeFiles.length === 0 &&
							!Array.from(clipboardData.types).some((type) => {
								const normalized = type.trim().toLowerCase()
								return normalized === "text/plain" || normalized === "text/html"
							}))
					) {
						const existingResourceKeys = collectMentionItemsFromEditor().flatMap(
							(item) => {
								const data = item.attrs.data as {
									file_id?: string
									file_path?: string
									relative_file_path?: string
								}
								return [
									data.file_id,
									data.file_path,
									data.relative_file_path,
								].filter((value): value is string => Boolean(value?.trim()))
							},
						)
						void getCanvasClipboardPasteController().paste(
							nativeEvent,
							{
								control: "message-editor",
								acceptedTypes: ["image", "video", "audio"],
								projectId: selectedProject?.id ?? selectedTopic?.project_id,
								hasProjectContext: isProjectContext,
								maxCount: Math.max(
									0,
									fileUploadStore.maxUploadCount - fileUploadStore.files.length,
								),
								existingResourceKeys,
								sessionId: getCanvasClipboardSessionId(),
							},
							{
								onAsset: async (asset: CanvasClipboardAsset) => {
									if (
										asset.reference?.kind === "project" &&
										asset.reference.fileId &&
										asset.reference.projectPath
									) {
										const fileName = asset.reference.fileName || asset.fileName
										const fileExtension = fileName.split(".").pop() ?? ""
										const mention: TiptapMentionAttributes = {
											type: MentionItemType.PROJECT_FILE,
											data: {
												file_id: asset.reference.fileId,
												file_name: fileName,
												file_path: asset.reference.projectPath,
												relative_file_path: asset.reference.projectPath,
												file_extension: fileExtension,
												file_size: 0,
												project_id:
													selectedProject?.id ??
													selectedTopic?.project_id,
											},
										}
										tiptapEditorRef.current?.commands.insertContent({
											type: "mention",
											attrs: mention,
										})
										store.fileUploadStore.addPendingProjectFileReferences([
											mention,
										])
										onMentionInsertItems?.([mention])
										return
									}
									if (!asset.file) return
									if (asset.file.size > fileUploadStore.maxUploadSize) {
										throw new Error("file-size-limit")
									}
									await _addFiles([asset.file], undefined, {
										useTempDirectory: true,
										isCanvasClipboard: true,
									})
								},
								isSessionCurrent: (sessionId) =>
									isMountedRef.current &&
									sessionId === getCanvasClipboardSessionId(),
							},
						)
						return
					}

					const files = nativeFiles

					if (uploadEnabled && files.length > 0) {
						if (!claimCanvasClipboardPasteEvent(nativeEvent)) return
						e.preventDefault()
						e.stopPropagation()
						addFiles(files)
						return
					}

					if (!uploadEnabled || !shouldEnableMention) return
					if (!shouldConvertPastedTextToAttachment(clipboardData)) return
					if (!claimCanvasClipboardPasteEvent(nativeEvent)) return

					const text = clipboardData.getData("text/plain")
					const textFile = createPastedTextFile({ text })
					e.preventDefault()
					e.stopPropagation()
					// Keep long-text paste automatic; the upload flow inserts the file mention immediately.
					void (async () => {
						await ensureProjectContextForPastedText()
						await _addFiles([textFile], undefined, { useTempDirectory: true })
					})()
				},
				[
					_addFiles,
					addFiles,
					collectMentionItemsFromEditor,
					getCanvasClipboardSessionId,
					ensureProjectContextForPastedText,
					fileUploadStore,
					isProjectContext,
					onMentionInsertItems,
					selectedProject?.id,
					selectedTopic?.project_id,
					shouldEnableMention,
					store.fileUploadStore,
					uploadEnabled,
				],
			)

			const handleSelectMentionItem = useMemoizedFn(
				async (item: TiptapMentionAttributes, context?: MentionSelectContext) => {
					if (!item.data) return
					if (item.type === MentionItemType.MCP && !context?.mcpValidated) {
						store.editorStore.setOAuthInProgress(true)
						try {
							const res = await checkMCPOAuth(item.data as McpMentionData)
							if (res === MCPOAuthType.validationFailed) {
								return
							}
							void mentionPanelStore.dispatch({
								kind: "effect",
								effect: "refresh-mcp",
							})
						} finally {
							store.editorStore.setOAuthInProgress(false)
						}
					}

					runActiveEditor(activeEditorRef.current, (editor) => {
						editor.commands.insertContent({
							type: "mention",
							attrs: item,
						})
					})
				},
			)

			const handleProjectFileMentionClick = useMemoizedFn((target: EventTarget | null) => {
				const targetElement =
					target instanceof HTMLElement
						? target
						: target instanceof Text
							? target.parentElement
							: null

				const mentionElement = targetElement?.closest(
					"[data-mention-suggestion-char]",
				) as HTMLElement | null

				if (
					!mentionElement ||
					mentionElement.dataset.type !== MentionItemType.PROJECT_FILE
				) {
					return false
				}

				try {
					const data = JSON.parse(mentionElement.dataset.data || "{}")
					if (openMessageFile(data)) {
						return true
					}

					onFileClick?.(data)
					return true
				} catch (error) {
					console.error(error)
					return false
				}
			})

			useEffect(() => {
				const handleNativeClick = (event: MouseEvent) => {
					handleProjectFileMentionClick(event.target)
				}

				let currentEditorDom: HTMLElement | null = null
				const frameId = window.requestAnimationFrame(() => {
					currentEditorDom = domRef.current?.querySelector(".ProseMirror") ?? null
					currentEditorDom?.addEventListener("click", handleNativeClick, true)
				})

				return () => {
					window.cancelAnimationFrame(frameId)
					currentEditorDom?.removeEventListener("click", handleNativeClick, true)
				}
			}, [domRef, handleProjectFileMentionClick, tiptapEditor])

			const handleCompositionStart = useMemoizedFn(() => {
				store.editorStore.handleCompositionStart()
				AiCompletionService.onCompositionStart()
			})

			const handleCompositionEnd = useMemoizedFn(() => {
				store.editorStore.handleCompositionEnd()

				setTimeout(() => {
					store.draftStore.saveDraft({
						value: store.editorStore.value,
					})
				})

				AiCompletionService.onCompositionEnd()
			})

			const buttonContext = useMessageEditorToolbarContext({
				voiceInputRef,
				tiptapEditor,
				iconSize,
				topBarIconSize,
				size,
				value: store.editorStore.value,
				draftStore: store.draftStore,
				fileUploadStore: store.fileUploadStore,
				shouldEnableMention,
				uploadEnabled,
				sendEnabled,
				sendButtonDisabled,
				sendButtonLoading,
				showLoading,
				isTaskRunning,
				isUploadingFiles: !isAllFilesUploaded,
				voiceInputEnabled,
				stopEventLoading: effectiveStopEventLoading,
				isEditingQueueItem: isEditingQueueItem ?? false,
				selectedTopic,
				selectedProject,
				topicMode: resolveModelTopicMode(topicMode, modelTopicMode),
				mentionPanelStore,
				mcpButtonConfig,
				handleSelectMentionItem,
				handleFileUploadClick,
				handleRemoveUploadedFile,
				handleSend,
				handleInterrupt: effectiveHandleInterrupt,
				handleCompressContext,
				editorModeSwitch,
				modelSwitch,
				t,
				updateEditorValue,
			})

			const {
				topBarLeftContent,
				topBarRightContent,
				bottomLeftContent,
				bottomRightContent,
				outsideBottomContent,
				outsideTopContent,
			} = useEditorSlotContent({
				layoutConfig: effectiveLayoutConfig,
				buttonContext,
				size,
			})

			return (
				<MessageEditorContainerView
					parentStore={parentStore}
					store={store}
					className={className}
					containerClassName={containerClassName}
					size={size}
					tiptapEditor={tiptapEditor}
					domRef={domRef}
					isDragOver={isDragOver}
					dragEvents={dragEvents}
					onPaste={handlePaste}
					onCompositionStart={handleCompositionStart}
					onCompositionEnd={handleCompositionEnd}
					topBarLeftContent={topBarLeftContent}
					topBarRightContent={topBarRightContent}
					bottomLeftContent={bottomLeftContent}
					bottomRightContent={bottomRightContent}
					outsideBottomContent={outsideBottomContent}
					outsideTopContent={outsideTopContent}
					uploadModal={uploadModal}
					promptCarouselNode={promptCarouselNode}
					showAiCompletion={effectiveAiCompletionEnabled}
				/>
			)
		},
	),
)
