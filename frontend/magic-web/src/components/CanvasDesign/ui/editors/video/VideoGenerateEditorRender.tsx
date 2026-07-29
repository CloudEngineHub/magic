import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type ClipboardEvent,
} from "react"
import { ArrowUp, LoaderCircle, ZapIcon } from "lucide-react"
import { useUpdateEffect } from "ahooks"
import { toast } from "sonner"
import { useHostUiLocale } from "../../../app/providers/HostUiLocaleProvider"
import { Button } from "../../primitives/shadcn/button"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useCanvasSelectionUI } from "../../../app/providers/CanvasUIProvider"
import useElementPositionEffect from "../../../app/hooks/layout/useElementPositionEffect"
import { useFloatingComponent } from "../../../app/hooks/layout/useFloatingComponent"
import { ElementTypeEnum, type VideoElement } from "../../../runtime/document/types"
import type {
	CompleteImagePromptRequest,
	GenerateVideoInputs,
	GenerateVideoRequest,
	ReferenceImageOptions,
	VideoInputModeConfig,
} from "../../../public/magic-types"
import type {
	UseVideoEditorConfigOptions,
	VideoReferenceAssetInfo,
} from "./video-editor-config.types"
import { VideoElement as VideoElementClass } from "../../../runtime/elements/video/VideoElement"
import { generateUUID } from "../../../runtime/shared/ids"
import { getCanvasResourceFileName } from "../../../runtime/shared/path/canvasResourcePath"
import MessageEditor, {
	type MessageEditorMentionChangeContext,
	type MessageEditorRef,
} from "../message/MessageEditor"
import { useCanvasReferenceMention } from "../message/useCanvasReferenceMention"
import VideoEditorControls from "./VideoEditorControls"
import { useVideoEditorConfig } from "./useVideoEditorConfig"
import {
	buildReferenceAssetInputs,
	countVideoReferenceAssetInfosByKind,
	hasVideoInputs,
	resolveReferenceAssetLimits,
	resolveVideoFrameRoleSupport,
	validateReferenceAssetsByLimits,
} from "./model-config/video-editor-config.model"
import type {
	ReferenceResourcePanelItem,
	ReferenceResourcePanelSelectContext,
} from "../../../public/props"
import type { ReferenceResourceSourceType } from "../message/reference-assets/reference-resource.types"
import { ReferenceResourceDropSurface } from "../message/reference-assets/ReferenceResourceDropSurface"
import {
	checkLocalReferenceResourceDrop,
	checkProjectReferenceResourceDrop,
	getReferenceResourceHoverState,
	getReferenceResourceLocalHoverState,
	normalizeProjectDropFilesForStorage,
	type ReferenceDropProjectFile,
	useReferenceResourceDrop,
} from "../message/reference-assets/useReferenceResourcePanelDataService"
import styles from "./index.module.css"
import { createAndSubmitVideoGeneration } from "./submit/createAndSubmitVideoGeneration"
import { useVideoPointsEstimate } from "./useVideoPointsEstimate"
import { useVideoPointsConfirm } from "./useVideoPointsConfirm"
import { buildVideoPointsEstimateSignature } from "./points/video-points-estimate.utils"
import type { MediaResourceFullscreenPreviewItem } from "../../fullscreen/media-resource/index"
import LinkedEditorInputsBar from "../connection/LinkedEditorInputsBar"
import { composePromptWithLinkedText } from "../connection/linkedTextPrompt"
import {
	getLinkedMediaReferenceIdentity,
	mergeLinkedMediaReferences,
	type LinkedEditorMediaKind,
	type LinkedEditorMediaItem,
	type LinkedEditorMediaPolicy,
	type LinkedEditorMediaReference,
} from "../connection/linkedEditorInputs"
import { useLinkedEditorInputs } from "../connection/useLinkedEditorInputs"
import { useLinkedMediaMentionSelection } from "../connection/useLinkedMediaMentionSelection"
import PromptOptimizationButton from "../prompt-optimization/PromptOptimizationButton"
import {
	buildPromptOptimizationUserPrompt,
	resolvePromptOptimizationOutputLanguage,
	type PromptOptimizationReferenceContext,
} from "../prompt-optimization/promptOptimizationUserPrompt"
import { buildReferenceImageOptions } from "../../../runtime/resources/image/imageCropUtils"
import {
	createPromptPlaceholderTokenFactory,
	resolvePromptPlaceholderTokenConfig,
	type PromptPlaceholderTokenConfig,
	type PromptPlaceholderTokenKind,
} from "../message/reference-assets/promptPlaceholderTokenConfig"
import {
	encodeVideoPromptMentionsToPlaceholders,
	resolveVideoPromptPlaceholderReferences,
	type VideoPromptPlaceholderReference,
} from "./prompt-placeholders/video-prompt-placeholder"
import { hasVideoGenerationRequestSubmitIntent } from "../../../runtime/shared/videoGenerationRequestIntent"
import { synchronizeLinkedFrameBindings } from "./linkedFrameBindings"

interface VideoGenerateEditorRenderProps {
	videoElement: VideoElement
	autoFocus?: boolean
	/** 与 autoFocus 联用：挂载后将光标置于提示词末尾 */
	autoFocusAtDocumentEnd?: boolean
	/** generateVideo 成功返回后触发，用于清除重试编辑态等 */
	onGenerateSubmitSucceeded?: () => void
	/** 成片后重新进入编辑器时仅按 generateVideoRequest 恢复，不合并临时草稿 */
	restoreOnMount?: UseVideoEditorConfigOptions["restoreOnMount"]
	submitTarget?: "current-element" | "new-element"
	/** 尺寸选择变化时是否同步更新当前元素尺寸 */
	syncElementSize?: UseVideoEditorConfigOptions["syncElementSize"]
	onPreviewMediaResource?: (resource: MediaResourceFullscreenPreviewItem) => void
	isMediaResourcePreviewOpen?: boolean
}

