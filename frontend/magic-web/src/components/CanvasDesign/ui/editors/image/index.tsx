import { useCallback, useEffect, useMemo, useState } from "react"
import { useCanvasModeUI, useCanvasSelectionUI } from "../../../app/providers/CanvasUIProvider"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { ElementTypeEnum, type ImageElement } from "../../../runtime/document/types"
import { GenerationStatus } from "../../../public/magic-types"
import { useImageOssSrc } from "../../../app/hooks/resources/useImageOssSrc"
import { useCanvasEvent, useGenerationRuntime } from "../../../app/hooks/canvas"
import MediaResourceFullscreenPreview, {
	type MediaResourceFullscreenPreviewItem,
} from "../../fullscreen/media-resource/index"
import ImageMessageEditorRender from "./ImageMessageEditorRender"
import SecondEdit from "./SecondEdit"
import { ImageElement as ImageElementClass } from "../../../runtime/elements/image/ImageElement"

export default function ImageMessageEditor() {
	const { selectedElements, isSelecting, isDragging, subElementTooltip } = useCanvasSelectionUI()
	const { croppingElementId, extendingElementId, erasingElementId } = useCanvasModeUI()
	const [retryEditingElementId, setRetryEditingElementId] = useState<string | null>(null)
	const [previewingMediaResource, setPreviewingMediaResource] =
		useState<MediaResourceFullscreenPreviewItem | null>(null)

	const [targetElement] = selectedElements
	const imageElement =
		selectedElements.length === 1 && targetElement?.type === ElementTypeEnum.Image
			? targetElement
			: null

	// 必须在父级订阅：useCanvasEvent 在 useEffect 注册，未选中时 ActiveImageMessageEditor 未挂载会漏掉同一次点击内的 emit
	useCanvasEvent(
		"element:image:retryClick",
		({ data }) => {
			setRetryEditingElementId(data.elementId)
		},
		[],
	)

	useEffect(() => {
		const selectedId = imageElement?.id
		if (selectedId == null) {
			setRetryEditingElementId(null)
			return
		}
		if (retryEditingElementId && retryEditingElementId !== selectedId) {
			setRetryEditingElementId(null)
		}
	}, [imageElement?.id, retryEditingElementId])

	const editorEligible =
		!!imageElement &&
		!isSelecting &&
		!imageElement.locked &&
		!croppingElementId &&
		!extendingElementId &&
		!erasingElementId &&
		!subElementTooltip

	const handleCloseMediaResourcePreview = useCallback(() => {
		setPreviewingMediaResource(null)
	}, [])

	if (!editorEligible && !previewingMediaResource) {
		return null
	}

	return (
		<>
			{editorEligible ? (
				<ActiveImageMessageEditor
					imageElement={imageElement}
					isDragging={isDragging}
					retryEditingElementId={retryEditingElementId}
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

interface ActiveImageMessageEditorProps {
	imageElement: ImageElement
	isDragging: boolean
	retryEditingElementId: string | null
	onPreviewMediaResource: (resource: MediaResourceFullscreenPreviewItem) => void
	isMediaResourcePreviewOpen: boolean
}

function ActiveImageMessageEditor({
	imageElement,
	isDragging,
	retryEditingElementId,
	onPreviewMediaResource,
	isMediaResourcePreviewOpen,
}: ActiveImageMessageEditorProps) {
	const { canvas } = useCanvas()
	const [hiddenAfterSubmit, setHiddenAfterSubmit] = useState(false)
	const generationRuntime = useGenerationRuntime(imageElement.id)

	const hasGenerateImageRequest = !!(
		generationRuntime?.generateImageRequest || imageElement.generateImageRequest
	)
	const hasResultImage = !!imageElement.src
	const { hasOssSrc } = useImageOssSrc(imageElement)

	const isTemporaryElement =
		canvas != null ? canvas.elementManager.isTemporary(imageElement.id) : false

	const isUploading =
		imageElement.status === GenerationStatus.Processing && !hasGenerateImageRequest

	const isRequestPlaceholder =
		!hasResultImage &&
		(imageElement.status === GenerationStatus.Pending ||
			imageElement.status === GenerationStatus.Processing)
	const hasTerminalImageGenerationState =
		hasResultImage ||
		imageElement.status === GenerationStatus.Completed ||
		imageElement.status === GenerationStatus.Failed

	const hasPendingImageTask =
		!!imageElement.imageGenerationTaskMeta &&
		!hasResultImage &&
		imageElement.status !== GenerationStatus.Failed
	const hasRuntimeGenerationAttempt = Boolean(generationRuntime)

	const isGenerating = useMemo(() => {
		if (!canvas || hasTerminalImageGenerationState) return false
		const imageInstance = canvas.elementManager.getElementInstance(imageElement.id)
		if (!(imageInstance instanceof ImageElementClass)) return false
		return imageInstance.isImageGenerating() || hasRuntimeGenerationAttempt
	}, [canvas, imageElement.id, hasTerminalImageGenerationState, hasRuntimeGenerationAttempt])

	useEffect(() => {
		setHiddenAfterSubmit(false)
	}, [imageElement.id])

	useCanvasEvent(
		"element:image:generate-submit-started",
		({ data }) => {
			if (data.elementId === imageElement.id) {
				setHiddenAfterSubmit(true)
			}
		},
		[imageElement.id],
	)

	useCanvasEvent(
		"element:image:generate-submit-failed",
		({ data }) => {
			if (data.elementId === imageElement.id) {
				setHiddenAfterSubmit(false)
			}
		},
		[imageElement.id],
	)

	useCanvasEvent(
		"element:image:retryClick",
		({ data }) => {
			if (data.elementId === imageElement.id) setHiddenAfterSubmit(false)
		},
		[imageElement.id],
	)

	if (
		isTemporaryElement ||
		isUploading ||
		isRequestPlaceholder ||
		isDragging ||
		hiddenAfterSubmit ||
		isGenerating ||
		hasPendingImageTask
	)
		return null

	const isRetryEditing =
		imageElement.status === GenerationStatus.Failed && retryEditingElementId === imageElement.id

	// 如果没有生成图片请求且没有结果图片，则显示图片编辑器
	if ((!hasGenerateImageRequest && !hasResultImage) || isRetryEditing) {
		return (
			<ImageMessageEditorRender
				key={`${imageElement.id}-${isRetryEditing ? "retry" : "create"}`}
				imageElement={imageElement}
				autoFocus={isRetryEditing}
				autoFocusAtDocumentEnd={isRetryEditing}
				preferCurrentRequestOnRestore={isRetryEditing}
				onPreviewMediaResource={onPreviewMediaResource}
				isMediaResourcePreviewOpen={isMediaResourcePreviewOpen}
			/>
		)
	}

	// 如果有结果图片且 ossSrc 已加载，则显示二次编辑
	if (hasResultImage && hasOssSrc) {
		return (
			<SecondEdit
				key={imageElement.id}
				imageElement={imageElement}
				onPreviewMediaResource={onPreviewMediaResource}
				isMediaResourcePreviewOpen={isMediaResourcePreviewOpen}
			/>
		)
	}

	return null
}
