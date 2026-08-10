import { useCallback, useState } from "react"
import { LoaderCircle, RotateCcw, SquarePen } from "lucide-react"
import { useCanvasUI } from "../../../app/providers/CanvasUIProvider"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useMagic } from "../../../app/providers/MagicProvider"
import useElementPositionEffect from "../../../app/hooks/layout/useElementPositionEffect"
import { useFloatingComponent } from "../../../app/hooks/layout/useFloatingComponent"
import type { Canvas } from "../../../runtime/core/Canvas"
import { ElementTypeEnum, type VideoElement } from "../../../runtime/document/types"
import { VideoElement as VideoElementClass } from "../../../runtime/elements/video/VideoElement"
import { generateUUID } from "../../../runtime/shared/ids"
import IconButton from "../../primitives/custom/IconButton/index"
import { MediaResultActionBar } from "../../canvas-editor/media-result-action-bar/MediaResultActionBar"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import VideoGenerateEditorRender from "./VideoGenerateEditorRender"
import styles from "./index.module.css"
import { useVideoPointsConfirm } from "./useVideoPointsConfirm"
import { buildVideoPointsEstimateSignature } from "./points/video-points-estimate.utils"
import { collectPendingVideoGenerationRequestResourcePaths } from "./points/video-points-estimate.resources"
import { resolveVideoPointsEstimateGate } from "./points/video-points-estimate.policy"
import type { GenerateVideoRequest } from "../../../public/magic-types"
import type { MediaResourceFullscreenPreviewItem } from "../../fullscreen/media-resource/index"
import { getActiveContent } from "../../../runtime/document/elementContent"

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
	const { selectedElements } = useCanvasUI()
	const { canvas } = useCanvas()
	const { methods, getCachedVideoPointsEstimate, getVideoPointsEstimate } = useMagic()
	const { t } = useCanvasDesignI18n()
	const [isEditing, setIsEditing] = useState(false)
	const [isGeneratingAgain, setIsGeneratingAgain] = useState(false)
	const [isPreparingGenerateAgain, setIsPreparingGenerateAgain] = useState(false)
	const videoContent = getActiveContent(videoElement)
	const savedGenerateVideoRequest = videoContent?.generateVideoRequest
	const confirmVideoGeneration = useVideoPointsConfirm()

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
		if (!canvas || !savedGenerateVideoRequest) return
		const inst = canvas.elementManager.getElementInstance(videoElement.id)
		if (inst instanceof VideoElementClass) {
			inst.clearTempGenerateVideoRequest()
		}
		setIsEditing(true)
	}, [canvas, savedGenerateVideoRequest, videoElement.id])

	const handleGenerateAgain = useCallback(async () => {
		const generateVideoRequest = savedGenerateVideoRequest
		if (!canvas || !generateVideoRequest || isGeneratingAgain || isPreparingGenerateAgain)
			return

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
				setIsGeneratingAgain(true)
				try {
					const elementInstance = canvas.elementManager.getElementInstance(
						videoElement.id,
					)
					if (!(elementInstance instanceof VideoElementClass)) return
					await elementInstance.submitContentGeneration({
						...generateVideoRequest,
						video_id: generateUUID(),
					})
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
		videoElement,
	])

	const canRestore = Boolean(savedGenerateVideoRequest?.model_id)
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
			submitTarget="current-content"
			syncElementSize={false}
			onPreviewMediaResource={props.onPreviewMediaResource}
			isMediaResourcePreviewOpen={props.isMediaResourcePreviewOpen}
		/>
	)
}
