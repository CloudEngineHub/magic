import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ClipboardEvent,
	type CSSProperties,
	type MutableRefObject,
} from "react"
import { ArrowUp, LoaderCircle } from "lucide-react"
import { useCanvas } from "../../../../app/providers/CanvasProvider"
import { useCanvasModeUI } from "../../../../app/providers/CanvasUIProvider"
import { useCanvasDesignI18n } from "../../../../app/providers/I18nProvider"
import { useHostUiLocale } from "../../../../app/providers/HostUiLocaleProvider"
import { useMagic } from "../../../../app/providers/MagicProvider"
import type { ImageElement } from "../../../../runtime/document/types"
import type {
	ReferenceResourceFileInfo,
	ReferenceResourceSourceType,
} from "../../../editors/message/reference-assets/reference-resource.types"
import type {
	ReferenceResourcePanelItem,
	ReferenceResourcePanelSelectContext,
} from "../../../../public/props"
import MessageEditor, {
	type MessageEditorMentionChangeContext,
	type MessageEditorRef,
} from "../../../editors/message/MessageEditor"
import { applyRichMessageClipboardParts } from "../../../editors/message/applyRichMessageClipboardParts"
import type { RichMessageClipboardSession } from "../../../editors/message/applyRichMessageClipboardParts"
import { enrichCanvasMentionForClipboard } from "../../../../runtime/resources/clipboard/enrichCanvasMentionForClipboard"
import { useCanvasReferenceMention } from "../../../editors/message/useCanvasReferenceMention"
import { useMentionSync } from "../../../editors/message/useMentionSync"
import { removeMentionFromString } from "../../../editors/message/tiptap/contentUtils"
import { ReferenceResourceDropSurface } from "../../../editors/message/reference-assets/ReferenceResourceDropSurface"
import {
	createReferenceResourcePanelItemFromDropFile,
	createReferenceResourcePanelItemFromPath,
	createUploadFileResponseFromPanelItem,
} from "../../../editors/message/reference-assets/createReferenceResourcePanelItem"
import {
	checkLocalReferenceResourceDrop,
	checkProjectReferenceResourceDrop,
	getReferenceResourceHoverState,
	getReferenceResourceLocalHoverState,
	normalizeProjectDropFilesForStorage,
	REFERENCE_RESOURCE_DROP_STATUS,
	type ReferenceDropProjectFile,
	useReferenceResourceDrop,
} from "../../../editors/message/reference-assets/useReferenceResourcePanelDataService"
import useElementPositionEffect from "../../../../app/hooks/layout/useElementPositionEffect"
import { useFloatingComponent } from "../../../../app/hooks/layout/useFloatingComponent"
import { Button } from "../../../primitives/shadcn/button"
import { FloatingSurfaceScope } from "../../../primitives/shadcn/popover"
import { useBottomFloatingSurface } from "../../../../app/providers/BottomFloatingStackProvider"
import ImageEditorControls from "./ImageEditorControls"
import type { ImageEditorConfig } from "./useImageEditorConfig"
import styles from "./index.module.css"
import type { MediaResourceFullscreenPreviewItem } from "../../../fullscreen/media-resource/index"
import LinkedEditorInputsBar from "../../../editors/connection/LinkedEditorInputsBar"
import type { LinkedEditorInputsState } from "../../../editors/connection/useLinkedEditorInputs"
import { useLinkedMediaAssociationController } from "../../../editors/connection/useLinkedMediaAssociationController"
import { composePromptWithLinkedText } from "../../../editors/connection/linkedTextPrompt"
import {
	mergeLinkedMediaPathsWithResolver,
	type LinkedEditorMediaPolicy,
} from "../../../editors/connection/linkedEditorInputs"
import { buildImageRequestWithLinkedEditorInputs } from "../../../editors/connection/linkedImageRequest"
import PromptOptimizationButton from "../../../editors/prompt-optimization/PromptOptimizationButton"
import {
	buildPromptOptimizationUserPrompt,
	resolvePromptOptimizationOutputLanguage,
	type PromptOptimizationReferenceContext,
} from "../../../editors/prompt-optimization/promptOptimizationUserPrompt"
import type {
	CompleteImagePromptRequest,
	GenerateImageRequest,
} from "../../../../public/magic-types"
import type { ResolveCanvasResourceReference } from "../../../../public/resource-reference"
import type { Canvas } from "../../../../runtime/core/Canvas"
import { ImageElement as ImageElementInstance } from "../../../../runtime/elements/image/ImageElement"
import {
	areCanvasResourceReferencesSame,
	getCanvasResourceAvailability,
	getCanvasResourceFileName,
} from "../../../../runtime/shared/path/canvasResourcePath"
import { CanvasDesignClipboard } from "../../../../runtime/resources/clipboard/CanvasDesignClipboard"
import {
	claimCanvasClipboardPasteEvent,
	getCanvasClipboardPasteController,
	hasCanvasClipboardMimeType,
	hasMessageClipboardData,
	hasCanvasClipboardTextOrHtml,
	type CanvasClipboardAsset,
} from "../../../../runtime/resources/clipboard/CanvasClipboardPasteController"
import { collectImageEditorExistingClipboardResourceKeys } from "../../../../runtime/resources/clipboard/collectMediaEditorExistingClipboardResourceKeys"

