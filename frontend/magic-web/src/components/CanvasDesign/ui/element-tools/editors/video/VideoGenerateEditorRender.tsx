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
import { useLatest, useUnmount, useUpdateEffect } from "ahooks"
import { toast } from "sonner"
import { useHostUiLocale } from "../../../../app/providers/HostUiLocaleProvider"
import { Button } from "../../../primitives/shadcn/button"
import { FloatingSurfaceScope } from "../../../primitives/shadcn/popover"
import { useCanvasDesignI18n } from "../../../../app/providers/I18nProvider"
import { useCanvas } from "../../../../app/providers/CanvasProvider"
import { useCanvasModeUI, useCanvasSelectionUI } from "../../../../app/providers/CanvasUIProvider"
import { useBottomFloatingSurface } from "../../../../app/providers/BottomFloatingStackProvider"
import useElementPositionEffect from "../../../../app/hooks/layout/useElementPositionEffect"
import { useFloatingComponent } from "../../../../app/hooks/layout/useFloatingComponent"
import { useCanvasEvent, useIsMediaReplacing } from "../../../../app/hooks/canvas"
import { ElementTypeEnum, type VideoElement } from "../../../../runtime/document/types"
import type {
	CompleteImagePromptRequest,
	GenerateVideoInputs,
	GenerateVideoRequest,
	ReferenceImageOptions,
	VideoInputModeConfig,
} from "../../../../public/magic-types"
import type {
	UseVideoEditorConfigOptions,
	VideoEditSessionSnapshot,
	VideoReferenceAssetInfo,
} from "./video-editor-config.types"
import { VideoElement as VideoElementClass } from "../../../../runtime/elements/video/VideoElement"
import { generateUUID } from "../../../../runtime/shared/ids"
import {
	getCanvasResourceFileName,
	getCanvasResourceReferenceIdentity,
} from "../../../../runtime/shared/path/canvasResourcePath"
import { createReferenceResourcePanelItemFromPath } from "../../../editors/message/reference-assets/createReferenceResourcePanelItem"
import type { ResolveCanvasResourceReference } from "../../../../public/resource-reference"
import MessageEditor, { type MessageEditorRef } from "../../../editors/message/MessageEditor"
import { useCanvasReferenceMention } from "../../../editors/message/useCanvasReferenceMention"
import VideoEditorControls from "./VideoEditorControls"
import { useVideoEditorConfig } from "./useVideoEditorConfig"
import {
	buildReferenceAssetInputs,
	canAddReferenceAssetByCounts,
	countVideoReferenceAssetInfosByKind,
	hasVideoInputs,
	resolveReferenceAssetLimits,
	resolveVideoFrameRoleSupport,
	validateReferenceAssetsByLimits,
} from "./model-config/video-editor-config.model"
import type {
	ReferenceResourcePanelItem,
	ReferenceResourcePanelSelectContext,
} from "../../../../public/props"
import type {
	ReferenceAssetFileClass,
	ReferenceResourceSourceType,
} from "../../../editors/message/reference-assets/reference-resource.types"
import { ReferenceResourceDropSurface } from "../../../editors/message/reference-assets/ReferenceResourceDropSurface"
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
import { filterReferenceResourcePanelBatchItems } from "../../../editors/message/reference-assets/referenceResourceSelection"
import styles from "./index.module.css"
import { createAndSubmitVideoGeneration } from "./submit/createAndSubmitVideoGeneration"
import { useVideoPointsEstimate } from "./useVideoPointsEstimate"
import { useVideoPointsConfirm } from "./useVideoPointsConfirm"
import { buildVideoPointsEstimateSignature } from "./points/video-points-estimate.utils"
import type { MediaResourceFullscreenPreviewItem } from "../../../fullscreen/media-resource/index"
import LinkedEditorInputsBar from "../../../editors/connection/LinkedEditorInputsBar"
import { composePromptWithLinkedText } from "../../../editors/connection/linkedTextPrompt"
import {
	getLinkedMediaReferenceIdentity,
	mergeLinkedMediaReferences,
	type LinkedEditorMediaKind,
	type LinkedEditorMediaItem,
	type LinkedEditorMediaPolicy,
	type LinkedEditorMediaReference,
} from "../../../editors/connection/linkedEditorInputs"
import { useLinkedMediaAssociationController } from "../../../editors/connection/useLinkedMediaAssociationController"
import PromptOptimizationButton from "../../../editors/prompt-optimization/PromptOptimizationButton"
import {
	buildPromptOptimizationUserPrompt,
	resolvePromptOptimizationOutputLanguage,
	type PromptOptimizationReferenceContext,
} from "../../../editors/prompt-optimization/promptOptimizationUserPrompt"
import { buildReferenceImageOptions } from "../../../../runtime/resources/image/imageCropUtils"
import {
	createPromptPlaceholderTokenFactory,
	resolvePromptPlaceholderTokenConfig,
	type PromptPlaceholderTokenConfig,
	type PromptPlaceholderTokenKind,
} from "../../../editors/message/reference-assets/promptPlaceholderTokenConfig"
import {
	encodeVideoPromptMentionsToPlaceholders,
	resolveVideoPromptPlaceholderReferences,
	type VideoPromptPlaceholderReference,
} from "./prompt-placeholders/video-prompt-placeholder"
import { hasVideoGenerationRequestSubmitIntent } from "../../../../runtime/shared/videoGenerationRequestIntent"
import { CanvasDesignClipboard } from "../../../../runtime/resources/clipboard/CanvasDesignClipboard"
import {
	claimCanvasClipboardPasteEvent,
	getCanvasClipboardPasteController,
	hasCanvasClipboardMimeType,
	hasCanvasClipboardTextOrHtml,
	type CanvasClipboardAsset,
	type CanvasClipboardMediaType,
} from "../../../../runtime/resources/clipboard/CanvasClipboardPasteController"
import { synchronizeLinkedFrameBindings } from "./linkedFrameBindings"
import {
	areMediaEditSnapshotsEqual,
	type MediaEditIntent,
} from "../../../../runtime/interaction/media-edit-recovery/MediaEditRecoveryManager"

