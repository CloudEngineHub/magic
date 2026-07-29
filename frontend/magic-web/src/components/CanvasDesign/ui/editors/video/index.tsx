import { useCallback, useEffect, useMemo, useState } from "react"
import { useCanvasSelectionUI } from "../../../app/providers/CanvasUIProvider"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { ElementTypeEnum, type VideoElement } from "../../../runtime/document/types"
import { GenerationStatus } from "../../../public/magic-types"
import { useCanvasEvent } from "../../../app/hooks/canvas"
import MediaResourceFullscreenPreview, {
	type MediaResourceFullscreenPreviewItem,
} from "../../fullscreen/media-resource/index"
import VideoGenerateEditorRender from "./VideoGenerateEditorRender"
import VideoSecondEdit from "./VideoSecondEdit"
import { VideoElement as VideoElementClass } from "../../../runtime/elements/video/VideoElement"

/**
 * 单选非临时视频元素且可编辑时挂载生成编辑器；上传中、生成中、已有成片等状态不展示
 */
export default function VideoGenerateEditor() {
	const { selectedElements, isSelecting, isDragging } = useCanvasSelectionUI()
	const [previewingMediaResource, setPreviewingMediaResource] =
		useState<MediaResourceFullscreenPreviewItem | null>(null)
	const [retryEditingElementId, setRetryEditingElementId] = useState<string | null>(null)

	// 与 ImageMessageEditor 相同：重试 emit 时 Active 可能尚未挂载（useCanvasEvent 在 effect 订阅）
	useCanvasEvent(
		"element:video:retryClick",
		({ data }) => {
			setRetryEditingElementId(data.elementId)
		},
		[],
	)

	const [targetElement] = selectedElements
	const videoElement =
		selectedElements.length === 1 && targetElement?.type === ElementTypeEnum.Video
			? targetElement
			: null

	useEffect(() => {
		const selectedId = videoElement?.id
		if (selectedId == null) {
			setRetryEditingElementId(null)
			return
		}
		if (retryEditingElementId && retryEditingElementId !== selectedId) {
			setRetryEditingElementId(null)
		}
	}, [retryEditingElementId, videoElement?.id])

	const handleCloseMediaResourcePreview = useCallback(() => {
		setPreviewingMediaResource(null)
	}, [])

	const editorEligible = videoElement != null && !isSelecting && !videoElement.locked

	if (!editorEligible && !previewingMediaResource) {
		return null
	}

	return (
		<>
			{editorEligible ? (
				<ActiveVideoGenerateEditor
					videoElement={videoElement}
					isDragging={isDragging}
					retryEditingElementId={retryEditingElementId}
					setRetryEditingElementId={setRetryEditingElementId}
					onPreviewMediaResource={setPreviewingMediaResource}
					isMediaResourcePreviewOpen={previewingMediaResource != null}
				/>
			) : null}
			{previewingMediaResource != null ? (
				<MediaResourceFullscreenPreview
					resource={previewingMediaResource}
					onClose={handleCloseMediaResourcePreview}
				/>
			) : null}
		</>
	)
}

interface ActiveVideoGenerateEditorProps {
	videoElement: VideoElement
	isDragging: boolean
	retryEditingElementId: string | null
	setRetryEditingElementId: (id: string | null) => void
	onPreviewMediaResource: (resource: MediaResourceFullscreenPreviewItem) => void
	isMediaResourcePreviewOpen: boolean
}

function ActiveVideoGenerateEditor({
	videoElement,
	isDragging,
	retryEditingElementId,
	setRetryEditingElementId,
	onPreviewMediaResource,
	isMediaResourcePreviewOpen,
}: ActiveVideoGenerateEditorProps) {
	const { canvas } = useCanvas()
	const [hiddenAfterSubmit, setHiddenAfterSubmit] = useState(false)

	const hasSrc = !!videoElement.src
	const hasTerminalVideoGenerationState =
		hasSrc ||
		videoElement.status === GenerationStatus.Completed ||
		videoElement.status === GenerationStatus.Failed

	const isGenerating = useMemo(() => {
		if (!canvas || hasTerminalVideoGenerationState) return false
		const videoInstance = canvas.elementManager.getElementInstance(videoElement.id)
		if (!(videoInstance instanceof VideoElementClass)) return false
		return !!videoInstance.isGenerating
	}, [canvas, videoElement.id, hasTerminalVideoGenerationState])

	useEffect(() => {
		setHiddenAfterSubmit(false)
	}, [videoElement.id])

	useCanvasEvent(
		"element:video:generate-submit-started",
		({ data }) => {
			if (data.elementId === videoElement.id) {
				setHiddenAfterSubmit(true)
			}
		},
		[videoElement.id],
	)

	useCanvasEvent(
		"element:video:generate-submit-failed",
		({ data }) => {
			if (data.elementId === videoElement.id) {
				setHiddenAfterSubmit(false)
			}
		},
		[videoElement.id],
	)

	useCanvasEvent(
		"element:video:retryClick",
		({ data }) => {
			if (data.elementId === videoElement.id) setHiddenAfterSubmit(false)
		},
		[videoElement.id],
	)

	const handleGenerateSubmitSucceeded = useCallback(() => {
		setRetryEditingElementId(null)
	}, [setRetryEditingElementId])

	const isTemporaryElement =
		canvas != null ? canvas.elementManager.isTemporary(videoElement.id) : false

	const hasGenerateVideoRequest = !!videoElement.generateVideoRequest
	const isError = videoElement.status === GenerationStatus.Failed
	const isRetryEditing = isError && retryEditingElementId === videoElement.id

	const showEditor =
		!isTemporaryElement &&
		(!hasGenerateVideoRequest || isRetryEditing) &&
		!isDragging &&
		!hasSrc &&
		(!isError || isRetryEditing) &&
		!hiddenAfterSubmit &&
		!isGenerating

	const showResultSecondEdit =
		hasSrc && hasGenerateVideoRequest && !isDragging && !isGenerating && !isTemporaryElement

	const resultSecondEditNode = showResultSecondEdit ? (
		<VideoSecondEdit
			key={`${videoElement.id}-result-regenerate`}
			videoElement={videoElement}
			onPreviewMediaResource={onPreviewMediaResource}
			isMediaResourcePreviewOpen={isMediaResourcePreviewOpen}
		/>
	) : null

	const editorNode = showEditor ? (
		<VideoGenerateEditorRender
			key={`${videoElement.id}-${isRetryEditing ? "retry" : "create"}`}
			videoElement={videoElement}
			autoFocus={isRetryEditing}
			autoFocusAtDocumentEnd={isRetryEditing}
			onGenerateSubmitSucceeded={handleGenerateSubmitSucceeded}
			onPreviewMediaResource={onPreviewMediaResource}
			isMediaResourcePreviewOpen={isMediaResourcePreviewOpen}
		/>
	) : null

	if (!editorNode && !resultSecondEditNode) {
		return null
	}

	return (
		<>
			{editorNode}
			{resultSecondEditNode}
		</>
	)
}