/** 画布内浮动的视频生成编辑器：提示词、模型、输入区与发送 */
export default function VideoGenerateEditorRender(props: VideoGenerateEditorRenderProps) {
	const {
		videoElement,
		autoFocus = false,
		autoFocusAtDocumentEnd = false,
		onGenerateSubmitSucceeded,
		restoreOnMount,
		submitTarget = "current-element",
		syncElementSize,
		onPreviewMediaResource,
		isMediaResourcePreviewOpen = false,
	} = props
	const { t } = useCanvasDesignI18n()
	const promptPlaceholderTokenConfig = useMemo(() => resolvePromptPlaceholderTokenConfig(t), [t])
	const hostUiLocale = useHostUiLocale()
	const shellNominalWidthPx = useMemo(
		() => getVideoEditorShellNominalWidthPx(hostUiLocale),
		[hostUiLocale],
	)
	const { selectedElements } = useCanvasSelectionUI()
	const { canvas } = useCanvas()
	const resolveResourcePathCandidates =
		canvas.magicConfigManager.config?.methods?.resolveResourcePathCandidates
	const normalizeResourcePathForStorage =
		canvas.magicConfigManager.config?.methods?.normalizeResourcePathForStorage
	const editorRef = useRef<MessageEditorRef>(null)
	const [hasEditorScrollbar, setHasEditorScrollbar] = useState(false)
	const [hasSourceListScrollbar, setHasSourceListScrollbar] = useState(false)
	const [isSending, setIsSending] = useState(false)
	const [hoveredMentionPath, setHoveredMentionPath] = useState<string | null>(null)
	const [mentionedReferencePaths, setMentionedReferencePaths] = useState<string[]>([])
	const sendingRef = useRef(false)
	const isMountedRef = useRef(false)
	const hasScrollbar = hasEditorScrollbar || hasSourceListScrollbar
	const confirmVideoGeneration = useVideoPointsConfirm()

	useEffect(() => {
		isMountedRef.current = true
		return () => {
			isMountedRef.current = false
		}
	}, [])

	const config = useVideoEditorConfig({
		videoElement,
		messageEditorRef: editorRef,
		...(restoreOnMount ? { restoreOnMount } : {}),
		...(syncElementSize !== undefined ? { syncElementSize } : {}),
	})
	const { handlers } = config
	const { linkedFrameBindings } = config
	const { buildRequestParams, replaceFrameImageAt, setLinkedFrameBindings } = handlers
	const linkedMediaPolicy = useMemo<LinkedEditorMediaPolicy>(() => {
		const supportedKinds: LinkedEditorMediaKind[] = []
		if (config.supportsReferenceImages) supportedKinds.push("image")
		if (config.supportsReferenceVideos) supportedKinds.push("video")
		if (config.supportsReferenceAudios) supportedKinds.push("audio")

		return {
			supportedKinds,
			manualReferences: config.referenceImageInfos.map((info) => ({
				kind: info.assetType,
				path: info.path,
			})),
			validateActiveReferences: (references) => {
				const hasMaxIssue = validateReferenceAssetsByLimits(
					config.currentInputModeConfig,
					buildVideoReferenceAssetInfosFromReferences(references),
				).some((issue) => issue.rule === "max")
				return hasMaxIssue ? "over-limit" : null
			},
		}
	}, [
		config.currentInputModeConfig,
		config.referenceImageInfos,
		config.supportsReferenceAudios,
		config.supportsReferenceImages,
		config.supportsReferenceVideos,
	])
	const linkedEditorInputs = useLinkedEditorInputs({
		targetElementId: videoElement.id,
		targetKind: "video",
		mediaPolicy: linkedMediaPolicy,
	})
	const handleLinkedMediaSelectionChange = useLinkedMediaMentionSelection({
		mediaItems: linkedEditorInputs.mediaItems,
		mentionedReferencePaths,
		isMediaConnectionSelected: linkedEditorInputs.isMediaConnectionSelected,
		onSelectionChange: linkedEditorInputs.setMediaConnectionSelected,
		editorRef,
	})
	const { handleMentionedReferencePathsChange } = linkedEditorInputs
	const linkedFrameBindingSync = useMemo(
		() =>
			synchronizeLinkedFrameBindings({
				previous: linkedFrameBindings,
				currentFrameImages: config.currentFrameImages,
				supportsStartFrame: config.supportsStartFrame,
				supportsEndFrame: config.supportsEndFrame,
				linkedMediaItems: linkedEditorInputs.mediaItems,
			}),
		[
			config.currentFrameImages,
			config.supportsEndFrame,
			config.supportsStartFrame,
			linkedEditorInputs.mediaItems,
			linkedFrameBindings,
		],
	)
	useEffect(() => {
		if (linkedFrameBindingSync.bindings !== linkedFrameBindings) {
			setLinkedFrameBindings(linkedFrameBindingSync.bindings)
		}
		linkedFrameBindingSync.frameUpdates.forEach((update) => {
			replaceFrameImageAt(update.slotIndex, {
				path: update.path,
				src: update.path,
				fileName: update.fileName,
			})
		})
	}, [linkedFrameBindingSync, linkedFrameBindings, replaceFrameImageAt, setLinkedFrameBindings])
	const mergedReferenceAssetInfos = useMemo(
		() =>
			mergeLinkedVideoReferenceAssetInfos(
				config.referenceImageInfos,
				linkedEditorInputs.activeMediaReferences,
			),
		[config.referenceImageInfos, linkedEditorInputs.activeMediaReferences],
	)
	const effectiveReferencePaths = useMemo(
		() => mergedReferenceAssetInfos.map((info) => info.path),
		[mergedReferenceAssetInfos],
	)
	const effectiveReferenceAssetCounts = useMemo(
		() => countVideoReferenceAssetInfosByKind(mergedReferenceAssetInfos),
		[mergedReferenceAssetInfos],
	)
	const effectiveReferenceAssetLimits = useMemo(
		() => resolveReferenceAssetLimits(config.currentInputModeConfig, mergedReferenceAssetInfos),
		[config.currentInputModeConfig, mergedReferenceAssetInfos],
	)
	const effectiveMaxReferenceFiles = useMemo(() => {
		if (!config.supportsReferenceAssets) return 0
		const maxCount = effectiveReferenceAssetLimits.total.max
		if (!Number.isFinite(maxCount)) return undefined
		return maxCount && maxCount > 0 ? maxCount : undefined
	}, [config.supportsReferenceAssets, effectiveReferenceAssetLimits.total.max])
	const effectiveReferenceLimitReached =
		effectiveMaxReferenceFiles !== undefined &&
		effectiveReferencePaths.length >= effectiveMaxReferenceFiles
	const composedPrompt = useMemo(
		() => composePromptWithLinkedText(linkedEditorInputs.textPrompt, config.prompt),
		[config.prompt, linkedEditorInputs.textPrompt],
	)
	const promptOptimizationPlaceholderPaths = useMemo(() => {
		const promptReferences = resolveVideoPromptPlaceholderReferences({
			mode: config.selectedInputMode,
			referenceImageInfos: mergedReferenceAssetInfos,
		})
		return buildVideoPromptOptimizationPlaceholderPaths(promptReferences)
	}, [config.selectedInputMode, mergedReferenceAssetInfos])
	const buildRequestParamsWithLinkedInputs = useCallback(
		(requestParams: Partial<GenerateVideoRequest> = buildRequestParams()) => {
			const requestWithPrompt = {
				...requestParams,
				prompt: composePromptWithLinkedText(
					linkedEditorInputs.textPrompt,
					requestParams.prompt ?? config.prompt,
				),
			}
			return buildVideoRequestWithReferenceAssets({
				requestParams: requestWithPrompt,
				referenceAssetInfos: mergedReferenceAssetInfos,
				inputModeConfig: config.currentInputModeConfig,
				supportsReferenceAssets: config.supportsReferenceAssets,
			})
		},
		[
			buildRequestParams,
			config.currentInputModeConfig,
			config.prompt,
			config.supportsReferenceAssets,
			linkedEditorInputs.textPrompt,
			mergedReferenceAssetInfos,
		],
	)
	const hasNonStandardInputMode = config.availableInputModes.some((mode) => mode !== "standard")
	const isEstimateInputModeSettled =
		config.availableInputModes.includes(config.selectedInputMode) &&
		!(config.selectedInputMode === "standard" && hasNonStandardInputMode)
	const estimateModelId =
		config.hasRestoredRef.current && isEstimateInputModeSettled
			? config.selectedModelId || undefined
			: undefined
	const estimateRequest = useMemo(() => {
		if (!estimateModelId) return null
		return {
			...buildRequestParamsWithLinkedInputs(),
			model_id: estimateModelId,
		}
	}, [estimateModelId, buildRequestParamsWithLinkedInputs])
	const hasSubmitIntent = useMemo(() => {
		return hasVideoGenerationRequestSubmitIntent(buildRequestParamsWithLinkedInputs())
	}, [buildRequestParamsWithLinkedInputs])
	const estimateSignature = useMemo(() => {
		if (!estimateRequest) return null
		return buildVideoPointsEstimateSignature(estimateRequest)
	}, [estimateRequest])
	const { points: estimatedPoints, isLoading: isEstimateLoading } = useVideoPointsEstimate({
		request: estimateRequest,
		signature: estimateSignature,
		enabled: Boolean(estimateModelId),
	})

	const { matchableItems, mentionDataService, mentionExtension, mentionEnabled } =
		useCanvasReferenceMention({
			matchableItems: config.matchableItems,
			mentionEnabledOverride: config.modelOptions.length > 0,
			maxReferenceFiles: effectiveMaxReferenceFiles,
			currentReferenceFiles: effectiveReferencePaths,
			isReferenceFileLimitReached: effectiveReferenceLimitReached,
			referenceResourceType: config.referenceResourceType,
			assetLimits: config.supportsReferenceAssets ? effectiveReferenceAssetLimits : undefined,
			currentAssetCounts: config.supportsReferenceAssets
				? effectiveReferenceAssetCounts
				: undefined,
		})

	const { containerRef } = useElementPositionEffect({
		position: "bottom",
		offset: 12,
		shouldShow: () => {
			return selectedElements.some((element) => element?.type === ElementTypeEnum.Video)
		},
	})

	const { containerRef: floatingRef } = useFloatingComponent({
		id: "video-generate-editor",
		enableWheelForwarding: !hasScrollbar,
	})

	const setRefs = useCallback(
		(node: HTMLDivElement | null) => {
			containerRef.current = node
			floatingRef.current = node
		},
		[containerRef, floatingRef],
	)

	const saveDefaultGenerateVideoConfig = useCallback(
		(requestParams: GenerateVideoRequest) => {
			if (!canvas) return
			const methods = canvas.magicConfigManager.config?.methods
			if (methods?.getRootStorage && methods?.saveRootStorage) {
				const rootStorage = methods.getRootStorage() || {}
				methods.saveRootStorage({
					...rootStorage,
					defaultGenerateVideoConfig: {
						model_id: requestParams.model_id,
						input_mode: requestParams.input_mode,
						task: requestParams.task,
						generation: {
							aspect_ratio: requestParams.generation?.aspect_ratio,
							resolution: requestParams.generation?.resolution,
						},
					},
				})
			}
		},
		[canvas],
	)

	useUpdateEffect(() => {
		if (config.isRestoringRef.current || !config.hasRestoredRef.current) return
		saveDefaultGenerateVideoConfig({
			model_id: config.selectedModelId,
			input_mode: config.selectedInputMode,
			task: config.currentInputModeConfig?.task || "generate",
			generation: {
				aspect_ratio: config.selectedAspectRatio,
				resolution: config.selectedResolution,
			},
		})
	}, [
		config.currentInputModeConfig?.task,
		config.selectedModelId,
		config.selectedAspectRatio,
		config.selectedResolution,
		config.isRestoringRef,
		config.hasRestoredRef,
		saveDefaultGenerateVideoConfig,
	])

	useUpdateEffect(() => {
		if (!canvas || !config.hasRestoredRef.current) return
		if (config.ratioOption) {
			canvas.toolManager.getVideoGeneratorTool().setDefaultSize({
				width: config.ratioOption.width,
				height: config.ratioOption.height,
			})
			return
		}
		if (!config.selectedAspectRatio) return
		canvas.toolManager
			.getVideoGeneratorTool()
			.setDefaultSizeByAspectRatio(config.selectedAspectRatio)
	}, [config.ratioOption, config.selectedAspectRatio, canvas, config.hasRestoredRef])

	const handleSelectSource = useCallback(
		(source: ReferenceResourceSourceType) => {
			if (config.isUploading) return
			if (source !== "local-upload") return
			handlers.setPopoverOpen(false)
			handlers.triggerFileSelect()
		},
		[config.isUploading, handlers],
	)

	const handleMentionChange = useCallback(
		(paths: string[], currentPrompt: string, context: MessageEditorMentionChangeContext) => {
			setMentionedReferencePaths(paths)
			handleMentionedReferencePathsChange(paths, {
				deselectRemoved: context.source === "user",
			})
			handlers.handleReferenceMentionPathsChange(paths)
			void currentPrompt
		},
		[handleMentionedReferencePathsChange, handlers],
	)

	const handleLinkedMediaFrameSelect = useCallback(
		(
			slotIndex: number,
			frameRole: "start" | "end",
			item: LinkedEditorMediaItem & { kind: "image"; path: string },
		) => {
			if (!item.path) return
			const sourceFileName =
				item.fileName || getCanvasResourceFileName(item.path) || item.path
			const sourceIdentity = getLinkedMediaReferenceIdentity(item.path)
			const duplicateSourceFrameIndex = config.currentFrameImages.findIndex(
				(path, index) =>
					index !== slotIndex &&
					Boolean(path) &&
					getLinkedMediaReferenceIdentity(path) === sourceIdentity,
			)
			if (duplicateSourceFrameIndex >= 0) {
				toast.error(t("videoEditor.frameResourceAlreadyUsed", "该资源已用于其他帧"))
				return
			}
			handlers.replaceFrameImageAt(slotIndex, {
				path: item.path,
				src: item.path,
				fileName: sourceFileName,
			})
			setLinkedFrameBindings((previous) => {
				const next = [...previous]
				next[slotIndex] = {
					framePath: item.path,
					sourceConnectionId: item.connectionId,
					sourcePath: item.path,
					sourceKind: "image",
					sourceFileName,
					frameRole,
				}
				return next
			})
		},
		[config.currentFrameImages, handlers, setLinkedFrameBindings, t],
	)

	const handleProjectSelect = useCallback(
		(item: ReferenceResourcePanelItem, context?: ReferenceResourcePanelSelectContext) => {
			const selectedSlot = config.selectedResourceSlot
			if (!selectedSlot) return
			const nextFileInfo = {
				path: item.data.file_path,
				src: item.data.file_path,
				fileName: item.data.file_name,
			}
			const targetSlotIndex =
				selectedSlot.path || !context?.batch
					? selectedSlot.slotIndex
					: selectedSlot.slotIndex + context.batch.index
			const retainResourceSlot = Boolean(
				context?.batch && context.batch.index < context.batch.total - 1,
			)
			if (selectedSlot.inputTab === "frame") {
				handlers.replaceFrameImageAt(targetSlotIndex, nextFileInfo, {
					retainResourceSlot,
				})
			} else {
				handlers.replaceReferenceImageAt(targetSlotIndex, nextFileInfo, {
					retainResourceSlot,
				})
			}
			context?.reset?.()
		},
		[config.selectedResourceSlot, handlers],
	)

	const canAcceptReferenceDrop = config.supportsReferenceAssets && !config.isUploading

	const canAcceptProjectFiles = useCallback(
		(files: ReferenceDropProjectFile[]) => {
			return checkProjectReferenceResourceDrop({
				isDropEnabled: canAcceptReferenceDrop,
				files,
				matchableItems,
				currentReferenceFiles: effectiveReferencePaths,
				maxReferenceFiles: effectiveMaxReferenceFiles,
				resolveResourcePathCandidates,
			})
		},
		[
			canAcceptReferenceDrop,
			effectiveReferencePaths,
			effectiveMaxReferenceFiles,
			matchableItems,
			resolveResourcePathCandidates,
		],
	)

	const canAcceptLocalFiles = useCallback(
		(files: File[]) => {
			return checkLocalReferenceResourceDrop({
				isDropEnabled: canAcceptReferenceDrop,
				files,
				accept: config.fileInputAccept,
				currentReferenceFileCount: effectiveReferencePaths.length,
				maxReferenceFiles: effectiveMaxReferenceFiles,
				assetLimits: effectiveReferenceAssetLimits,
				currentAssetCounts: effectiveReferenceAssetCounts,
			})
		},
		[
			canAcceptReferenceDrop,
			config.fileInputAccept,
			effectiveMaxReferenceFiles,
			effectiveReferenceAssetLimits,
			effectiveReferenceAssetCounts,
			effectiveReferencePaths,
		],
	)

	const getHoverDropState = useCallback(
		() =>
			getReferenceResourceHoverState({
				isDropEnabled: canAcceptReferenceDrop,
				currentReferenceFileCount: effectiveReferencePaths.length,
				maxReferenceFiles: effectiveMaxReferenceFiles,
				assetLimits: effectiveReferenceAssetLimits,
				currentAssetCounts: effectiveReferenceAssetCounts,
			}),
		[
			canAcceptReferenceDrop,
			effectiveMaxReferenceFiles,
			effectiveReferenceAssetLimits,
			effectiveReferenceAssetCounts,
			effectiveReferencePaths,
		],
	)

	const getLocalHoverState = useCallback(
		(dataTransfer: DataTransfer | null) =>
			getReferenceResourceLocalHoverState({
				isDropEnabled: canAcceptReferenceDrop,
				dataTransfer,
				accept: config.fileInputAccept,
				currentReferenceFileCount: effectiveReferencePaths.length,
				maxReferenceFiles: effectiveMaxReferenceFiles,
				assetLimits: effectiveReferenceAssetLimits,
				currentAssetCounts: effectiveReferenceAssetCounts,
			}),
		[
			canAcceptReferenceDrop,
			config.fileInputAccept,
			effectiveMaxReferenceFiles,
			effectiveReferenceAssetLimits,
			effectiveReferenceAssetCounts,
			effectiveReferencePaths,
		],
	)

	const handleProjectFilesDrop = useCallback(
		(files: ReferenceDropProjectFile[]) => {
			const normalizedFiles = normalizeProjectDropFilesForStorage(
				files,
				matchableItems,
				effectiveReferencePaths,
				{ resolveResourcePathCandidates, normalizeResourcePathForStorage },
			)
			const existingReferencePathSet = new Set(effectiveReferencePaths)
			const nextFiles: ReferenceDropProjectFile[] = []
			const seenNextPathSet = new Set<string>()
			normalizedFiles.forEach((file) => {
				if (existingReferencePathSet.has(file.path)) return
				if (seenNextPathSet.has(file.path)) return
				seenNextPathSet.add(file.path)
				nextFiles.push(file)
			})
			const startSlot = config.currentReferenceImages.length
			nextFiles.forEach((file, index) => {
				handlers.replaceReferenceImageAt(startSlot + index, {
					path: file.path,
					src: file.path,
					fileName: file.fileName,
				})
			})
		},
		[
			config.currentReferenceImages.length,
			effectiveReferencePaths,
			handlers,
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
			void handlers.uploadReferenceFiles(files)
		},
		[canAcceptLocalFiles, handlers],
	)

	const { overlayState, dragEvents } = useReferenceResourceDrop({
		isEnabled: true,
		checkProjectFiles: canAcceptProjectFiles,
		checkLocalFiles: canAcceptLocalFiles,
		getProjectHoverState: getHoverDropState,
		getLocalHoverState,
		onDropProjectFiles: handleProjectFilesDrop,
		onDropLocalFiles: handlers.uploadReferenceFiles,
	})

	const promptPlaceholder =
		config.currentInputModeConfig?.description?.trim() ||
		t("videoEditor.placeholder", "请输入您的视频创作需求")

	const submitVideoGeneration = useCallback(
		async (
			requestParams: GenerateVideoRequest,
			options?: { draftRequest?: Partial<GenerateVideoRequest> },
		) => {
			if (sendingRef.current) return
			if (
				!canvas ||
				!config.selectedModelId ||
				!hasVideoGenerationRequestSubmitIntent(requestParams)
			)
				return
			const elementInstance = canvas.elementManager.getElementInstance(videoElement.id)
			if (!(elementInstance instanceof VideoElementClass)) return
			sendingRef.current = true
			setIsSending(true)
			try {
				handlers.cancelPendingDraftPersistence()
				const submitted =
					submitTarget === "new-element"
						? await createAndSubmitVideoGeneration({
								canvas,
								sourceVideoElement: videoElement,
								request: requestParams,
								newElementSize: config.ratioOption,
							})
						: await (async () => {
								handlers.saveDraftRequest(options?.draftRequest ?? requestParams)
								return elementInstance.generateVideo(requestParams)
							})()
				if (submitted) onGenerateSubmitSucceeded?.()
			} finally {
				sendingRef.current = false
				if (isMountedRef.current) setIsSending(false)
			}
		},
		[
			canvas,
			config.ratioOption,
			config.selectedModelId,
			handlers,
			onGenerateSubmitSucceeded,
			submitTarget,
			videoElement,
		],
	)

	const handleSend = useCallback(async () => {
		if (sendingRef.current || isEstimateLoading) return
		if (!canvas || !config.selectedModelId) return
		const currentInputs = mergedReferenceAssetInfos
		const validationIssues = validateReferenceAssetsByLimits(
			config.currentInputModeConfig,
			currentInputs,
		)
		if (validationIssues.length > 0) {
			const firstIssue = validationIssues[0]
			if (firstIssue.field === "total") {
				if (firstIssue.rule === "max") {
					toast.error(
						t("videoEditor.referenceAssetTotalMaxReached", {
							defaultValue: "参考素材最多可上传 {{max}} 个",
							max: firstIssue.expected,
						}),
					)
					return
				}
				toast.error(
					t("videoEditor.referenceAssetTotalMinNotMet", {
						defaultValue: "参考素材至少需要 {{min}} 个",
						min: firstIssue.expected,
					}),
				)
				return
			}

			const assetTypeLabel =
				firstIssue.field === "reference_images"
					? t("messageHistory.referenceImage", "参考图")
					: firstIssue.field === "reference_videos"
						? t("messageHistory.referenceVideo", "参考视频")
						: t("messageHistory.referenceAudio", "参考音频")

			if (firstIssue.rule === "max") {
				toast.error(
					t("videoEditor.referenceAssetTypeMaxReached", {
						defaultValue: "{{assetType}}最多可上传 {{max}} 个",
						assetType: assetTypeLabel,
						max: firstIssue.expected,
					}),
				)
				return
			}
			toast.error(
				t("videoEditor.referenceAssetTypeMinNotMet", {
					defaultValue: "{{assetType}}至少需要 {{min}} 个",
					assetType: assetTypeLabel,
					min: firstIssue.expected,
				}),
			)
			return
		}
		const draftRequestParams = buildRequestParams()
		const requestParams = {
			...(buildRequestParamsWithLinkedInputs(draftRequestParams) as GenerateVideoRequest),
			video_id: generateUUID(),
		}
		if (!hasVideoGenerationRequestSubmitIntent(requestParams)) return
		const elementInstance = canvas.elementManager.getElementInstance(videoElement.id)
		if (!(elementInstance instanceof VideoElementClass)) return
		await confirmVideoGeneration({
			points: estimatedPoints,
			onConfirm: () =>
				submitVideoGeneration(requestParams, { draftRequest: draftRequestParams }),
		})
	}, [
		buildRequestParams,
		buildRequestParamsWithLinkedInputs,
		canvas,
		confirmVideoGeneration,
		config.currentInputModeConfig,
		config.selectedModelId,
		estimatedPoints,
		isEstimateLoading,
		mergedReferenceAssetInfos,
		submitVideoGeneration,
		t,
		videoElement,
	])

	const buildPromptOptimizationRequest = useCallback(() => {
		const currentPrompt = composedPrompt.trim()
		const promptReferences = resolveVideoPromptPlaceholderReferences({
			mode: config.selectedInputMode,
			referenceImageInfos: mergedReferenceAssetInfos,
		})
		const encodedPrompt = encodeVideoPromptMentionsToPlaceholders(
			currentPrompt,
			promptReferences,
			promptPlaceholderTokenConfig,
		).trim()
		const frameImageCount = config.currentFrameImages.filter(Boolean).length
		const referenceImages = buildVideoPromptOptimizationReferenceImages(
			config.currentFrameImages,
			mergedReferenceAssetInfos,
		)
		if (!encodedPrompt && referenceImages.length === 0) return null
		const completionRequest: CompleteImagePromptRequest = {
			user_prompt: buildPromptOptimizationUserPrompt({
				target: "video",
				currentPrompt: encodedPrompt,
				outputLanguage: resolvePromptOptimizationOutputLanguage({
					currentPrompt: encodedPrompt,
					hostUiLocale,
				}),
				referenceImageCount: referenceImages.length,
				frameImageCount,
				referenceVideoCount: countVideoReferencesByKind(mergedReferenceAssetInfos, "video"),
				referenceAudioCount: countVideoReferencesByKind(mergedReferenceAssetInfos, "audio"),
				references: buildVideoPromptOptimizationReferences({
					frameImageInfos: config.frameImageInfos,
					inputModeConfig: config.currentInputModeConfig,
					referenceImages,
					referenceAssetInfos: mergedReferenceAssetInfos,
					promptReferences,
					promptPlaceholderTokenConfig,
				}),
			}),
		}
		const referenceImageOptions = buildVideoPromptOptimizationReferenceImageOptions(
			linkedEditorInputs.activeMediaReferences,
		)
		if (config.selectedModelId) completionRequest.model_id = config.selectedModelId
		if (referenceImages.length > 0) completionRequest.reference_images = referenceImages
		if (referenceImageOptions) completionRequest.reference_image_options = referenceImageOptions
		return completionRequest
	}, [
		composedPrompt,
		config.currentFrameImages,
		config.currentInputModeConfig,
		config.frameImageInfos,
		config.selectedModelId,
		config.selectedInputMode,
		hostUiLocale,
		linkedEditorInputs.activeMediaReferences,
		mergedReferenceAssetInfos,
		promptPlaceholderTokenConfig,
	])

	const sendButtonBusy = isSending || isEstimateLoading

	return (
		<ReferenceResourceDropSurface
			ref={setRefs}
			className={styles.videoMessageEditor}
			style={
				{
					"--video-editor-shell-nominal-width": `${shellNominalWidthPx}px`,
				} as CSSProperties
			}
			data-canvas-ui-component
			data-testid="video-generate-editor-root"
			dropOverlayState={overlayState}
			dragEvents={dragEvents}
		>
			<input
				ref={config.fileInputRef}
				type="file"
				accept={config.fileInputAccept}
				multiple={!config.selectedResourceSlot?.path}
				style={{ display: "none" }}
				onChange={handlers.handleFileChange}
			/>
			<LinkedEditorInputsBar
				textConnections={linkedEditorInputs.textConnections}
				isTextConnectionSelected={linkedEditorInputs.isTextConnectionSelected}
				onTextConnectionSelectedChange={linkedEditorInputs.setTextConnectionSelected}
				onReorderTextConnections={linkedEditorInputs.reorderTextConnections}
			/>
			<MessageEditor
				ref={editorRef}
				autoFocus={autoFocus}
				autoFocusAtDocumentEnd={autoFocusAtDocumentEnd}
				selectionPersistenceKey={`video-generate:${videoElement.id}`}
				fullWidth
				placeholder={promptPlaceholder}
				value={config.prompt}
				onChange={(value) => handlers.setPrompt(value)}
				onEnter={handleSend}
				onScrollbarChange={setHasEditorScrollbar}
				matchableItems={matchableItems}
				mentionDataService={mentionDataService}
				mentionExtension={mentionExtension}
				onMentionChange={handleMentionChange}
				onMentionItemHoverChange={setHoveredMentionPath}
				mentionEnabled={mentionEnabled}
				onPaste={handlePaste}
			/>
			<VideoEditorControls
				config={config}
				hoveredMentionPath={hoveredMentionPath}
				onSourceListScrollbarChange={setHasSourceListScrollbar}
				onPrepareResourceSlotSelection={handlers.prepareResourceSlotSelection}
				onSelectSource={handleSelectSource}
				onProjectSelect={handleProjectSelect}
				onFocusEditor={() => editorRef.current?.focus()}
				onPreviewMediaResource={onPreviewMediaResource}
				linkedMediaItems={linkedEditorInputs.mediaItems}
				linkedMentionedReferencePaths={mentionedReferencePaths}
				onLinkedMediaSelectionChange={handleLinkedMediaSelectionChange}
				linkedFrameBindings={linkedFrameBindings}
				onLinkedMediaFrameSelect={handleLinkedMediaFrameSelect}
				renderPromptOptimizationButton={() => (
					<PromptOptimizationButton
						buildRequest={buildPromptOptimizationRequest}
						referencePrompt={`${composedPrompt}\n${config.currentFrameImages
							.filter(Boolean)
							.join("\n")}\n${effectiveReferencePaths.join("\n")}`}
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
						disabled={sendButtonBusy || !hasSubmitIntent || !config.selectedModelId}
						aria-busy={sendButtonBusy}
						data-testid="video-generate-editor-send-button"
					>
						{sendButtonBusy ? (
							<LoaderCircle size={16} className="animate-spin" />
						) : (
							<>
								{estimatedPoints != null ? (
									<>
										<ZapIcon size={16} fill="currentColor" />
										<span className={styles.sendButtonPoints}>
											{t("videoEditor.sendButtonEstimatedPoints", {
												defaultValue: "预计{{points}}",
												points: estimatedPoints,
											})}
										</span>
									</>
								) : (
									<ArrowUp size={16} />
								)}
							</>
						)}
					</Button>
				)}
			/>
		</ReferenceResourceDropSurface>
	)
}