interface VideoGenerateEditorRenderProps {
	videoElement: VideoElement
	autoFocus?: boolean
	/** 与 autoFocus 联用：挂载后将光标置于提示词末尾 */
	autoFocusAtDocumentEnd?: boolean
	/** generateVideo 成功返回后触发，用于清除重试编辑态等 */
	onGenerateSubmitSucceeded?: () => void
	/** 成片后重新进入编辑器时仅按 generateVideoRequest 恢复，不合并临时草稿 */
	restoreOnMount?: UseVideoEditorConfigOptions["restoreOnMount"]
	/** current-content 在当前视频元素中追加一个 Content；new-element 保留独立结果节点能力。 */
	submitTarget?: "current-element" | "current-content" | "new-element"
	sessionIntent?: MediaEditIntent
	sessionSourceFingerprint?: string
	sessionSnapshot?: VideoEditSessionSnapshot
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
		sessionIntent,
		sessionSourceFingerprint,
		sessionSnapshot,
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
	const { setEditingElementId } = useCanvasModeUI()
	const { canvas } = useCanvas()
	const resolveResourceReference =
		canvas?.magicConfigManager.config?.methods?.resolveResourceReference
	const editorRef = useRef<MessageEditorRef>(null)
	const [hasEditorScrollbar, setHasEditorScrollbar] = useState(false)
	const [hasSourceListScrollbar, setHasSourceListScrollbar] = useState(false)
	const [isSending, setIsSending] = useState(false)
	const [hoveredMentionPath, setHoveredMentionPath] = useState<string | null>(null)
	const [sourceListContainer, setSourceListContainer] = useState<HTMLDivElement | null>(null)
	const sendingRef = useRef(false)
	const isMountedRef = useRef(false)
	const clipboardEpochRef = useRef(0)
	const sessionPersistenceEnabledRef = useRef(true)
	const hasScrollbar = hasEditorScrollbar || hasSourceListScrollbar
	const confirmVideoGeneration = useVideoPointsConfirm()
	const isReplacing = useIsMediaReplacing(videoElement.id)
	const linkedReferenceAssetInfosRef = useRef<VideoReferenceAssetInfo[]>([])
	const getAdditionalReferenceAssetInfos = useCallback(
		() => linkedReferenceAssetInfosRef.current,
		[],
	)

	useEffect(() => {
		setEditingElementId(videoElement.id)
		return () => setEditingElementId(null)
	}, [setEditingElementId, videoElement.id])

	useEffect(() => {
		isMountedRef.current = true
		return () => {
			isMountedRef.current = false
		}
	}, [])

