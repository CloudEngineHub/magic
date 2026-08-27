import { useCallback, useEffect, useMemo, useState } from "react"
import { useEventListener, useLatest } from "ahooks"
import { useCanvas } from "../../../../app/providers/CanvasProvider"
import { useMagic } from "../../../../app/providers/MagicProvider"
import type { Canvas } from "../../../../runtime/core/Canvas"
import { ElementTypeEnum, type VideoElement } from "../../../../runtime/document/types"
import { VideoElement as VideoElementClass } from "../../../../runtime/elements/video/VideoElement"
import { generateUUID } from "../../../../runtime/shared/ids"
import VideoGenerateEditorRender from "./VideoGenerateEditorRender"
import { useVideoPointsConfirm } from "./useVideoPointsConfirm"
import { buildVideoPointsEstimateSignature } from "./points/video-points-estimate.utils"
import { collectPendingVideoGenerationRequestResourcePaths } from "./points/video-points-estimate.resources"
import { resolveVideoPointsEstimateGate } from "./points/video-points-estimate.policy"
import type { GenerateVideoRequest } from "../../../../public/magic-types"
import { ElementToolTypeEnum } from "../../../../public/props"
import type { MediaResourceFullscreenPreviewItem } from "../../../fullscreen/media-resource/index"
import {
	getActiveContent,
	getContentGenerationState,
} from "../../../../runtime/document/elementContent"
import { useIsMediaReplacing } from "../../../../app/hooks/canvas"
import { useGenerationRuntime } from "../../../../app/hooks/canvas/useGenerationRuntime"
import { useCanvasUI } from "../../../../app/providers/CanvasUIProvider"
import { isEditorInteractiveKeyboardTarget } from "../../../editors/keyboard"
import { resolveVideoReferenceVideoModel } from "./model-config/video-editor-config.model"
import type { VideoEditSessionSnapshot } from "./video-editor-config.types"
import { buildMediaEditSourceFingerprint } from "../../../../runtime/interaction/media-edit-recovery/MediaEditRecoveryManager"
import { useElementToolCommand } from "../../model/useElementToolCommand"
import type { GenerationToolCommandRequest } from "../../../../runtime/element-tools"

interface VideoSecondEditProps {
	videoElement: VideoElement
	pendingToolCommand?: GenerationToolCommandRequest | null
	onPendingToolCommandHandled?: () => void
	onPreviewMediaResource?: (resource: MediaResourceFullscreenPreviewItem) => void
	isMediaResourcePreviewOpen?: boolean
}

async function waitForPendingVideoGenerationResources(
	canvas: Canvas,
	request: Partial<GenerateVideoRequest>,
): Promise<void> {
	const uploadManager = canvas.canvasFileUploadManager
	const collectPendingPaths = () =>
		collectPendingVideoGenerationRequestResourcePaths(request, (path) =>
			uploadManager.shouldDeferRemoteResourceLoad(path),
		)

	const pendingPaths = collectPendingPaths()
	if (pendingPaths.length === 0) return

	return new Promise<void>((resolve) => {
		let resolved = false
		const finish = () => {
			if (resolved) return
			resolved = true
			unsubscribe()
			resolve()
		}
		const unsubscribe = canvas.eventEmitter.on("resource:remote-load-deferral-released", () => {
			const nextPendingPaths = collectPendingPaths()
			if (nextPendingPaths.length > 0) {
				return
			}

			finish()
		})

		if (collectPendingPaths().length === 0) {
			finish()
		}
	})
}