function getFileNameFromPath(path: string): string {
	return getCanvasResourceFileName(path) || path
}

function buildVideoReferenceAssetInfoFromReference(
	reference: LinkedEditorMediaReference,
): VideoReferenceAssetInfo {
	return {
		path: reference.path,
		src: reference.path,
		fileName: getFileNameFromPath(reference.path),
		assetType: reference.kind,
	}
}

function buildVideoReferenceAssetInfosFromReferences(
	references: LinkedEditorMediaReference[],
): VideoReferenceAssetInfo[] {
	return references.map(buildVideoReferenceAssetInfoFromReference)
}

function mergeLinkedVideoReferenceAssetInfos(
	manualInfos: VideoReferenceAssetInfo[],
	linkedReferences: LinkedEditorMediaReference[],
): VideoReferenceAssetInfo[] {
	const manualInfoByIdentity = new Map(
		manualInfos.map((info) => [getLinkedMediaReferenceIdentity(info.path), info]),
	)
	return mergeLinkedMediaReferences(
		manualInfos.map((info) => ({
			kind: info.assetType,
			path: info.path,
		})),
		linkedReferences,
	).map(
		(reference) =>
			manualInfoByIdentity.get(getLinkedMediaReferenceIdentity(reference.path)) ??
			buildVideoReferenceAssetInfoFromReference(reference),
	)
}