import {
	createPromptPlaceholderTokenFactory,
	resolvePromptPlaceholderTokenConfig,
} from "../../../editors/message/reference-assets/promptPlaceholderTokenConfig"

interface ImageEditorSurfaceProps {
	readOnly?: boolean
	imageElement: ImageElement
	config: ImageEditorConfig
	editorRef: MutableRefObject<MessageEditorRef | null>
	shouldShow: () => boolean
	floatingId: string
	selectionPersistenceKey: string
	placeholder: string
	onSend: (linkedEditorInputs: LinkedEditorInputsState) => void | Promise<void>
	isSending: boolean
	autoFocus?: boolean
	autoFocusAtDocumentEnd?: boolean
	isDropEnabled?: boolean
	showRestoreDefaultConfig?: boolean
	onRestoreDefaultConfig?: () => void
	className?: string
	style?: CSSProperties
	onPreviewMediaResource?: (resource: MediaResourceFullscreenPreviewItem) => void
	isMediaResourcePreviewOpen?: boolean
}

/** 只有权威 resolver 确认删除的引用阻塞提交；上传 pending 窗口内保持可恢复。 */
export function hasDeletedReference(
	paths: string[],
	canvas: Pick<Canvas, "canvasFileUploadManager"> | null | undefined,
	resolveResourceReference?: ResolveCanvasResourceReference,
): boolean {
	return paths.some((path) => {
		if (canvas?.canvasFileUploadManager.isPendingResourcePath(path)) return false
		return getCanvasResourceAvailability(path, resolveResourceReference) === "deleted"
	})
}

