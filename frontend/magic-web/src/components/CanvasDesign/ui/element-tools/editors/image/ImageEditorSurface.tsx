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
import { useCanvasReferenceMention } from "../../../editors/message/useCanvasReferenceMention"
import { useMentionSync } from "../../../editors/message/useMentionSync"
import { removeMentionFromString } from "../../../editors/message/tiptap/contentUtils"
import { ReferenceResourceDropSurface } from "../../../editors/message/reference-assets/ReferenceResourceDropSurface"
import {
	createReferenceResourcePanelItemFromDropFile,
	createReferenceResourcePanelItemFromPath,
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
import {
	areCanvasResourceReferencesSame,
	getCanvasResourceFileName,
} from "../../../../runtime/shared/path/canvasResourcePath"
import { CanvasDesignClipboard } from "../../../../runtime/resources/clipboard/CanvasDesignClipboard"
import {
	claimCanvasClipboardPasteEvent,
	getCanvasClipboardPasteController,
	hasCanvasClipboardMimeType,
	hasCanvasClipboardTextOrHtml,
	type CanvasClipboardAsset,
} from "../../../../runtime/resources/clipboard/CanvasClipboardPasteController"

import {
	createPromptPlaceholderTokenFactory,
	resolvePromptPlaceholderTokenConfig,
} from "../../../editors/message/reference-assets/promptPlaceholderTokenConfig"

interface ImageEditorSurfaceProps {
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

export default function ImageEditorSurface(props: ImageEditorSurfaceProps) {
	const {
		imageElement,
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
	const { setEditingElementId } = useCanvasModeUI()

	useEffect(() => {
		setEditingElementId(imageElement.id)
		return () => setEditingElementId(null)
	}, [imageElement.id, setEditingElementId])
	const resolveResourceReference =
		canvas?.magicConfigManager.config?.methods?.resolveResourceReference
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
	const canSendPrompt = Boolean(
		composePromptWithLinkedText(linkedEditorInputs.textPrompt, prompt).trim(),
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

	const handlePaste = useCallback(
		(event: ClipboardEvent<HTMLDivElement>) => {
			const nativeEvent = event.nativeEvent
			const files = CanvasDesignClipboard.readEventFilesSnapshot(nativeEvent)
			const nativeFiles = CanvasDesignClipboard.readAllEventFilesSnapshot(nativeEvent)
			const hasCanvasMime = hasCanvasClipboardMimeType(nativeEvent)
			const hasTextOrHtml = hasCanvasClipboardTextOrHtml(nativeEvent)
			// Unsupported native files (for example PDF) must retain the previous
			// editor/browser behavior. Only media files are owned by this editor.
			if (!hasCanvasMime && nativeFiles.length > 0 && files.length === 0) return
			if (!hasCanvasMime && files.length > 0) {
				if (!canAcceptLocalFiles(files).accepted) return
				if (!claimCanvasClipboardPasteEvent(nativeEvent)) return
				event.preventDefault()
				event.stopPropagation()
				void clipboardHandlersRef.current.uploadFiles(files)
				return
			}
			if (!hasCanvasMime && files.length === 0 && hasTextOrHtml) return
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
			let pastedAssetIndex = 0
			const pasteSessionId = getClipboardSessionId()

			void getCanvasClipboardPasteController().paste(
				nativeEvent,
				{
					control: "image-editor",
					acceptedTypes: ["image"],
					projectId:
						canvas?.magicConfigManager.config?.methods?.getCanvasClipboardContext?.()
							.projectId,
					canvasId: canvas?.id,
					maxCount: remainingCapacity,
					maxCountByType: { image: remainingCapacity },
					sessionId: pasteSessionId,
				},
				{
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
							)
							if (selectedSlotForPaste) {
								clipboardHandlersRef.current.replaceReferenceFileAt(
									selectedSlotForPaste.slotIndex,
									{
										path: item.data.file_path,
										src: item.data.file_path,
										fileName: item.data.file_name,
									},
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
					onComplete: () => {
						if (selectedSlotForPaste) {
							clipboardHandlersRef.current.resetSelectedReferenceSlot()
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
			effectiveCurrentReferenceFiles.length,
		],
	)

	const { overlayState, dragEvents } = useReferenceResourceDrop({
		isEnabled: isDropEnabled,
		checkProjectFiles: canAcceptProjectFiles,
		checkLocalFiles: canAcceptLocalFiles,
		getProjectHoverState: getHoverDropState,
		getLocalHoverState,
		onDropProjectFiles: handleProjectFilesDrop,
		onDropLocalFiles: handlers.uploadFiles,
	})

	const handleMentionChange = useCallback(
		(paths: string[], currentPrompt: string, context: MessageEditorMentionChangeContext) => {
			if (handleAssociationMentionChange(paths, currentPrompt, context)) {
				syncMentionPaths(paths, currentPrompt, context)
			}
		},
		[handleAssociationMentionChange, syncMentionPaths],
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

	const handleSend = useCallback(() => onSend(linkedEditorInputs), [linkedEditorInputs, onSend])

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
					ref={fileInputRef}
					type="file"
					accept={fileInputAccept}
					multiple={!config.selectedReferenceSlot?.path}
					style={{ display: "none" }}
					onChange={handlers.handleFileChange}
				/>
				<div ref={setSourceListContainer} className={styles.sourceListMount} />
				{linkedEditorInputs?.textConnections.length ? (
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
				<MessageEditor
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
					mentionDataService={mentionDataService}
					mentionExtension={mentionExtension}
					mentionItemsReady={Boolean(config.hasRestoredRef.current)}
					onMentionChange={handleMentionChange}
					onMentionItemHoverChange={setHoveredMentionPath}
					mentionEnabled={mentionEnabled}
					onPasteCapture={handlePaste}
				/>
				<ImageEditorControls
					config={config}
					hoveredMentionPath={hoveredMentionPath}
					onSelectSource={handleSelectSource}
					onProjectSelect={handleProjectSelect}
					onReferenceFileRemove={handleReferenceFileRemoveFromPopover}
					linkedMediaItems={linkedEditorInputs?.mediaItems}
					onLinkedMediaSelectionChange={handleLinkedMediaSelectionChange}
					renderPromptOptimizationButton={() => (
						<PromptOptimizationButton
							buildRequest={buildPromptOptimizationRequest}
							referencePrompt={`${linkedEditorInputs.textPrompt}\n${prompt}\n${effectiveCurrentReferenceFiles.join("\n")}`}
							placeholderPaths={promptOptimizationPlaceholderPaths}
							onApply={handlers.setPrompt}
							onPreviewMediaResource={onPreviewMediaResource}
							isMediaResourcePreviewOpen={isMediaResourcePreviewOpen}
						/>
					)}
					renderSendButton={() => (
						<Button
							className={styles.sendButton}
							onClick={handleSend}
							disabled={isSending || !canSendPrompt || !config.selectedModelId}
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
						showRestoreDefaultConfig && onRestoreDefaultConfig
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