function omitReferenceAssetInputs(inputs: GenerateVideoInputs | undefined): GenerateVideoInputs {
	const nextInputs = { ...(inputs ?? {}) }
	delete nextInputs.reference_images
	delete nextInputs.reference_videos
	delete nextInputs.reference_audios
	return nextInputs
}

function buildVideoRequestWithReferenceAssets(options: {
	requestParams: Partial<GenerateVideoRequest>
	referenceAssetInfos: VideoReferenceAssetInfo[]
	inputModeConfig: VideoInputModeConfig | undefined
	supportsReferenceAssets: boolean
}): Partial<GenerateVideoRequest> {
	const { requestParams, referenceAssetInfos, inputModeConfig, supportsReferenceAssets } = options
	if (!supportsReferenceAssets) return requestParams

	const referenceInputs = buildReferenceAssetInputs(referenceAssetInfos, inputModeConfig)
	const inputs = {
		...omitReferenceAssetInputs(requestParams.inputs),
		...referenceInputs,
	}

	return {
		...requestParams,
		inputs: hasVideoInputs(inputs) ? inputs : undefined,
	}
}

function buildVideoPromptOptimizationReferences(options: {
	frameImageInfos: Array<{ path: string; fileName?: string } | undefined>
	inputModeConfig: VideoInputModeConfig | undefined
	referenceImages: string[]
	referenceAssetInfos: VideoReferenceAssetInfo[]
	promptReferences: VideoPromptPlaceholderReference[]
	promptPlaceholderTokenConfig: PromptPlaceholderTokenConfig
}): PromptOptimizationReferenceContext[] {
	const {
		frameImageInfos,
		inputModeConfig,
		referenceImages,
		referenceAssetInfos,
		promptReferences,
		promptPlaceholderTokenConfig,
	} = options
	const visualIndexByPath = new Map(
		referenceImages.map((path, index) => [path, index + 1] as const),
	)
	const promptReferenceByPath = new Map(
		promptReferences.map((reference) => [reference.path, reference]),
	)
	const references: PromptOptimizationReferenceContext[] = []
	const referenceByPath = new Map<string, PromptOptimizationReferenceContext>()

	const pushReference = (path: string, reference: PromptOptimizationReferenceContext) => {
		const existing = referenceByPath.get(path)
		if (existing) {
			mergePromptOptimizationReference(existing, reference)
			return
		}
		referenceByPath.set(path, reference)
		references.push(reference)
	}

	const frameRoles = buildVideoPromptOptimizationFrameRoles(inputModeConfig)
	frameImageInfos.forEach((info, index) => {
		if (!info?.path) return
		const frameRole = frameRoles[index]
		pushReference(info.path, {
			kind: "image",
			label: getVideoFramePromptOptimizationLabel(frameRole, index),
			fileName: info.fileName || getFileNameFromPath(info.path),
			isVisualInput: true,
			visualReferenceIndex: visualIndexByPath.get(info.path),
			role: getVideoFramePromptOptimizationRole(frameRole),
		})
	})

	const assetTypeCounters: Record<VideoReferenceAssetInfo["assetType"], number> = {
		image: 0,
		video: 0,
		audio: 0,
	}
	referenceAssetInfos.forEach((info) => {
		assetTypeCounters[info.assetType] += 1
		const promptReference = promptReferenceByPath.get(info.path)
		pushReference(info.path, {
			kind: info.assetType,
			placeholder: promptReference
				? buildVideoPromptOptimizationPlaceholder(
						promptReference,
						promptPlaceholderTokenConfig,
					)
				: undefined,
			label: getVideoAssetPromptOptimizationLabel(
				info.assetType,
				assetTypeCounters[info.assetType],
			),
			fileName: info.fileName || getFileNameFromPath(info.path),
			isVisualInput: info.assetType === "image",
			visualReferenceIndex:
				info.assetType === "image" ? visualIndexByPath.get(info.path) : undefined,
			role: getVideoAssetPromptOptimizationRole(info.assetType),
		})
	})

	return references
}