export default function ImageEditorSurface(props: ImageEditorSurfaceProps) {
	const {
		imageElement,
		readOnly = false,
		config,
		editorRef,
		shouldShow,
		floatingId,
		selectionPersistenceKey,
		placeholder,
		onSend,
		isSending,
		autoFocus,
		autoFocusAtDocumentEnd,
		isDropEnabled = true,
		showRestoreDefaultConfig = false,
		onRestoreDefaultConfig,
		className,
		style,
		onPreviewMediaResource,
		isMediaResourcePreviewOpen = false,
	} = props
	const { canvas } = useCanvas()
	const imageInstance = canvas?.elementManager.getElementInstance(imageElement.id)
	const isGenerating =
		imageInstance instanceof ImageElementInstance &&
		imageInstance.getDisplayState().status === "generating"
	const { methods } = useMagic()
	const { setEditingElementId } = useCanvasModeUI()

	useEffect(() => {
		setEditingElementId(imageElement.id)
		return () => setEditingElementId(null)
	}, [imageElement.id, setEditingElementId])
	const resolveResourceReference =
		methods?.resolveResourceReference ??
		canvas?.magicConfigManager.config?.methods?.resolveResourceReference
	const enrichClipboardMentionAttrs = useCallback(
		(attrs: Parameters<typeof enrichCanvasMentionForClipboard>[0]) =>
			enrichCanvasMentionForClipboard(attrs, resolveResourceReference),
		[resolveResourceReference],
	)
	const clipboardEpochRef = useRef(0)
	const clipboardSessionIdRef = useRef("")
	const getClipboardSessionId = useCallback(
		() =>
			[
				imageElement.id,
				imageElement.activeContentId ?? "",
				config.selectedModelId ?? "",
				config.selectedReferenceSlot?.slotKey ??
					(config.selectedReferenceSlot
						? `index-${config.selectedReferenceSlot.slotIndex}`
						: ""),
				config.selectedReferenceSlot?.slotIndex ?? "",
				config.selectedReferenceSlot?.path ?? "",
				clipboardEpochRef.current,
			].join(":"),
		[
			config.selectedModelId,
			config.selectedReferenceSlot,
			imageElement.activeContentId,
			imageElement.id,
		],
	)
	clipboardSessionIdRef.current = getClipboardSessionId()
	const isMountedRef = useRef(false)
	useEffect(() => {
		isMountedRef.current = true
		return () => {
			isMountedRef.current = false
		}
	}, [])
	useEffect(() => {
		if (!isSending) return
		clipboardEpochRef.current += 1
		clipboardSessionIdRef.current = getClipboardSessionId()
	}, [getClipboardSessionId, isSending])
	const { t } = useCanvasDesignI18n()
	const hostUiLocale = useHostUiLocale()
	const [hasScrollbar, setHasScrollbar] = useState(false)
	const [hoveredMentionPath, setHoveredMentionPath] = useState<string | null>(null)
	const [sourceListContainer, setSourceListContainer] = useState<HTMLDivElement | null>(null)
	const [, forceResourceStateRefresh] = useState(0)
	const {
		prompt,
		handlers,
		fileInputRef,
		fileInputAccept,
		isReferencePolicyReady,
		maxReferenceFiles,
		currentReferenceFiles,
		isReferenceFileLimitReached,
	} = config
	const clipboardHandlersRef = useRef(handlers)
	clipboardHandlersRef.current = handlers
	const richClipboardSessionRef = useRef<RichMessageClipboardSession | null>(null)
	const linkedMediaPolicy = useMemo<LinkedEditorMediaPolicy>(() => {
		const maxCount = maxReferenceFiles ?? 0
		return {
			supportedKinds: maxCount > 0 ? ["image"] : [],
			manualReferences: currentReferenceFiles.map((path) => ({
				kind: "image",
				path,
			})),
			maxTotalCount: maxCount,
			maxCountByKind: { image: maxCount },
		}
	}, [currentReferenceFiles, maxReferenceFiles])
	const {
		linkedEditorInputs,
		handleMentionChange: handleAssociationMentionChange,
		handleLinkedMediaSelectionChange,
	} = useLinkedMediaAssociationController({
		readOnly,
		targetElementId: imageElement.id,
		targetKind: "image",
		mediaPolicy: linkedMediaPolicy,
		mediaPolicyStatus: isReferencePolicyReady ? "ready" : "loading",
		editorRef,
		onReadyMentionChange: config.handlers.handlePromptReferencePathsChange,
		resolveResourceReference,
	})
	const promptPlaceholderTokenConfig = useMemo(() => resolvePromptPlaceholderTokenConfig(t), [t])
	const buildImagePromptPlaceholderToken = useMemo(
		() =>
			createPromptPlaceholderTokenFactory(
				promptPlaceholderTokenConfig.imageLabel,
				promptPlaceholderTokenConfig,
			),
		[promptPlaceholderTokenConfig],
	)
	const linkedActiveImagePaths = useMemo(
		() =>
			linkedEditorInputs.activeMediaReferences
				.filter((reference) => reference.kind === "image")
				.map((reference) => reference.path),
		[linkedEditorInputs.activeMediaReferences],
	)
	const effectiveCurrentReferenceFiles = useMemo(
		() =>
			mergeLinkedMediaPathsWithResolver(
				resolveResourceReference,
				currentReferenceFiles,
				linkedActiveImagePaths,
			),
		[currentReferenceFiles, linkedActiveImagePaths, resolveResourceReference],
	)
	useEffect(() => {
		if (!canvas) return
		return canvas.eventEmitter.on("upload:resource-pending-change", ({ data }) => {
			const affectsReference = data.paths.some((path) =>
				effectiveCurrentReferenceFiles.some((referencePath) =>
					areCanvasResourceReferencesSame(referencePath, path, resolveResourceReference),
				),
			)
			if (!affectsReference) return
			forceResourceStateRefresh((revision) => revision + 1)
		})
	}, [canvas, effectiveCurrentReferenceFiles, resolveResourceReference])
	const containsDeletedReference = hasDeletedReference(
		effectiveCurrentReferenceFiles,
		canvas,
		resolveResourceReference,
	)
	const canSendPrompt = Boolean(
		!config.isUploading &&
		!editorRef.current?.hasPendingUploadMentions?.() &&
		composePromptWithLinkedText(linkedEditorInputs.textPrompt, prompt).trim(),
	)
	const promptOptimizationPlaceholderPaths = useMemo(
		() => ({ image: effectiveCurrentReferenceFiles }),
		[effectiveCurrentReferenceFiles],
	)
	const effectiveIsReferenceFileLimitReached =
		maxReferenceFiles !== undefined &&
		effectiveCurrentReferenceFiles.length >= maxReferenceFiles

	const { matchableItems, mentionDataService, mentionExtension, mentionEnabled } =
		useCanvasReferenceMention({
			matchableItems: config.matchableItems,
			maxReferenceFiles,
			currentReferenceFiles: effectiveCurrentReferenceFiles,
			isReferenceFileLimitReached:
				isReferenceFileLimitReached || effectiveIsReferenceFileLimitReached,
			referenceResourceType: config.referenceResourceType,
		})

	const { syncMentionPaths } = useMentionSync({
		canvas,
		elementId: imageElement.id,
		matchableItems,
		maxReferenceFiles,
		isReferenceFileLimitReached,
		syncFromElement: config.handlers.syncReferenceFilesFromElement,
		protectedReferencePaths: config.protectedReferencePaths,
	})
	const { stackOffset, containerRef: stackRef } = useBottomFloatingSurface({
		surfaceId: floatingId,
		elementId: imageElement.id,
		order: 1,
		enabled: true,
	})

	const { containerRef } = useElementPositionEffect({
		position: "bottom",
		offset: 12 + stackOffset,
		shouldShow,
	})

	const { containerRef: floatingRef } = useFloatingComponent({
		id: floatingId,
		interactive: true,
		enableWheelForwarding: !hasScrollbar,
	})

	const setRefs = useCallback(
		(node: HTMLDivElement | null) => {
			containerRef.current = node
			floatingRef.current = node
			stackRef(node)
		},
		[containerRef, floatingRef, stackRef],
	)

	const handleSelectSource = useCallback(
		(source: ReferenceResourceSourceType) => {
			if (source !== "local-upload") return
			handlers.setPopoverOpen(false)
			if (
				!config.selectedReferenceSlot?.path &&
				(config.isReferenceFileLimitReached || effectiveIsReferenceFileLimitReached)
			) {
				return
			}
			handlers.triggerFileSelect()
		},
		[
			config.isReferenceFileLimitReached,
			config.selectedReferenceSlot?.path,
			effectiveIsReferenceFileLimitReached,
			handlers,
		],
	)

	const handleProjectSelect = useCallback(
		(item: ReferenceResourcePanelItem, context?: ReferenceResourcePanelSelectContext) => {
			const selectedSlot = config.selectedReferenceSlot
			if (selectedSlot?.path) {
				handlers.replaceReferenceFileAt(selectedSlot.slotIndex, {
					path: item.data.file_path,
					src: item.data.file_path,
					fileName: item.data.file_name,
				})
				context?.reset?.()
				return
			}
			editorRef.current?.insertMentionItems([item])
		},
		[config.selectedReferenceSlot, editorRef, handlers],
	)

	const canAcceptReferenceDrop =
		!config.isUploading && Boolean(maxReferenceFiles && maxReferenceFiles > 0)

	const canAcceptProjectFiles = useCallback(
		(files: ReferenceDropProjectFile[]) => {
			if (!resolveResourceReference) {
				return { accepted: false, status: REFERENCE_RESOURCE_DROP_STATUS.notAvailable }
			}
			return checkProjectReferenceResourceDrop({
				isDropEnabled: canAcceptReferenceDrop,
				files,
				matchableItems,
				currentReferenceFiles: effectiveCurrentReferenceFiles,
				maxReferenceFiles,
				resolveResourceReference,
			})
		},
		[
			canAcceptReferenceDrop,
			matchableItems,
			effectiveCurrentReferenceFiles,
			maxReferenceFiles,
			resolveResourceReference,
		],
	)

	const canAcceptLocalFiles = useCallback(
		(files: File[]) => {
			return checkLocalReferenceResourceDrop({
				isDropEnabled: canAcceptReferenceDrop,
				files,
				accept: fileInputAccept,
				currentReferenceFileCount: effectiveCurrentReferenceFiles.length,
				maxReferenceFiles,
			})
		},
		[
			canAcceptReferenceDrop,
			fileInputAccept,
			maxReferenceFiles,
			effectiveCurrentReferenceFiles,
		],
	)

	const getHoverDropState = useCallback(
		() =>
			getReferenceResourceHoverState({
				isDropEnabled: canAcceptReferenceDrop,
				currentReferenceFileCount: effectiveCurrentReferenceFiles.length,
				maxReferenceFiles,
			}),
		[canAcceptReferenceDrop, maxReferenceFiles, effectiveCurrentReferenceFiles],
	)

	const getLocalHoverState = useCallback(
		(dataTransfer: DataTransfer | null) =>
			getReferenceResourceLocalHoverState({
				isDropEnabled: canAcceptReferenceDrop,
				dataTransfer,
				accept: fileInputAccept,
				currentReferenceFileCount: effectiveCurrentReferenceFiles.length,
				maxReferenceFiles,
			}),
		[
			canAcceptReferenceDrop,
			fileInputAccept,
			maxReferenceFiles,
			effectiveCurrentReferenceFiles,
		],
	)

	const handleProjectFilesDrop = useCallback(
		(files: ReferenceDropProjectFile[]) => {
			if (!resolveResourceReference) return
			const normalizedFiles = normalizeProjectDropFilesForStorage(files, {
				resolveResourceReference,
			})
			editorRef.current?.insertMentionItems(
				normalizedFiles.map((file) => createReferenceResourcePanelItemFromDropFile(file)),
			)
		},
		[editorRef, resolveResourceReference],
	)

	const handleLocalFilesDrop = useCallback(
		(files: File[]) => {
			void handlers.uploadFiles(files)
		},
		[handlers],
	)

	const handlePaste = useCallback(
		(event: ClipboardEvent<HTMLDivElement>) => {
			if (readOnly) {
				event.preventDefault()
				event.stopPropagation()
				return
			}
			const nativeEvent = event.nativeEvent
			const files = CanvasDesignClipboard.readEventFilesSnapshot(nativeEvent)
			const nativeFiles = CanvasDesignClipboard.readAllEventFilesSnapshot(nativeEvent)
			const hasCanvasMime = hasCanvasClipboardMimeType(nativeEvent)
			const hasMessageClipboard = hasMessageClipboardData(nativeEvent)
			const hasTextOrHtml = hasCanvasClipboardTextOrHtml(nativeEvent)
			// Unsupported native files (for example PDF) must retain the previous
			// editor/browser behavior. Only media files are owned by this editor.
			if (!hasCanvasMime && nativeFiles.length > 0 && files.length === 0) {
				return
			}
			if (!hasCanvasMime && files.length > 0) {
				if (!canAcceptLocalFiles(files).accepted) {
					return
				}
				if (!claimCanvasClipboardPasteEvent(nativeEvent)) {
					return
				}
				event.preventDefault()
				event.stopPropagation()
				void clipboardHandlersRef.current.uploadFiles(files)
				return
			}
			if (!hasCanvasMime && !hasMessageClipboard && files.length === 0 && hasTextOrHtml) {
				return
			}
			const remainingCapacity =
				maxReferenceFiles === undefined
					? undefined
					: Math.max(
							0,
							maxReferenceFiles -
								effectiveCurrentReferenceFiles.length +
								(config.selectedReferenceSlot?.path ? 1 : 0),
						)
			const selectedSlotForPaste = config.selectedReferenceSlot
			const pasteSelection = editorRef.current?.getSelectionRange?.() ?? undefined
			let pastedAssetIndex = 0
			const pasteSessionId = getClipboardSessionId()
			const existingResourceKeys = collectImageEditorExistingClipboardResourceKeys({
				referencePaths: effectiveCurrentReferenceFiles,
				referenceFileInfos: config.referenceFileInfos,
				mentionBindings: config.mentionBindings,
				resolveResourceReference,
			})

			void getCanvasClipboardPasteController(
				canvas?.magicConfigManager.config?.methods,
			).paste(
				nativeEvent,
				{
					control: "image-editor",
					acceptedTypes: ["image"],
					messagePasteMode: "rich-text-with-media",
					projectId:
						canvas?.magicConfigManager.config?.methods?.getCanvasClipboardContext?.()
							.projectId,
					canvasId: canvas?.id,
					maxCount: remainingCapacity,
					maxCountByType: { image: remainingCapacity },
					existingResourceKeys,
					sessionId: pasteSessionId,
				},
				{
					onMessageParts: async (parts) => {
						const session = await applyRichMessageClipboardParts({
							parts,
							editor: editorRef.current,
							controller: clipboardHandlersRef.current.uploadMentionController,
							selection: pasteSelection,
							isSessionCurrent: () =>
								isMountedRef.current &&
								pasteSessionId === clipboardSessionIdRef.current,
							registerPendingResourcePath: (path) => {
								canvas?.canvasFileUploadManager.registerPendingResourcePath(path)
							},
							replaceSelectedSlot: selectedSlotForPaste
								? (fileInfo, options) => {
										clipboardHandlersRef.current.replaceReferenceFileAt(
											selectedSlotForPaste.slotIndex,
											fileInfo,
											{ retainReferenceSlot: options?.retainReferenceSlot },
										)
									}
								: undefined,
							uploadFiles: (files, options) =>
								clipboardHandlersRef.current.uploadFiles(files, options),
						})
						richClipboardSessionRef.current = session
					},
					onMessageAssetResolved: async (occurrenceKey, asset) => {
						const session = richClipboardSessionRef.current
						if (!session) return
						if (!asset) {
							session.failOccurrence(occurrenceKey)
							return
						}
						await session.resolveOccurrence(occurrenceKey, asset)
					},
					onAsset: async (asset: CanvasClipboardAsset) => {
						if (asset.reference?.kind === "current-canvas") {
							if (asset.reference.awaitingAttachmentConfirmation) {
								canvas?.canvasFileUploadManager.registerPendingResourcePath(
									asset.reference.path,
								)
							}
							const item = createReferenceResourcePanelItemFromPath(
								asset.reference.path,
								asset.reference.fileName,
								{ fileId: asset.reference.fileId },
							)
							if (selectedSlotForPaste && pastedAssetIndex === 0) {
								clipboardHandlersRef.current.replaceReferenceFileAt(
									selectedSlotForPaste.slotIndex,
									createUploadFileResponseFromPanelItem(item),
									{ retainReferenceSlot: true },
								)
							} else {
								editorRef.current?.insertMentionItems([item])
							}
							pastedAssetIndex += 1
							return
						}
						if (!asset.file) return
						const isFirstAsset = pastedAssetIndex === 0
						await clipboardHandlersRef.current.uploadFiles([asset.file], {
							ignoreSelectedReferenceSlot: !isFirstAsset,
							retainSelectedReferenceSlot: Boolean(selectedSlotForPaste),
							isCurrent: () =>
								isMountedRef.current &&
								pasteSessionId === clipboardSessionIdRef.current,
						})
						pastedAssetIndex += 1
					},
					onSettled: () => {
						if (selectedSlotForPaste) {
							clipboardHandlersRef.current.resetSelectedReferenceSlot(
								selectedSlotForPaste,
							)
						}
					},
					isSessionCurrent: (sessionId: string) =>
						isMountedRef.current && sessionId === clipboardSessionIdRef.current,
				},
			)
		},
		[
			canAcceptLocalFiles,
			canvas?.id,
			canvas?.canvasFileUploadManager,
			canvas?.magicConfigManager.config?.methods,
			getClipboardSessionId,
			config.selectedReferenceSlot,
			editorRef,
			maxReferenceFiles,
			effectiveCurrentReferenceFiles,
			config.mentionBindings,
			config.referenceFileInfos,
			resolveResourceReference,
			readOnly,
		],
	)

	const { overlayState, dragEvents } = useReferenceResourceDrop({
		isEnabled: isDropEnabled && !readOnly,
		checkProjectFiles: canAcceptProjectFiles,
		checkLocalFiles: canAcceptLocalFiles,
		getProjectHoverState: getHoverDropState,
		getLocalHoverState,
		onDropProjectFiles: handleProjectFilesDrop,
		onDropLocalFiles: handleLocalFilesDrop,
	})

	const handleMentionChange = useCallback(
		(paths: string[], currentPrompt: string, context: MessageEditorMentionChangeContext) => {
			if (readOnly) return
			const currentMentionBindings = editorRef.current?.getMentionBindings()
			if (currentMentionBindings) handlers.updateMentionBindings(currentMentionBindings)
			if (handleAssociationMentionChange(paths, currentPrompt, context)) {
				syncMentionPaths(paths, currentPrompt, context)
			}
		},
		[editorRef, handleAssociationMentionChange, handlers, syncMentionPaths, readOnly],
	)

	const handleReferenceFileRemoveFromPopover = useCallback(
		(path: string) => {
			const currentPrompt = editorRef.current?.getCurrentPrompt() ?? prompt
			const fileName =
				config.referenceFileInfos.find((info) =>
					areCanvasResourceReferencesSame(info.path, path, resolveResourceReference),
				)?.fileName ?? getCanvasResourceFileName(path)
			handlers.setPrompt(removeMentionFromString(currentPrompt, path, fileName))
			handlers.handleReferenceFileRemove(path)
		},
		[config.referenceFileInfos, editorRef, handlers, prompt, resolveResourceReference],
	)

	const handleSend = useCallback(() => {
		if (!readOnly) return onSend(linkedEditorInputs)
	}, [linkedEditorInputs, onSend, readOnly])

	const buildPromptOptimizationRequest = useCallback(() => {
		const currentPrompt = prompt.trim()
		const baseRequest = handlers.buildRequestParams() as GenerateImageRequest
		const request = buildImageRequestWithLinkedEditorInputs(
			baseRequest,
			{
				activeMediaReferences: linkedEditorInputs.activeMediaReferences,
				textPrompt: linkedEditorInputs.textPrompt,
			},
			prompt,
			resolveResourceReference,
		)
		const referenceImages = request.reference_images ?? []
		const encodedPrompt = (request.prompt ?? currentPrompt).trim()
		if (!encodedPrompt && referenceImages.length === 0) return null
		const completionRequest: CompleteImagePromptRequest = {
			user_prompt: buildPromptOptimizationUserPrompt({
				target: "image",
				currentPrompt: encodedPrompt,
				outputLanguage: resolvePromptOptimizationOutputLanguage({
					currentPrompt: encodedPrompt,
					hostUiLocale,
				}),
				referenceImageCount: referenceImages.length,
				references: buildImagePromptOptimizationReferences(
					referenceImages,
					config.referenceFileInfos,
					buildImagePromptPlaceholderToken,
				),
			}),
		}
		if (request.model_id) completionRequest.model_id = request.model_id
		if (referenceImages.length > 0) completionRequest.reference_images = referenceImages
		if (request.reference_image_options) {
			completionRequest.reference_image_options = request.reference_image_options
		}
		return completionRequest
	}, [
		buildImagePromptPlaceholderToken,
		config.referenceFileInfos,
		handlers,
		hostUiLocale,
		linkedEditorInputs.activeMediaReferences,
		linkedEditorInputs.textPrompt,
		prompt,
		resolveResourceReference,
	])

	return (
		<FloatingSurfaceScope id={floatingId}>
			<ReferenceResourceDropSurface
				ref={setRefs}
				className={className ?? styles.imageMessageEditor}
				data-canvas-ui-component
				style={style}
				dropOverlayState={overlayState}
				dragEvents={dragEvents}
			>
				<input
					disabled={readOnly}
					ref={fileInputRef}
					type="file"
					accept={fileInputAccept}
					multiple={!config.selectedReferenceSlot?.path}
					style={{ display: "none" }}
					onChange={handlers.handleFileChange}
				/>
				<div ref={setSourceListContainer} className={styles.sourceListMount} />
				{readOnly ? (
					<div className={styles.readOnlyHeader}>
						<div className={styles.readOnlyStatus}>
							{isGenerating ? (
								<LoaderCircle size={14} className="animate-spin" />
							) : null}
							<span>
								{isGenerating
									? t("image.status.generating", "生成中")
									: t("imageEditor.readOnly", "只读")}
							</span>
						</div>
						<span>{t("imageEditor.readOnlyHint", "可查看和复制提示词及参考图片")}</span>
					</div>
				) : null}
				{!readOnly && linkedEditorInputs?.textConnections.length ? (
					<div className={styles.linkedInputs}>
						<LinkedEditorInputsBar
							textConnections={linkedEditorInputs.textConnections}
							isTextConnectionSelected={linkedEditorInputs.isTextConnectionSelected}
							onTextConnectionSelectedChange={
								linkedEditorInputs.setTextConnectionSelected
							}
							onReorderTextConnections={linkedEditorInputs.reorderTextConnections}
						/>
					</div>
				) : null}
				<div hidden={readOnly && !config.hasGenerationRequest}>
					<MessageEditor
						readOnly={readOnly}
						ref={editorRef}
						autoFocus={autoFocus}
						autoFocusAtDocumentEnd={autoFocusAtDocumentEnd}
						fullWidth
						selectionPersistenceKey={selectionPersistenceKey}
						placeholder={placeholder}
						value={prompt}
						onChange={handlers.setPrompt}
						onEnter={handleSend}
						onScrollbarChange={setHasScrollbar}
						matchableItems={matchableItems}
						mentionBindings={config.mentionBindings}
						mentionDataService={mentionDataService}
						mentionExtension={mentionExtension}
						mentionItemsReady={Boolean(config.hasRestoredRef.current)}
						onMentionChange={handleMentionChange}
						onMentionItemHoverChange={setHoveredMentionPath}
						mentionEnabled={mentionEnabled}
						enrichClipboardMentionAttrs={enrichClipboardMentionAttrs}
						onPasteCapture={handlePaste}
					/>
				</div>
				{readOnly && !config.hasGenerationRequest ? (
					<div className={styles.readOnlyWaiting}>
						{t(
							"imageEditor.parametersPending",
							"生成参数尚未同步，收到后将在这里显示。",
						)}
					</div>
				) : null}
				<ImageEditorControls
					readOnly={readOnly}
					config={config}
					hoveredMentionPath={hoveredMentionPath}
					onSelectSource={handleSelectSource}
					onProjectSelect={handleProjectSelect}
					onReferenceFileRemove={handleReferenceFileRemoveFromPopover}
					linkedMediaItems={readOnly ? undefined : linkedEditorInputs?.mediaItems}
					onLinkedMediaSelectionChange={
						readOnly ? undefined : handleLinkedMediaSelectionChange
					}
					renderPromptOptimizationButton={
						readOnly
							? undefined
							: () => (
									<PromptOptimizationButton
										buildRequest={buildPromptOptimizationRequest}
										referencePrompt={`${linkedEditorInputs.textPrompt}\n${prompt}\n${effectiveCurrentReferenceFiles.join("\n")}`}
										placeholderPaths={promptOptimizationPlaceholderPaths}
										onApply={handlers.setPrompt}
										onPreviewMediaResource={onPreviewMediaResource}
										isMediaResourcePreviewOpen={isMediaResourcePreviewOpen}
									/>
								)
					}
					renderSendButton={() => (
						<Button
							className={styles.sendButton}
							onClick={handleSend}
							disabled={
								readOnly ||
								isSending ||
								!canSendPrompt ||
								!config.selectedModelId ||
								containsDeletedReference
							}
							aria-busy={isSending}
						>
							{isSending ? (
								<LoaderCircle size={16} className="animate-spin" />
							) : (
								<ArrowUp size={16} />
							)}
						</Button>
					)}
					renderRestoreDefaultConfigButton={
						!readOnly && showRestoreDefaultConfig && onRestoreDefaultConfig
							? () => (
									<Button
										variant="ghost"
										className={styles.restoreDefaultButton}
										onClick={onRestoreDefaultConfig}
										data-testid="image-editor-re-enter"
									>
										{t("imageEditor.reEnter", "重新输入")}
									</Button>
								)
							: undefined
					}
					sourceListContainer={sourceListContainer}
				/>
			</ReferenceResourceDropSurface>
		</FloatingSurfaceScope>
	)
}

function buildImagePromptOptimizationReferences(
	referenceImages: string[],
	referenceFileInfos: ReferenceResourceFileInfo[],
	buildToken: (index: number) => string,
): PromptOptimizationReferenceContext[] {
	const fileNameByPath = new Map(
		referenceFileInfos.map((info) => [info.path, info.fileName || ""]),
	)
	return referenceImages.map((path, index) => ({
		kind: "image",
		placeholder: buildToken(index + 1),
		label: `图片参考 ${index + 1}`,
		fileName: fileNameByPath.get(path) || getCanvasResourceFileName(path) || path,
		isVisualInput: true,
		visualReferenceIndex: index + 1,
	}))
}