	const config = useVideoEditorConfig({
		videoElement,
		messageEditorRef: editorRef,
		manageRecoverySession: !sessionIntent,
		...(restoreOnMount ? { restoreOnMount } : {}),
		...(sessionSnapshot ? { sessionSnapshot } : {}),
		...(syncElementSize !== undefined ? { syncElementSize } : {}),
		getAdditionalReferenceAssetInfos,
	})
	const { handlers } = config
	const clipboardSessionIdRef = useRef("")
	const getClipboardSessionId = useCallback(
		() =>
			[
				videoElement.id,
				videoElement.activeContentId ?? "",
				config.selectedModelId,
				config.selectedInputMode,
				config.selectedResourceSlot?.inputTab ?? "",
				config.selectedResourceSlot?.slotKey ??
					(config.selectedResourceSlot
						? `index-${config.selectedResourceSlot.slotIndex}`
						: ""),
				config.selectedResourceSlot?.slotIndex ?? "",
				config.selectedResourceSlot?.referenceAssetKind ?? "",
				config.selectedResourceSlot?.path ?? "",
				clipboardEpochRef.current,
			].join(":"),
		[
			config.selectedInputMode,
			config.selectedModelId,
			config.selectedResourceSlot,
			videoElement.activeContentId,
			videoElement.id,
		],
	)
	clipboardSessionIdRef.current = getClipboardSessionId()
	const clipboardHandlersRef = useRef(handlers)
	clipboardHandlersRef.current = handlers
	const sessionStore = canvas?.mediaEditRecoveryManager
	const sessionKey = useMemo(
		() =>
			sessionIntent && videoElement.activeContentId
				? {
						elementId: videoElement.id,
						contentId: videoElement.activeContentId,
						intent: sessionIntent,
					}
				: null,
		[sessionIntent, videoElement.activeContentId, videoElement.id],
	)
	const previousSourceFingerprintRef = useRef(sessionSourceFingerprint)
	const [hasInterruptedDraft, setHasInterruptedDraft] = useState(false)

	useEffect(() => {
		if (previousSourceFingerprintRef.current === sessionSourceFingerprint) return
		sessionPersistenceEnabledRef.current = false
		if (videoElement.activeContentId) {
			sessionStore?.clearContent(videoElement.id, videoElement.activeContentId)
		}
		previousSourceFingerprintRef.current = sessionSourceFingerprint
		setHasInterruptedDraft(false)
	}, [sessionSourceFingerprint, sessionStore, videoElement.activeContentId, videoElement.id])

	const captureSessionDraft = useCallback(() => {
		if (
			!sessionPersistenceEnabledRef.current ||
			!sessionStore ||
			!sessionKey ||
			!sessionSourceFingerprint ||
			!config.hasRestoredRef.current ||
			config.isRestoringRef.current ||
			config.restoreRevision === 0
		)
			return
		const snapshot = handlers.buildSessionSnapshot()
		const existing = sessionStore.get<VideoEditSessionSnapshot>(
			sessionKey,
			sessionSourceFingerprint,
		)
		if (existing) {
			sessionStore.updateDraft(sessionKey, sessionSourceFingerprint, snapshot)
			setHasInterruptedDraft(!areMediaEditSnapshotsEqual(existing.baseline, snapshot))
			return
		}
		sessionStore.set(sessionKey, sessionSourceFingerprint, snapshot, snapshot)
		setHasInterruptedDraft(false)
	}, [
		config.hasRestoredRef,
		config.isRestoringRef,
		config.restoreRevision,
		handlers,
		sessionKey,
		sessionSourceFingerprint,
		sessionStore,
	])
	const captureSessionDraftRef = useLatest(captureSessionDraft)
	useUnmount(() => captureSessionDraftRef.current?.())

	useCanvasEvent(
		"element:deselect",
		({ data }) => {
			if (
				!sessionKey ||
				(data?.elementIds?.length && !data.elementIds.includes(videoElement.id))
			) {
				return
			}
			captureSessionDraft()
		},
		[captureSessionDraft, sessionKey, videoElement.id],
	)

	useEffect(() => {
		if (!sessionStore || !sessionKey || !sessionSourceFingerprint) return
		const existing = sessionStore.get<VideoEditSessionSnapshot>(
			sessionKey,
			sessionSourceFingerprint,
		)
		if (!existing) {
			if (!config.hasRestoredRef.current || config.restoreRevision === 0) return
			const baseline = handlers.buildSessionSnapshot()
			sessionStore.set(sessionKey, sessionSourceFingerprint, baseline, baseline)
			setHasInterruptedDraft(false)
			return
		}
		setHasInterruptedDraft(!areMediaEditSnapshotsEqual(existing.baseline, existing.draft))
	}, [
		config.hasRestoredRef,
		config.restoreRevision,
		handlers,
		sessionKey,
		sessionSourceFingerprint,
		sessionStore,
	])

	useEffect(() => {
		if (isReplacing) sessionPersistenceEnabledRef.current = false
	}, [isReplacing])