function mergePromptOptimizationReference(
	target: PromptOptimizationReferenceContext,
	source: PromptOptimizationReferenceContext,
): void {
	if (!target.placeholder && source.placeholder) target.placeholder = source.placeholder
	if (!target.label && source.label) target.label = source.label
	if (!target.fileName && source.fileName) target.fileName = source.fileName
	if (!target.visualReferenceIndex && source.visualReferenceIndex) {
		target.visualReferenceIndex = source.visualReferenceIndex
	}
	target.isVisualInput = Boolean(target.isVisualInput || source.isVisualInput)
	target.role = mergePromptOptimizationReferenceRole(target.role, source.role)
}

function mergePromptOptimizationReferenceRole(
	current: string | undefined,
	next: string | undefined,
): string | undefined {
	if (!next) return current
	if (!current) return next
	if (current.includes(next)) return current
	return `${current}；${next}`
}

function buildVideoPromptOptimizationFrameRoles(
	inputModeConfig: VideoInputModeConfig | undefined,
): Array<"start" | "end"> {
	const { supportsStartFrame, supportsEndFrame } = resolveVideoFrameRoleSupport(inputModeConfig)
	const roles: Array<"start" | "end"> = []
	if (supportsStartFrame) roles.push("start")
	if (supportsEndFrame) roles.push("end")
	return roles
}

