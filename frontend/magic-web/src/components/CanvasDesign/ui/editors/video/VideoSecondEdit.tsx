import { useCallback, useEffect, useMemo, useState } from "react"
import { useEventListener, useLatest } from "ahooks"
import { LoaderCircle, RotateCcw, SquarePen } from "lucide-react"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useMagic } from "../../../app/providers/MagicProvider"
import type { Canvas } from "../../../runtime/core/Canvas"
import { ElementTypeEnum, type VideoElement } from "../../../runtime/document/types"
import { VideoElement as VideoElementClass } from "../../../runtime/elements/video/VideoElement"
import { generateUUID } from "../../../runtime/shared/ids"
import { useElementBottomToolbarSection } from "../../canvas-editor/element-bottom-toolbar/ElementBottomToolbarContext"
import { useElementVersionToolbarSection } from "../../canvas-editor/element-bottom-toolbar/ElementVersionToolbarSection"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import VideoGenerateEditorRender from "./VideoGenerateEditorRender"
import { useVideoPointsConfirm } from "./useVideoPointsConfirm"
import { buildVideoPointsEstimateSignature } from "./points/video-points-estimate.utils"
import { collectPendingVideoGenerationRequestResourcePaths } from "./points/video-points-estimate.resources"
import { resolveVideoPointsEstimateGate } from "./points/video-points-estimate.policy"
import type { GenerateVideoRequest } from "../../../public/magic-types"
import type { MediaResourceFullscreenPreviewItem } from "../../fullscreen/media-resource/index"
import { getActiveContent } from "../../../runtime/document/elementContent"
import { useIsMediaReplacing } from "../../../app/hooks/canvas"
import { useCanvasUI } from "../../../app/providers/CanvasUIProvider"
import { isEditorInteractiveKeyboardTarget } from "../keyboard"
import { resolveVideoReferenceVideoModel } from "./model-config/video-editor-config.model"
import type { VideoEditSessionSnapshot } from "./video-editor-config.types"
import { buildMediaEditSourceFingerprint } from "../../../runtime/interaction/media-edit-recovery/MediaEditRecoveryManager"

interface VideoSecondEditProps {
	videoElement: VideoElement
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
	const { videoElement } = props
	const { canvas } = useCanvas()
	const { methods, videoModelList, getCachedVideoPointsEstimate, getVideoPointsEstimate } =
		useMagic()
	const { t } = useCanvasDesignI18n()
	const { selectedElements } = useCanvasUI()
	const [editingMode, setEditingMode] = useState<"quick-edit" | "re-edit" | null>(null)
	const [isGeneratingAgain, setIsGeneratingAgain] = useState(false)
	const [isPreparingGenerateAgain, setIsPreparingGenerateAgain] = useState(false)
	const isReplacing = useIsMediaReplacing(videoElement.id)
	const isMediaResourcePreviewOpen = props.isMediaResourcePreviewOpen ?? false
	useElementVersionToolbarSection(
		videoElement,
		!editingMode && !isReplacing && !isMediaResourcePreviewOpen,
	)
	const videoContent = getActiveContent(videoElement)
	const savedGenerateVideoRequest = videoContent?.generateVideoRequest
	const sessionStore = canvas?.mediaEditRecoveryManager
	const sessionContentId = videoContent?.contentId ?? videoElement.activeContentId ?? ""
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
		setEditingMode("quick-edit")
	}, [canQuickEdit, canvas, videoElement.id])

	const isEditingRef = useLatest(editingMode !== null)
	const selectedElementsRef = useLatest(selectedElements)
	const handleStartQuickEditRef = useLatest(handleStartQuickEdit)

	useEventListener(
		"keydown",
		(event: KeyboardEvent) => {
			if (isEditingRef.current || isReplacing || isMediaResourcePreviewOpen || !canQuickEdit)
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
					if (submitted) sessionStore?.clearElement(videoElement.id)
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
		sessionStore,
		videoElement,
	])

	const canRestore = Boolean(savedGenerateVideoRequest?.model_id)
	const generateAgainBusy = isGeneratingAgain || isPreparingGenerateAgain

	useEffect(() => {
		if (!isReplacing) return
		setEditingMode(null)
		sessionStore?.clearElement(videoElement.id)
	}, [isReplacing, sessionStore, videoElement.id])

	const resultActionSection = useMemo(
		() => ({
			id: "video-result-actions",
			elementId: videoElement.id,
			order: 10,
			group: "result-actions",
			visible:
				!editingMode &&
				!isReplacing &&
				!isMediaResourcePreviewOpen &&
				(canRestore || canQuickEdit),
			items: [
				canQuickEdit
					? {
							id: "quick-edit",
							group: "quick-edit",
							icon: <SquarePen size={14} />,
							label: t("videoEditor.quickEdit", "快捷编辑"),
							shortcut: "Tab",
							onClick: handleStartQuickEdit,
						}
					: null,
				canRestore
					? {
							id: "re-edit",
							group: "edit",
							icon: <SquarePen size={14} />,
							label: t("videoEditor.reEditFromSaved", "重新编辑"),
							onClick: handleStartRegenerate,
						}
					: null,
				canRestore
					? {
							id: "generate-again",
							group: "generation",
							icon: generateAgainBusy ? (
								<LoaderCircle size={14} className="animate-spin" />
							) : (
								<RotateCcw size={14} />
							),
							label: t("videoEditor.generateAgain", "再次生成"),
							disabled: generateAgainBusy,
							loading: generateAgainBusy,
							onClick: handleGenerateAgain,
						}
					: null,
			],
		}),
		[
			canRestore,
			generateAgainBusy,
			handleGenerateAgain,
			handleStartRegenerate,
			editingMode,
			canQuickEdit,
			isReplacing,
			handleStartQuickEdit,
			isMediaResourcePreviewOpen,
			t,
			videoElement.id,
		],
	)
	useElementBottomToolbarSection(resultActionSection)

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