	const handleRestoreBaseline = useCallback(() => {
		if (!sessionStore || !sessionKey || !sessionSourceFingerprint) return
		const existing = sessionStore.get<VideoEditSessionSnapshot>(
			sessionKey,
			sessionSourceFingerprint,
		)
		if (!existing) return
		handlers.restoreSessionSnapshotToUi(existing.baseline)
		sessionStore.set(sessionKey, sessionSourceFingerprint, existing.baseline, existing.baseline)
		setHasInterruptedDraft(false)
		// 恢复配置按钮会抢走焦点；等待编辑器同步快照后，把光标恢复到之前的编辑位置。
		window.setTimeout(() => editorRef.current?.focus(), 0)
	}, [handlers, sessionKey, sessionSourceFingerprint, sessionStore])
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
					{ ignoreModeMaxCountForTotal: config.selectedInputMode === "omni_reference" },
				).some((issue) => issue.rule === "max" && issue.reason !== "variant")
				return hasMaxIssue ? "over-limit" : null
			},
		}
	}, [
		config.currentInputModeConfig,
		config.referenceImageInfos,
		config.supportsReferenceAudios,
		config.supportsReferenceImages,
		config.supportsReferenceVideos,
		config.selectedInputMode,
	])
	const { linkedEditorInputs, handleLinkedMediaSelectionChange, handleMentionChange } =
		useLinkedMediaAssociationController({
			targetElementId: videoElement.id,
			targetKind: "video",
			mediaPolicy: linkedMediaPolicy,
			mediaPolicyStatus: config.isReferencePolicyReady ? "ready" : "loading",
			editorRef,
			onReadyMentionChange: handlers.handleReferenceMentionPathsChange,
			resolveResourceReference,
		})
	const linkedFrameBindingSync = useMemo(
		() =>
			synchronizeLinkedFrameBindings({
				previous: linkedFrameBindings,
				currentFrameImages: config.currentFrameImages,
				supportsStartFrame: config.supportsStartFrame,
				supportsEndFrame: config.supportsEndFrame,
				linkedMediaItems: linkedEditorInputs.mediaItems,
				resolveResourceReference,
			}),
		[
			config.currentFrameImages,
			config.supportsEndFrame,
			config.supportsStartFrame,
			linkedEditorInputs.mediaItems,
			linkedFrameBindings,
			resolveResourceReference,
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
				resolveResourceReference,
			),
		[
			config.referenceImageInfos,
			linkedEditorInputs.activeMediaReferences,
			resolveResourceReference,
		],
	)
	const effectiveReferencePaths = useMemo(
		() => mergedReferenceAssetInfos.map((info) => info.path),
		[mergedReferenceAssetInfos],
	)
	const effectiveReferenceAssetCounts = useMemo(
		() => countVideoReferenceAssetInfosByKind(mergedReferenceAssetInfos),
		[mergedReferenceAssetInfos],
	)
	linkedReferenceAssetInfosRef.current = mergedReferenceAssetInfos.filter(
		(info) =>
			!config.referenceImageInfos.some(
				(manualInfo) =>
					getLinkedMediaReferenceIdentity(manualInfo.path, resolveResourceReference) ===
					getLinkedMediaReferenceIdentity(info.path, resolveResourceReference),
			),
	)
	const effectiveReferenceAssetLimits = useMemo(
		() =>
			resolveReferenceAssetLimits(config.currentInputModeConfig, mergedReferenceAssetInfos, {
				ignoreModeMaxCountForTotal: config.selectedInputMode === "omni_reference",
			}),
		[config.currentInputModeConfig, mergedReferenceAssetInfos, config.selectedInputMode],
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
	const { stackOffset, containerRef: stackRef } = useBottomFloatingSurface({
		surfaceId: "video-generate-editor",
		elementId: videoElement.id,
		order: 1,
		enabled: true,
	})

	const { containerRef } = useElementPositionEffect({
		position: "bottom",
		offset: 12 + stackOffset,
		shouldShow: () => {
			return selectedElements.some((element) => element?.type === ElementTypeEnum.Video)
		},
	})

	const { containerRef: floatingRef } = useFloatingComponent({
		id: "video-generate-editor",
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

	const handleLinkedMediaFrameSelect = useCallback(
		(
			slotIndex: number,
			frameRole: "start" | "end",
			item: LinkedEditorMediaItem & { kind: "image"; path: string },
		) => {
			if (!item.path) return
			const sourceFileName =
				item.fileName || getCanvasResourceFileName(item.path) || item.path
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
		[handlers, setLinkedFrameBindings],
	)

	const handleProjectSelect = useCallback(
		(item: ReferenceResourcePanelItem, context?: ReferenceResourcePanelSelectContext) => {
			const selectedSlot = config.selectedResourceSlot
			if (!selectedSlot) return
			const selectedReferenceAssetType =
				selectedSlot.inputTab === "reference"
					? selectedSlot.referenceAssetKinds?.length === 1
						? selectedSlot.referenceAssetKinds[0]
						: selectedSlot.referenceAssetKind
					: undefined
			const nextFileInfo = {
				path: item.data.file_path,
				src: item.data.file_path,
				fileName: item.data.file_name,
				...(selectedReferenceAssetType ? { assetType: selectedReferenceAssetType } : {}),
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
	const canAcceptNextReferenceAsset = useCallback(
		(
			fileClass: ReferenceAssetFileClass,
			currentAssetCounts: typeof effectiveReferenceAssetCounts,
		) =>
			fileClass !== "unknown" &&
			canAddReferenceAssetByCounts(
				config.currentInputModeConfig,
				currentAssetCounts,
				fileClass,
				{ ignoreModeMaxCountForTotal: config.selectedInputMode === "omni_reference" },
			),
		[config.currentInputModeConfig, config.selectedInputMode],
	)

	const canAcceptProjectFiles = useCallback(
		(files: ReferenceDropProjectFile[]) => {
			if (!resolveResourceReference) {
				return { accepted: false, status: REFERENCE_RESOURCE_DROP_STATUS.notAvailable }
			}
			return checkProjectReferenceResourceDrop({
				isDropEnabled: canAcceptReferenceDrop,
				files,
				matchableItems,
				currentReferenceFiles: effectiveReferencePaths,
				maxReferenceFiles: effectiveMaxReferenceFiles,
				assetLimits: effectiveReferenceAssetLimits,
				currentAssetCounts: effectiveReferenceAssetCounts,
				canAcceptNextAsset: canAcceptNextReferenceAsset,
				resolveResourceReference,
			})
		},
		[
			canAcceptReferenceDrop,
			effectiveReferencePaths,
			effectiveMaxReferenceFiles,
			effectiveReferenceAssetLimits,
			effectiveReferenceAssetCounts,
			matchableItems,
			resolveResourceReference,
			canAcceptNextReferenceAsset,
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
				canAcceptNextAsset: canAcceptNextReferenceAsset,
			})
		},
		[
			canAcceptReferenceDrop,
			config.fileInputAccept,
			effectiveMaxReferenceFiles,
			effectiveReferenceAssetLimits,
			effectiveReferenceAssetCounts,
			effectiveReferencePaths,
			canAcceptNextReferenceAsset,
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
				canAcceptNextAsset: canAcceptNextReferenceAsset,
			}),
		[
			canAcceptReferenceDrop,
			effectiveMaxReferenceFiles,
			effectiveReferenceAssetLimits,
			effectiveReferenceAssetCounts,
			effectiveReferencePaths,
			canAcceptNextReferenceAsset,
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
				canAcceptNextAsset: canAcceptNextReferenceAsset,
			}),
		[
			canAcceptReferenceDrop,
			config.fileInputAccept,
			effectiveMaxReferenceFiles,
			effectiveReferenceAssetLimits,
			effectiveReferenceAssetCounts,
			effectiveReferencePaths,
			canAcceptNextReferenceAsset,
		],
	)

	const handleProjectFilesDrop = useCallback(
		(files: ReferenceDropProjectFile[]) => {
			if (!resolveResourceReference) return
			const normalizedFiles = normalizeProjectDropFilesForStorage(files, {
				resolveResourceReference,
			})
			const existingReferenceIdentitySet = new Set(
				effectiveReferencePaths.map((path) =>
					getLinkedMediaReferenceIdentity(path, resolveResourceReference),
				),
			)
			const nextFiles: ReferenceDropProjectFile[] = []
			const seenNextIdentitySet = new Set<string>()
			normalizedFiles.forEach((file) => {
				const identity = getLinkedMediaReferenceIdentity(
					file.path,
					resolveResourceReference,
				)
				if (existingReferenceIdentitySet.has(identity)) return
				if (seenNextIdentitySet.has(identity)) return
				seenNextIdentitySet.add(identity)
				nextFiles.push(file)
			})
			const filteredFiles = filterReferenceResourcePanelBatchItems({
				items: nextFiles.map((file) => ({
					data: {
						file_path: file.path,
						file_name: file.fileName,
					},
				})),
				currentReferenceFiles: effectiveReferencePaths,
				assetLimits: effectiveReferenceAssetLimits,
				currentAssetCounts: effectiveReferenceAssetCounts,
				canAcceptNextAsset: canAcceptNextReferenceAsset,
				resolveResourceReference,
			}).map((item) => item.data.file_path)
			const acceptedPathSet = new Set(filteredFiles)
			const acceptedNextFiles = nextFiles.filter((file) => acceptedPathSet.has(file.path))
			if (acceptedNextFiles.length < nextFiles.length) {
				toast.info(
					t("videoEditor.referenceAssetPartialSkipped", {
						defaultValue: "部分素材因类型不支持、重复或达到上限已跳过",
					}),
				)
			}
			const startSlot = config.currentReferenceImages.length
			acceptedNextFiles.forEach((file, index) => {
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
			effectiveReferenceAssetCounts,
			effectiveReferenceAssetLimits,
			handlers,
			resolveResourceReference,
			canAcceptNextReferenceAsset,
			t,
		],
	)

	const handlePaste = useCallback(
		(event: ClipboardEvent<HTMLDivElement>) => {
			const nativeEvent = event.nativeEvent
			const files = CanvasDesignClipboard.readEventFilesSnapshot(nativeEvent)
			const nativeFiles = CanvasDesignClipboard.readAllEventFilesSnapshot(nativeEvent)
			const hasCanvasMime = hasCanvasClipboardMimeType(nativeEvent)
			const hasTextOrHtml = hasCanvasClipboardTextOrHtml(nativeEvent)
			// Keep unsupported native files (such as PDFs) on the existing browser
			// path; this media editor only owns image/video/audio files.
			if (!hasCanvasMime && nativeFiles.length > 0 && files.length === 0) return
			if (!hasCanvasMime && files.length > 0) {
				if (!canAcceptLocalFiles(files).accepted) return
				if (!claimCanvasClipboardPasteEvent(nativeEvent)) return
				event.preventDefault()
				event.stopPropagation()
				void clipboardHandlersRef.current.uploadReferenceFiles(files)
				return
			}
			if (!hasCanvasMime && files.length === 0 && hasTextOrHtml) return

			const selectedSlot = config.selectedResourceSlot
			const targetInputTab = selectedSlot?.inputTab ?? config.activeInputTab
			const frameAcceptedTypes: CanvasClipboardMediaType[] =
				config.supportsStartFrame || config.supportsEndFrame ? ["image"] : []
			const referenceAcceptedTypes: CanvasClipboardMediaType[] = [
				...(config.supportsReferenceImages ? (["image"] as const) : []),
				...(config.supportsReferenceVideos ? (["video"] as const) : []),
				...(config.supportsReferenceAudios ? (["audio"] as const) : []),
			]
			const acceptedTypes =
				targetInputTab === "frame" ? frameAcceptedTypes : referenceAcceptedTypes
			if (acceptedTypes.length === 0) {
				if (hasCanvasMime && claimCanvasClipboardPasteEvent(nativeEvent)) {
					event.preventDefault()
					event.stopPropagation()
				}
				return
			}

			const currentFrameCount = config.currentFrameImages.filter(Boolean).length
			const currentReferenceCount = effectiveReferencePaths.length
			const frameCapacity =
				config.maxFrameImages === undefined
					? undefined
					: Math.max(
							0,
							config.maxFrameImages -
								currentFrameCount +
								(selectedSlot?.inputTab === "frame" && selectedSlot.path ? 1 : 0),
						)
			const referenceCapacity =
				effectiveMaxReferenceFiles === undefined
					? undefined
					: Math.max(
							0,
							effectiveMaxReferenceFiles -
								currentReferenceCount +
								(selectedSlot?.inputTab === "reference" && selectedSlot.path
									? 1
									: 0),
						)
			const selectedReferenceKinds =
				selectedSlot?.inputTab === "reference"
					? selectedSlot.referenceAssetKinds?.length
						? selectedSlot.referenceAssetKinds
						: selectedSlot.referenceAssetKind
							? [selectedSlot.referenceAssetKind]
							: acceptedTypes
					: acceptedTypes
			const targetAcceptedTypes: CanvasClipboardMediaType[] =
				targetInputTab === "frame" ? ["image"] : [...selectedReferenceKinds]
			const referenceTypeCapacity = (kind: "image" | "video" | "audio") => {
				if (!selectedReferenceKinds.includes(kind)) return 0
				const limit =
					kind === "image"
						? effectiveReferenceAssetLimits.reference_images.max
						: kind === "video"
							? effectiveReferenceAssetLimits.reference_videos.max
							: effectiveReferenceAssetLimits.reference_audios.max
				const current =
					kind === "image"
						? effectiveReferenceAssetCounts.images
						: kind === "video"
							? effectiveReferenceAssetCounts.videos
							: effectiveReferenceAssetCounts.audios
				const replacementAllowance =
					selectedSlot?.inputTab === "reference" &&
					selectedSlot.path &&
					selectedSlot.referenceAssetKind === kind
						? 1
						: 0
				return Number.isFinite(limit)
					? Math.max(0, limit - current + replacementAllowance)
					: undefined
			}
			// Capacity already includes one replacement slot when an existing resource
			// is selected. This allows a multi-asset paste to replace the selected
			// resource first and append subsequent assets in order.
			const maxCount = targetInputTab === "frame" ? frameCapacity : referenceCapacity
			const maxCountByType =
				targetInputTab === "frame"
					? { image: frameCapacity }
					: {
							image: referenceTypeCapacity("image"),
							video: referenceTypeCapacity("video"),
							audio: referenceTypeCapacity("audio"),
						}
			let pastedAssetIndex = 0

			void getCanvasClipboardPasteController().paste(
				nativeEvent,
				{
					control: "video-editor",
					acceptedTypes: [...targetAcceptedTypes],
					projectId:
						canvas?.magicConfigManager.config?.methods?.getCanvasClipboardContext?.()
							.projectId,
					canvasId: canvas?.id,
					maxCount,
					maxCountByType,
					sessionId: getClipboardSessionId(),
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
							const selected = selectedSlot
							if (selected) {
								clipboardHandlersRef.current.replaceSelectedResource({
									path: item.data.file_path,
									src: item.data.file_path,
									fileName: item.data.file_name,
								})
							} else {
								editorRef.current?.insertMentionItems([item])
							}
							pastedAssetIndex += 1
							return
						}
						if (!asset.file) return
						const isFirstAsset = pastedAssetIndex === 0
						// uploadReferenceFiles consumes the selected slot for the first
						// asset and subsequent assets intentionally use the normal
						// append/first-empty-slot path so an existing later slot can
						// never be overwritten by a stale selection index.
						await clipboardHandlersRef.current.uploadReferenceFiles([asset.file], {
							ignoreSelectedResourceSlot: !isFirstAsset,
							retainSelectedResourceSlot: Boolean(selectedSlot),
							suppressPartialSkippedToast: true,
						})
						pastedAssetIndex += 1
					},
					onComplete: () => {
						if (selectedSlot) {
							clipboardHandlersRef.current.resetSelectedResourceSlot()
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
			config.maxFrameImages,
			effectiveReferenceAssetLimits,
			effectiveMaxReferenceFiles,
			config.selectedResourceSlot,
			config.supportsEndFrame,
			config.supportsReferenceAudios,
			config.supportsReferenceImages,
			config.supportsReferenceVideos,
			config.supportsStartFrame,
			config.activeInputTab,
			config.currentFrameImages,
			effectiveReferencePaths,
			effectiveReferenceAssetCounts,
			getClipboardSessionId,
		],
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
			clipboardEpochRef.current += 1
			clipboardSessionIdRef.current = getClipboardSessionId()
			setIsSending(true)
			try {
				handlers.cancelPendingDraftPersistence()
				if (submitTarget === "current-content") captureSessionDraft()
				const submitted =
					submitTarget === "new-element"
						? await createAndSubmitVideoGeneration({
								canvas,
								sourceVideoElement: videoElement,
								request: requestParams,
								newElementSize: config.ratioOption,
							})
						: submitTarget === "current-content"
							? await elementInstance.submitContentGeneration(requestParams, {
									recoveryIntent: sessionIntent,
								})
							: await (async () => {
									handlers.saveDraftRequest(
										options?.draftRequest ?? requestParams,
									)
									return elementInstance.generateVideo(requestParams)
								})()
				if (submitted) {
					sessionPersistenceEnabledRef.current = false
					if (sessionStore && sessionKey) {
						sessionStore.clear(sessionKey)
						setHasInterruptedDraft(false)
					}
					onGenerateSubmitSucceeded?.()
				}
			} finally {
				sendingRef.current = false
				if (isMountedRef.current) setIsSending(false)
			}
		},
		[
			canvas,
			config.ratioOption,
			config.selectedModelId,
			captureSessionDraft,
			getClipboardSessionId,
			handlers,
			onGenerateSubmitSucceeded,
			sessionKey,
			sessionStore,
			sessionIntent,
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
			{ ignoreModeMaxCountForTotal: config.selectedInputMode === "omni_reference" },
		)
		if (validationIssues.length > 0) {
			const firstIssue = validationIssues[0]
			if (firstIssue.field === "total") {
				if (firstIssue.reason === "variant") {
					toast.error(
						t("videoEditor.referenceAssetVariantNotMet", {
							defaultValue: "参考素材组合不满足当前模型要求",
						}),
					)
					return
				}
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
		config.selectedInputMode,
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
					resolveResourceReference,
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
		resolveResourceReference,
	])

	const sendButtonBusy = isSending || isEstimateLoading

	return (
		<FloatingSurfaceScope id="video-generate-editor">
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
				<div ref={setSourceListContainer} className={styles.sourceListMount} />
				{linkedEditorInputs.textConnections.length > 0 ? (
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
					mentionItemsReady={Boolean(config.hasRestoredRef.current)}
					onMentionChange={handleMentionChange}
					onMentionItemHoverChange={setHoveredMentionPath}
					mentionEnabled={mentionEnabled}
					onPasteCapture={handlePaste}
				/>
				<VideoEditorControls
					config={config}
					hoveredMentionPath={hoveredMentionPath}
					onSourceListScrollbarChange={setHasSourceListScrollbar}
					onPrepareResourceSlotSelection={handlers.prepareResourceSlotSelection}
					onSelectSource={handleSelectSource}
					onProjectSelect={handleProjectSelect}
					onFocusEditor={() => editorRef.current?.focus()}
					linkedMediaItems={linkedEditorInputs.mediaItems}
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
					renderRestoreDefaultConfigButton={
						hasInterruptedDraft
							? () => (
									<Button
										variant="ghost"
										className={styles.restoreDefaultButton}
										onClick={handleRestoreBaseline}
										data-testid="video-editor-re-enter"
									>
										{t("videoEditor.reEnter", "重新输入")}
									</Button>
								)
							: undefined
					}
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
					sourceListContainer={sourceListContainer}
				/>
			</ReferenceResourceDropSurface>
		</FloatingSurfaceScope>
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
	resolveResourceReference?: ResolveCanvasResourceReference,
): VideoReferenceAssetInfo[] {
	const manualInfoByIdentity = new Map(
		manualInfos.map((info) => [
			getLinkedMediaReferenceIdentity(info.path, resolveResourceReference),
			info,
		]),
	)
	return mergeLinkedMediaReferences(
		manualInfos.map((info) => ({
			kind: info.assetType,
			path: info.path,
		})),
		linkedReferences,
		resolveResourceReference,
	).map(
		(reference) =>
			manualInfoByIdentity.get(
				getLinkedMediaReferenceIdentity(reference.path, resolveResourceReference),
			) ?? buildVideoReferenceAssetInfoFromReference(reference),
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
	resolveResourceReference?: ResolveCanvasResourceReference
}): PromptOptimizationReferenceContext[] {
	const {
		frameImageInfos,
		inputModeConfig,
		referenceImages,
		referenceAssetInfos,
		promptReferences,
		promptPlaceholderTokenConfig,
		resolveResourceReference,
	} = options
	const visualIndexByIdentity = new Map(
		referenceImages.map(
			(path, index) =>
				[
					getCanvasResourceReferenceIdentity(path, resolveResourceReference),
					index + 1,
				] as const,
		),
	)
	const promptReferenceByIdentity = new Map(
		promptReferences.map((reference) => [
			getCanvasResourceReferenceIdentity(reference.path, resolveResourceReference),
			reference,
		]),
	)
	const references: PromptOptimizationReferenceContext[] = []
	const referenceByIdentity = new Map<string, PromptOptimizationReferenceContext>()

	const pushReference = (path: string, reference: PromptOptimizationReferenceContext) => {
		const identity = getCanvasResourceReferenceIdentity(path, resolveResourceReference)
		const existing = referenceByIdentity.get(identity)
		if (existing) {
			mergePromptOptimizationReference(existing, reference)
			return
		}
		referenceByIdentity.set(identity, reference)
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
			visualReferenceIndex: visualIndexByIdentity.get(
				getCanvasResourceReferenceIdentity(info.path, resolveResourceReference),
			),
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
		const promptReference = promptReferenceByIdentity.get(
			getCanvasResourceReferenceIdentity(info.path, resolveResourceReference),
		)
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
				info.assetType === "image"
					? visualIndexByIdentity.get(
							getCanvasResourceReferenceIdentity(info.path, resolveResourceReference),
						)
					: undefined,
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