function getVideoFramePromptOptimizationLabel(
	role: "start" | "end" | undefined,
	index: number,
): string {
	if (role === "start") return "首帧参考"
	if (role === "end") return "尾帧参考"
	return `视频帧参考 ${index + 1}`
}

function getVideoFramePromptOptimizationRole(role: "start" | "end" | undefined): string {
	if (role === "start") return "作为视频起始画面的视觉约束"
	if (role === "end") return "作为视频结束画面的视觉约束"
	return "作为视频画面关键帧参考"
}

function getVideoAssetPromptOptimizationLabel(
	assetType: VideoReferenceAssetInfo["assetType"],
	index: number,
): string {
	if (assetType === "image") return `图片参考 ${index}`
	if (assetType === "video") return `视频文件引用 ${index}`
	return `音频文件引用 ${index}`
}

function getVideoAssetPromptOptimizationRole(
	assetType: VideoReferenceAssetInfo["assetType"],
): string {
	if (assetType === "image") return "作为视频生成的图片参考"
	if (assetType === "video") return "作为视频文件引用"
	return "作为音频文件引用"
}

function buildVideoPromptOptimizationPlaceholder(
	reference: VideoPromptPlaceholderReference,
	tokenConfig: PromptPlaceholderTokenConfig,
): string {
	const tokenFactory = createPromptPlaceholderTokenFactory(
		getVideoPromptOptimizationPlaceholderLabel(reference.assetType, tokenConfig),
		tokenConfig,
	)
	return tokenFactory(reference.assetTypeIndex)
}