/** 视频成片结果态：重新编辑可调整已保存请求，再次生成则直接追加同配置 Content。 */
export default function VideoSecondEdit(props: VideoSecondEditProps) {
	const { videoElement, pendingToolCommand, onPendingToolCommandHandled } = props
	const { canvas } = useCanvas()
	const { methods, videoModelList, getCachedVideoPointsEstimate, getVideoPointsEstimate } =
		useMagic()
	const { selectedElements } = useCanvasUI()
	const [editingMode, setEditingMode] = useState<"quick-edit" | "re-edit" | null>(null)
	const [isGeneratingAgain, setIsGeneratingAgain] = useState(false)
	const [isPreparingGenerateAgain, setIsPreparingGenerateAgain] = useState(false)
	const isReplacing = useIsMediaReplacing(videoElement.id)
	const isMediaResourcePreviewOpen = props.isMediaResourcePreviewOpen ?? false
	const videoContent = getActiveContent(videoElement)
	const savedGenerateVideoRequest = videoContent?.generateVideoRequest
	const sessionStore = canvas?.mediaEditRecoveryManager
	const sessionContentId = videoContent?.contentId ?? videoElement.activeContentId ?? ""
	const { activeContentIsGenerating: persistedActiveContentIsGenerating } =
		getContentGenerationState(videoElement)
	const runtimeGeneration = useGenerationRuntime(videoElement.id, sessionContentId)
	const activeContentIsGenerating =
		persistedActiveContentIsGenerating || Boolean(runtimeGeneration)
	const sessionSourceFingerprint = buildMediaEditSourceFingerprint(
		sessionContentId,
		videoContent?.src,
	)
	const confirmVideoGeneration = useVideoPointsConfirm()
	const quickEditModel = resolveVideoReferenceVideoModel(
		videoModelList,
		savedGenerateVideoRequest?.model_id,
	)
	const canQuickEdit = Boolean(videoContent?.src && quickEditModel)

	const handleStartRegenerate = useCallback(() => {
		if (!canvas || !savedGenerateVideoRequest) return
		if (canvas.mediaReplaceController?.isReplacing?.(videoElement.id)) return
		setEditingMode("re-edit")
	}, [canvas, savedGenerateVideoRequest, videoElement.id])

	const handleStartQuickEdit = useCallback(() => {
		if (!canvas || !canQuickEdit) return
		if (canvas.mediaReplaceController?.isReplacing?.(videoElement.id)) return
		if (activeContentIsGenerating) return
		setEditingMode("quick-edit")
	}, [activeContentIsGenerating, canQuickEdit, canvas, videoElement.id])

	const isEditingRef = useLatest(editingMode !== null)
	const selectedElementsRef = useLatest(selectedElements)
	const handleStartQuickEditRef = useLatest(handleStartQuickEdit)

	useEventListener(
		"keydown",
		(event: KeyboardEvent) => {
			if (
				isEditingRef.current ||
				isReplacing ||
				isMediaResourcePreviewOpen ||
				!canQuickEdit ||
				activeContentIsGenerating
			)
				return
			if (
				!selectedElementsRef.current?.some(
					(element) =>
						element?.type === ElementTypeEnum.Video && element.id === videoElement.id,
				)
			) {
				return
			}
			if (isEditorInteractiveKeyboardTarget(event.target)) return
			if (event.key !== "Tab" || event.shiftKey) return
			event.preventDefault()
			handleStartQuickEditRef.current?.()
		},
		{ target: window },
	)

	const handleGenerateAgain = useCallback(async () => {
		const generateVideoRequest = savedGenerateVideoRequest
		if (!canvas || !generateVideoRequest || isGeneratingAgain || isPreparingGenerateAgain)
			return
		if (canvas.mediaReplaceController?.isReplacing?.(videoElement.id)) return

		setIsPreparingGenerateAgain(true)
		let estimatedPoints: number | null = null
		try {
			const estimateSignature = buildVideoPointsEstimateSignature(generateVideoRequest)
			const hasPendingResourceDeferrals =
				collectPendingVideoGenerationRequestResourcePaths(generateVideoRequest, (path) =>
					canvas.canvasFileUploadManager.shouldDeferRemoteResourceLoad(path),
				).length > 0
			const estimateGate = resolveVideoPointsEstimateGate({
				enabled: true,
				request: generateVideoRequest,
				signature: estimateSignature,
				hasEstimateVideoPoints: Boolean(methods?.estimateVideoPoints),
				hasPendingResourceDeferrals,
			})
			if (estimateGate.blockedReason === "pending_resource_deferrals") {
				await waitForPendingVideoGenerationResources(canvas, generateVideoRequest)
			}
			const canEstimateAfterResourceWait =
				estimateGate.blockedReason === "pending_resource_deferrals"
					? resolveVideoPointsEstimateGate({
							enabled: true,
							request: generateVideoRequest,
							signature: estimateSignature,
							hasEstimateVideoPoints: Boolean(methods?.estimateVideoPoints),
							hasPendingResourceDeferrals: false,
						}).canEstimate
					: estimateGate.canEstimate
			if (canEstimateAfterResourceWait) {
				try {
					const cachedEstimate = getCachedVideoPointsEstimate(estimateSignature)
					const estimate =
						cachedEstimate ??
						(await getVideoPointsEstimate({
							signature: estimateSignature,
							request: generateVideoRequest,
						}))
					estimatedPoints = typeof estimate.points === "number" ? estimate.points : null
				} catch {
					estimatedPoints = null
				}
			}
		} finally {
			setIsPreparingGenerateAgain(false)
		}

		await confirmVideoGeneration({
			points: estimatedPoints,
			onConfirm: async () => {
				if (canvas.mediaReplaceController?.isReplacing?.(videoElement.id)) return
				setIsGeneratingAgain(true)
				try {
					const elementInstance = canvas.elementManager.getElementInstance(
						videoElement.id,
					)
					if (!(elementInstance instanceof VideoElementClass)) return
					const submitted = await elementInstance.submitContentGeneration({
						...generateVideoRequest,
						video_id: generateUUID(),
					})
					if (submitted) sessionStore?.clearContent(videoElement.id, sessionContentId)
				} finally {
					setIsGeneratingAgain(false)
				}
			},
		})
	}, [
		canvas,
		confirmVideoGeneration,
		getCachedVideoPointsEstimate,
		getVideoPointsEstimate,
		isGeneratingAgain,
		isPreparingGenerateAgain,
		methods?.estimateVideoPoints,
		savedGenerateVideoRequest,
		sessionContentId,
		sessionStore,
		videoElement,
	])

	useEffect(() => {
		if (
			!pendingToolCommand ||
			pendingToolCommand.contentId !== sessionContentId ||
			activeContentIsGenerating ||
			isReplacing ||
			isMediaResourcePreviewOpen
		) {
			return
		}

		// 消费时仍以命令中捕获的 ContentId 为边界，避免版本切换后复用
		// 当前 active Content 的请求。
		onPendingToolCommandHandled?.()
		switch (pendingToolCommand.toolId) {
			case ElementToolTypeEnum.GenerationQuickEdit:
				handleStartQuickEdit()
				return
			case ElementToolTypeEnum.GenerationReEdit:
				handleStartRegenerate()
				return
			case ElementToolTypeEnum.GenerationGenerateAgain:
				void handleGenerateAgain()
				return
		}
	}, [
		activeContentIsGenerating,
		handleGenerateAgain,
		handleStartQuickEdit,
		handleStartRegenerate,
		isMediaResourcePreviewOpen,
		isReplacing,
		onPendingToolCommandHandled,
		pendingToolCommand,
		sessionContentId,
	])

	const canRestore = Boolean(savedGenerateVideoRequest?.model_id)
	const generateAgainBusy = isGeneratingAgain || isPreparingGenerateAgain

	useEffect(() => {
		if (!isReplacing) return
		setEditingMode(null)
		sessionStore?.clearContent(videoElement.id, sessionContentId)
	}, [isReplacing, sessionContentId, sessionStore, videoElement.id])

	useElementToolCommand(
		useMemo(
			() => ({
				elementId: videoElement.id,
				contentId: sessionContentId,
				toolId: ElementToolTypeEnum.GenerationQuickEdit,
				state: {
					available:
						canQuickEdit && !editingMode && !isReplacing && !isMediaResourcePreviewOpen,
				},
				execute: handleStartQuickEdit,
			}),
			[
				canQuickEdit,
				editingMode,
				handleStartQuickEdit,
				isMediaResourcePreviewOpen,
				isReplacing,
				sessionContentId,
				videoElement.id,
			],
		),
	)
	useElementToolCommand(
		useMemo(
			() => ({
				elementId: videoElement.id,
				contentId: sessionContentId,
				toolId: ElementToolTypeEnum.GenerationReEdit,
				state: {
					available:
						canRestore && !editingMode && !isReplacing && !isMediaResourcePreviewOpen,
				},
				execute: handleStartRegenerate,
			}),
			[
				canRestore,
				editingMode,
				handleStartRegenerate,
				isMediaResourcePreviewOpen,
				isReplacing,
				sessionContentId,
				videoElement.id,
			],
		),
	)
	useElementToolCommand(
		useMemo(
			() => ({
				elementId: videoElement.id,
				contentId: sessionContentId,
				toolId: ElementToolTypeEnum.GenerationGenerateAgain,
				state: {
					available:
						canRestore && !editingMode && !isReplacing && !isMediaResourcePreviewOpen,
					disabled: generateAgainBusy,
					loading: generateAgainBusy,
				},
				execute: handleGenerateAgain,
			}),
			[
				canRestore,
				editingMode,
				generateAgainBusy,
				handleGenerateAgain,
				isMediaResourcePreviewOpen,
				isReplacing,
				sessionContentId,
				videoElement.id,
			],
		),
	)

	if (isReplacing) return null

	if (!editingMode) return null

	return (
		<VideoGenerateEditorRender
			key={`${videoElement.id}-from-result-${editingMode}`}
			videoElement={videoElement}
			autoFocus
			autoFocusAtDocumentEnd
			restoreOnMount={editingMode === "quick-edit" ? "quickEdit" : "originalRequestOnly"}
			submitTarget={editingMode === "quick-edit" ? "new-element" : "current-content"}
			sessionIntent={editingMode}
			sessionSourceFingerprint={sessionSourceFingerprint}
			sessionSnapshot={
				sessionStore?.get<VideoEditSessionSnapshot>(
					{
						elementId: videoElement.id,
						contentId: sessionContentId,
						intent: editingMode,
					},
					sessionSourceFingerprint,
				)?.draft
			}
			syncElementSize={false}
			onGenerateSubmitSucceeded={() => setEditingMode(null)}
			onPreviewMediaResource={props.onPreviewMediaResource}
			isMediaResourcePreviewOpen={props.isMediaResourcePreviewOpen}
		/>
	)
}
