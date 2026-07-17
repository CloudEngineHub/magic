import { useCallback, useMemo, useState } from "react"
import { LoaderCircle, RotateCcw, SquarePen } from "lucide-react"
import { useCanvasUI } from "../../context/CanvasUIContext"
import { useCanvas } from "../../context/CanvasContext"
import { useMagic } from "../../context/MagicContext"
import useElementPositionEffect from "../../hooks/useElementPositionEffect"
import { useFloatingComponent } from "../../hooks/useFloatingComponent"
import type { Canvas } from "../../canvas/Canvas"
import { ElementTypeEnum, type VideoElement } from "../../canvas/types"
import { VideoElement as VideoElementClass } from "../../canvas/element/elements/VideoElement"
import { generateUUID } from "../../canvas/utils/utils"
import IconButton from "../ui/custom/IconButton"
import { MediaResultActionBar } from "../canvas-editor/MediaResultActionBar"
import { useCanvasDesignI18n } from "../../context/I18nContext"
import VideoGenerateEditorRender from "./VideoGenerateEditorRender"
import styles from "./index.module.css"
import { createAndSubmitVideoGeneration } from "./createAndSubmitVideoGeneration"
import { useVideoPointsConfirm } from "./useVideoPointsConfirm"
import { resolveVideoGenerationSelection } from "./video-editor-config.generation"
import { buildVideoPointsEstimateSignature } from "./video-points-estimate.utils"
import { collectPendingVideoGenerationRequestResourcePaths } from "./video-points-estimate.resources"
import type { GenerateVideoRequest } from "../../types.magic"
import type { MediaResourceFullscreenPreviewItem } from "../MediaResourceFullscreenPreview"

interface VideoSecondEditProps {
	videoElement: VideoElement
	onPreviewMediaResource?: (resource: MediaResourceFullscreenPreviewItem) => void
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

/**
 * 视频成片后的结果态：仅提供「重新生成」，展开后与主生成编辑器一致，且仅按 generateVideoRequest 恢复。
 */
export default function VideoSecondEdit(props: VideoSecondEditProps) {
	const { videoElement } = props
	const { selectedElements } = useCanvasUI()
	const { canvas } = useCanvas()
	const { videoModelList, methods, getCachedVideoPointsEstimate, getVideoPointsEstimate } =
		useMagic()
	const { t } = useCanvasDesignI18n()
	const [isEditing, setIsEditing] = useState(false)
	const [isGeneratingAgain, setIsGeneratingAgain] = useState(false)
	const [isPreparingGenerateAgain, setIsPreparingGenerateAgain] = useState(false)
	const confirmVideoGeneration = useVideoPointsConfirm()
	const estimateRequest = videoElement.generateVideoRequest ?? null
	const generateAgainElementSize = useMemo(() => {
		if (!estimateRequest?.generation) return null
		const model = videoModelList.find((item) => item.model_id === estimateRequest.model_id)
		return resolveVideoGenerationSelection(model, estimateRequest.generation).size
	}, [estimateRequest, videoModelList])

	const { containerRef: positionRef } = useElementPositionEffect({
		position: "bottom",
		offset: 12,
		shouldShow: () => {
			return selectedElements.some((element) => element?.type === ElementTypeEnum.Video)
		},
	})

	const { containerRef: floatingRef } = useFloatingComponent({
		id: "video-second-edit",
		enableWheelForwarding: true,
	})

	const setCollapsedRefs = useCallback(
		(node: HTMLDivElement | null) => {
			positionRef.current = node
			floatingRef.current = node
		},
		[positionRef, floatingRef],
	)

	const handleStartRegenerate = useCallback(() => {
		if (!canvas || !videoElement.generateVideoRequest) return
		const inst = canvas.elementManager.getElementInstance(videoElement.id)
		if (inst instanceof VideoElementClass) {
			inst.clearTempGenerateVideoRequest()
		}
		setIsEditing(true)
	}, [canvas, videoElement.id, videoElement.generateVideoRequest])

	const handleGenerateAgain = useCallback(async () => {
		const generateVideoRequest = videoElement.generateVideoRequest
		if (!canvas || !generateVideoRequest || isGeneratingAgain || isPreparingGenerateAgain)
			return

		setIsPreparingGenerateAgain(true)
		let estimatedPoints: number | null = null
		try {
			await waitForPendingVideoGenerationResources(canvas, generateVideoRequest)
			const estimateSignature = buildVideoPointsEstimateSignature(generateVideoRequest)
			if (
				estimateSignature &&
				generateVideoRequest.model_id &&
				methods?.estimateVideoPoints
			) {
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
				setIsGeneratingAgain(true)
				try {
					await createAndSubmitVideoGeneration({
						canvas,
						sourceVideoElement: videoElement,
						newElementSize: generateAgainElementSize,
						request: {
							...generateVideoRequest,
							video_id: generateUUID(),
						},
					})
				} finally {
					setIsGeneratingAgain(false)
				}
			},
		})
	}, [
		canvas,
		confirmVideoGeneration,
		generateAgainElementSize,
		getCachedVideoPointsEstimate,
		getVideoPointsEstimate,
		isGeneratingAgain,
		isPreparingGenerateAgain,
		methods?.estimateVideoPoints,
		videoElement,
	])

	const canRestore = Boolean(videoElement.generateVideoRequest?.model_id)
	const generateAgainBusy = isGeneratingAgain || isPreparingGenerateAgain

	if (!isEditing) {
		if (!canRestore) {
			return null
		}
		return (
			<div
				ref={setCollapsedRefs}
				className={`${styles.videoMessageEditor} ${styles.videoSecondEditNoEditing}`}
				data-canvas-ui-component
			>
				<MediaResultActionBar
					showDividers
					dividerBeforeIndices={[]}
					actions={[
						<IconButton
							className={styles.secondEditButton}
							onClick={handleStartRegenerate}
							key="re-edit"
						>
							<SquarePen size={14} />
							<span>{t("videoEditor.reEditFromSaved", "重新编辑")}</span>
						</IconButton>,
						<IconButton
							className={styles.secondEditButton}
							onClick={handleGenerateAgain}
							disabled={generateAgainBusy}
							key="generate-again"
						>
							{generateAgainBusy ? (
								<LoaderCircle size={14} className="animate-spin" />
							) : (
								<RotateCcw size={14} />
							)}
							<span>{t("videoEditor.generateAgain", "再次生成")}</span>
						</IconButton>,
					]}
				/>
			</div>
		)
	}

	return (
		<VideoGenerateEditorRender
			key={`${videoElement.id}-from-result`}
			videoElement={videoElement}
			autoFocus
			restoreOnMount="originalRequestOnly"
			submitTarget="new-element"
			syncElementSize={false}
			onPreviewMediaResource={props.onPreviewMediaResource}
		/>
	)
}