function getVideoPromptOptimizationPlaceholderLabel(
	assetType: VideoReferenceAssetInfo["assetType"],
	tokenConfig: PromptPlaceholderTokenConfig,
): string {
	if (assetType === "image") return tokenConfig.imageLabel
	if (assetType === "video") return tokenConfig.videoLabel
	return tokenConfig.audioLabel
}

function buildVideoPromptOptimizationPlaceholderPaths(
	promptReferences: VideoPromptPlaceholderReference[],
): Partial<Record<PromptPlaceholderTokenKind, string[]>> {
	const placeholderPaths: Partial<Record<PromptPlaceholderTokenKind, string[]>> = {}
	promptReferences.forEach((reference) => {
		const paths = placeholderPaths[reference.assetType] ?? []
		paths[reference.assetTypeIndex - 1] = reference.path
		placeholderPaths[reference.assetType] = paths
	})
	return placeholderPaths
}

function buildVideoPromptOptimizationReferenceImages(
	frameImages: Array<string | undefined>,
	referenceAssetInfos: VideoReferenceAssetInfo[],
): string[] {
	return mergeUniquePaths([
		...frameImages.filter((path): path is string => Boolean(path)),
		...referenceAssetInfos
			.filter((info) => info.assetType === "image")
			.map((info) => info.path),
	])
}

