import {
	useCallback,
	useMemo,
	useState,
	type ClipboardEvent,
	type CSSProperties,
	type MutableRefObject,
} from "react"
import { ArrowUp, LoaderCircle } from "lucide-react"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import { useHostUiLocale } from "../../../app/providers/HostUiLocaleProvider"
import type { ImageElement } from "../../../runtime/document/types"
import type {
	ReferenceResourceFileInfo,
	ReferenceResourceSourceType,
} from "../message/reference-assets/reference-resource.types"
import type {
	ReferenceResourcePanelItem,
	ReferenceResourcePanelSelectContext,
} from "../../../public/props"
import MessageEditor, { type MessageEditorRef } from "../message/MessageEditor"
import { useCanvasReferenceMention } from "../message/useCanvasReferenceMention"
import { useMentionSync } from "../message/useMentionSync"
import { removeMentionFromString } from "../message/tiptap/contentUtils"
import { ReferenceResourceDropSurface } from "../message/reference-assets/ReferenceResourceDropSurface"
import { createReferenceResourcePanelItemFromDropFile } from "../message/reference-assets/createReferenceResourcePanelItem"
import {
	checkLocalReferenceResourceDrop,
	checkProjectReferenceResourceDrop,
	getReferenceResourceHoverState,
	getReferenceResourceLocalHoverState,
	normalizeProjectDropFilesForStorage,
	type ReferenceDropProjectFile,
	useReferenceResourceDrop,
} from "../message/reference-assets/useReferenceResourcePanelDataService"
import useElementPositionEffect from "../../../app/hooks/layout/useElementPositionEffect"
import { useFloatingComponent } from "../../../app/hooks/layout/useFloatingComponent"
import { Button } from "../../primitives/shadcn/button"
import ImageEditorControls from "./ImageEditorControls"
import type { ImageEditorConfig } from "./useImageEditorConfig"
import styles from "./index.module.css"
import type { MediaResourceFullscreenPreviewItem } from "../../fullscreen/media-resource/index"
import LinkedEditorInputsBar from "../connection/LinkedEditorInputsBar"
import {
	type LinkedEditorInputsState,
	useLinkedEditorInputs,
} from "../connection/useLinkedEditorInputs"
import { composePromptWithLinkedText } from "../connection/linkedTextPrompt"
import type { LinkedEditorMediaPolicy } from "../connection/linkedEditorInputs"
import { buildImageRequestWithLinkedEditorInputs } from "../connection/linkedImageRequest"
import PromptOptimizationButton from "../prompt-optimization/PromptOptimizationButton"
import {
	buildPromptOptimizationUserPrompt,
	resolvePromptOptimizationOutputLanguage,
	type PromptOptimizationReferenceContext,
} from "../prompt-optimization/promptOptimizationUserPrompt"
import type { CompleteImagePromptRequest, GenerateImageRequest } from "../../../public/magic-types"
import { getCanvasResourceFileName } from "../../../runtime/shared/path/canvasResourcePath"
import {
	createPromptPlaceholderTokenFactory,
	resolvePromptPlaceholderTokenConfig,
} from "../message/reference-assets/promptPlaceholderTokenConfig"

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
		className,
		style,
		onPreviewMediaResource,
		isMediaResourcePreviewOpen = false,
	} = props
	const { canvas } = useCanvas()
	const resolveResourcePathCandidates =
		canvas.magicConfigManager.config?.methods?.resolveResourcePathCandidates
	const normalizeResourcePathForStorage =
		canvas.magicConfigManager.config?.methods?.normalizeResourcePathForStorage
	const { t } = useCanvasDesignI18n()
	const hostUiLocale = useHostUiLocale()
	const [hasScrollbar, setHasScrollbar] = useState(false)
	const [hoveredMentionPath, setHoveredMentionPath] = useState<string | null>(null)
	const {
		prompt,
		handlers,
		fileInputRef,
		fileInputAccept,
		maxReferenceFiles,
		currentReferenceFiles,
		isReferenceFileLimitReached,
	} = config
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
	const linkedEditorInputs = useLinkedEditorInputs({
		targetElementId: imageElement.id,
		targetKind: "image",
		mediaPolicy: linkedMediaPolicy,
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
		() => mergeUniquePaths(currentReferenceFiles, linkedActiveImagePaths),
		[currentReferenceFiles, linkedActiveImagePaths],
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

	const { containerRef } = useElementPositionEffect({
		position: "bottom",
		offset: 12,
		shouldShow,
	})

	const { containerRef: floatingRef } = useFloatingComponent({
		id: floatingId,
		enableWheelForwarding: !hasScrollbar,
	})

	const setRefs = useCallback(
		(node: HTMLDivElement | null) => {
			containerRef.current = node
			floatingRef.current = node
		},
		[containerRef, floatingRef],
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
			return checkProjectReferenceResourceDrop({
				isDropEnabled: canAcceptReferenceDrop,
				files,
				matchableItems,
				currentReferenceFiles: effectiveCurrentReferenceFiles,
				maxReferenceFiles,
				resolveResourcePathCandidates,
			})
		},
		[
			canAcceptReferenceDrop,
			matchableItems,
			effectiveCurrentReferenceFiles,
			maxReferenceFiles,
			resolveResourcePathCandidates,
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
			const normalizedFiles = normalizeProjectDropFilesForStorage(
				files,
				matchableItems,
				effectiveCurrentReferenceFiles,
				{ resolveResourcePathCandidates, normalizeResourcePathForStorage },
			)
			editorRef.current?.insertMentionItems(
				normalizedFiles.map((file) => createReferenceResourcePanelItemFromDropFile(file)),
			)
		},
		[
			effectiveCurrentReferenceFiles,
			editorRef,
			matchableItems,
			normalizeResourcePathForStorage,
			resolveResourcePathCandidates,
		],
	)

	const handlePaste = useCallback(
		(event: ClipboardEvent<HTMLDivElement>) => {
			const files = Array.from(event.clipboardData.files)
			if (files.length === 0) return
			if (!canAcceptLocalFiles(files).accepted) return

			event.preventDefault()
			void handlers.uploadFiles(files)
		},
		[canAcceptLocalFiles, handlers],
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
		(paths: string[], currentPrompt: string) => {
			config.handlers.handlePromptReferencePathsChange(paths)
			syncMentionPaths(paths, currentPrompt)
		},
		[config.handlers, syncMentionPaths],
	)

	const handleReferenceFileRemoveFromPopover = useCallback(
		(path: string) => {
			const currentPrompt = editorRef.current?.getCurrentPrompt() ?? prompt
			const fileName =
				config.referenceFileInfos.find((info) => info.path === path)?.fileName ??
				getCanvasResourceFileName(path)
			handlers.setPrompt(removeMentionFromString(currentPrompt, path, fileName))
			handlers.handleReferenceFileRemove(path)
		},
		[config.referenceFileInfos, editorRef, handlers, prompt],
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
	])

	return (
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
			{linkedEditorInputs ? (
				<LinkedEditorInputsBar
					textConnections={linkedEditorInputs.textConnections}
					onRemoveConnection={linkedEditorInputs.removeConnection}
				/>
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
				onMentionChange={handleMentionChange}
				onMentionItemHoverChange={setHoveredMentionPath}
				mentionEnabled={mentionEnabled}
				onPaste={handlePaste}
			/>
			<ImageEditorControls
				config={config}
				hoveredMentionPath={hoveredMentionPath}
				onSelectSource={handleSelectSource}
				onProjectSelect={handleProjectSelect}
				onReferenceFileRemove={handleReferenceFileRemoveFromPopover}
				onPreviewMediaResource={onPreviewMediaResource}
				linkedMediaItems={linkedEditorInputs?.mediaItems}
				onRemoveLinkedConnection={linkedEditorInputs?.removeConnection}
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
			/>
		</ReferenceResourceDropSurface>
	)
}

function mergeUniquePaths(paths: string[], extraPaths: string[]): string[] {
	const merged: string[] = []
	const seen = new Set<string>()
	for (const path of [...paths, ...extraPaths]) {
		if (!path || seen.has(path)) continue
		seen.add(path)
		merged.push(path)
	}
	return merged
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
