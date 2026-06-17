import { useCallback, useMemo, useState } from "react"
import { LoaderCircle, RotateCcw, SquarePen } from "lucide-react"
import { useCanvasUI } from "../../context/CanvasUIContext"
import { useCanvas } from "../../context/CanvasContext"
import { useMagic } from "../../context/MagicContext"
import useElementPositionEffect from "../../hooks/useElementPositionEffect"
import { useFloatingComponent } from "../../hooks/useFloatingComponent"
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
import { useVideoPointsEstimate } from "./useVideoPointsEstimate"
import { resolveVideoGenerationSelection } from "./video-editor-config.generation"
import { buildVideoPointsEstimateSignature } from "./video-points-estimate.utils"

interface VideoSecondEditProps {
	videoElement: VideoElement
}

/**
 * 视频成片后的结果态：仅提供「重新生成」，展开后与主生成编辑器一致，且仅按 generateVideoRequest 恢复。
 */
export default function VideoSecondEdit(props: VideoSecondEditProps) {
	const { videoElement } = props
	const { selectedElements } = useCanvasUI()
	const { canvas } = useCanvas()
	const { videoModelList } = useMagic()
	const { t } = useCanvasDesignI18n()
	const [isEditing, setIsEditing] = useState(false)
	const [isGeneratingAgain, setIsGeneratingAgain] = useState(false)
	const confirmVideoGeneration = useVideoPointsConfirm()
	const estimateRequest = videoElement.generateVideoRequest ?? null
	const estimateSignature = useMemo(() => {
		if (!estimateRequest) return null
		return buildVideoPointsEstimateSignature(estimateRequest)
	}, [estimateRequest])
	const { points: estimatedPoints, isLoading: isEstimateLoading } = useVideoPointsEstimate({
		request: estimateRequest,
		signature: estimateSignature,
		enabled: Boolean(estimateRequest?.model_id),
	})
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
		if (!canvas || !generateVideoRequest || isGeneratingAgain || isEstimateLoading) return
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
		estimatedPoints,
		generateAgainElementSize,
		isEstimateLoading,
		isGeneratingAgain,
		videoElement,
	])

	const canRestore = Boolean(videoElement.generateVideoRequest?.model_id)
	const generateAgainBusy = isGeneratingAgain || isEstimateLoading

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
		/>
	)
}