function buildVideoPromptOptimizationReferenceImageOptions(
	references: LinkedEditorMediaReference[],
): ReferenceImageOptions | undefined {
	const options = references.flatMap((reference) => {
		if (reference.kind !== "image") return []
		return (
			buildReferenceImageOptions({
				filePath: reference.path,
				crop: reference.sourceCrop,
			}) ?? []
		)
	})
	return options.length > 0 ? dedupeReferenceImageOptions(options) : undefined
}

function dedupeReferenceImageOptions(options: ReferenceImageOptions): ReferenceImageOptions {
	const seenPathSet = new Set<string>()
	return options.filter((option) => {
		if (!option.path || seenPathSet.has(option.path)) return false
		seenPathSet.add(option.path)
		return true
	})
}

function mergeUniquePaths(paths: string[]): string[] {
	const result: string[] = []
	const seenPathSet = new Set<string>()
	for (const path of paths) {
		if (!path || seenPathSet.has(path)) continue
		seenPathSet.add(path)
		result.push(path)
	}
	return result
}

function countVideoReferencesByKind(
	referenceAssetInfos: VideoReferenceAssetInfo[],
	kind: "video" | "audio",
): number {
	return referenceAssetInfos.filter((info) => info.assetType === kind).length
}

/** 中文界面略窄；英文等其它语言略宽，避免输入时外壳宽度抖动 */
function getVideoEditorShellNominalWidthPx(languageCode: string | undefined): number {
	if (!languageCode) return 760
	const normalized = languageCode.toLowerCase().replace(/-/g, "_")
	if (normalized.startsWith("zh")) return 600
	return 760
}
