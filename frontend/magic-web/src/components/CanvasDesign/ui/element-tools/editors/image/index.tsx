import { useCallback, useEffect, useMemo, useState } from "react"
import { useCanvasModeUI, useCanvasSelectionUI } from "../../../../app/providers/CanvasUIProvider"
import { useCanvas } from "../../../../app/providers/CanvasProvider"
import { ElementTypeEnum, type ImageElement } from "../../../../runtime/document/types"
import {
	getActiveImageContent,
	getActiveImageContentId,
	getContentState,
} from "../../../../runtime/document/elementContent"
import { useImageOssSrc } from "../../../../app/hooks/resources/useImageOssSrc"
import {
	useCanvasEvent,
	useGenerationRuntime,
	useIsMediaReplacing,
} from "../../../../app/hooks/canvas"
import MediaResourceFullscreenPreview, {
	type MediaResourceFullscreenPreviewItem,
} from "../../../fullscreen/media-resource/index"
import ImageMessageEditorRender from "./ImageMessageEditorRender"
import SecondEdit from "./SecondEdit"
import { ImageElement as ImageElementClass } from "../../../../runtime/elements/image/ImageElement"
import type { GenerationToolCommandRequest } from "../../../../runtime/element-tools"

export default function ImageMessageEditor() {
	const { canvas } = useCanvas()
	const { selectedElements, isSelecting, isDragging, activeToolSession } = useCanvasSelectionUI()
	const { croppingElementId, extendingElementId, erasingElementId } = useCanvasModeUI()
	const [retryEditingElementId, setRetryEditingElementId] = useState<string | null>(null)
	const [pendingToolCommand, setPendingToolCommand] =
		useState<GenerationToolCommandRequest | null>(null)
	const [previewingMediaResource, setPreviewingMediaResource] =
		useState<MediaResourceFullscreenPreviewItem | null>(null)

	const [targetElement] = selectedElements
	const imageElement =
		selectedElements.length === 1 && targetElement?.type === ElementTypeEnum.Image
			? targetElement
			: null
	const activeContentId = imageElement ? getActiveImageContentId(imageElement) : undefined
	const isReplacing = useIsMediaReplacing(imageElement?.id)

	// 必须在父级订阅：useCanvasEvent 在 useEffect 注册，未选中时 ActiveImageMessageEditor 未挂载会漏掉同一次点击内的 emit
	useCanvasEvent(
		"element:image:retryClick",
		({ data }) => {
			if (canvas?.mediaReplaceController?.isReplacing?.(data.elementId)) return
			setRetryEditingElementId(data.elementId)
		},
		[canvas],
	)

	useCanvasEvent(
		"element:image:toolCommand",
		({ data }) => {
			if (
				!imageElement ||
				data.elementId !== imageElement.id ||
				!data.contentId ||
				data.contentId !== activeContentId
			) {
				return
			}
			setPendingToolCommand({ toolId: data.toolId, contentId: data.contentId })
		},
		[activeContentId, imageElement?.id],
	)

	useEffect(() => {
		if (isReplacing) setRetryEditingElementId(null)
	}, [isReplacing])

	useEffect(() => {
		const selectedId = imageElement?.id
		if (selectedId == null) {
			setRetryEditingElementId(null)
			setPendingToolCommand(null)
			return
		}
		if (retryEditingElementId && retryEditingElementId !== selectedId) {
			setRetryEditingElementId(null)
		}
		if (pendingToolCommand && pendingToolCommand.contentId !== activeContentId) {
			setPendingToolCommand(null)
		}
	}, [activeContentId, imageElement?.id, pendingToolCommand, retryEditingElementId])

	const editorEligible =
		!!imageElement &&
		!isSelecting &&
		!imageElement.locked &&
		!croppingElementId &&
		!extendingElementId &&
		!erasingElementId &&
		!isReplacing &&
		!activeToolSession

	const handleCloseMediaResourcePreview = useCallback(() => {
		setPreviewingMediaResource(null)
	}, [])

	useEffect(() => {
		if (isReplacing) setPreviewingMediaResource(null)
	}, [isReplacing])

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
					pendingToolCommand={pendingToolCommand}
					onPendingToolCommandHandled={() => setPendingToolCommand(null)}
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
	pendingToolCommand: GenerationToolCommandRequest | null
	onPendingToolCommandHandled: () => void
	onPreviewMediaResource: (resource: MediaResourceFullscreenPreviewItem) => void
	isMediaResourcePreviewOpen: boolean
}

function ActiveImageMessageEditor({
	imageElement,
	isDragging,
	retryEditingElementId,
	pendingToolCommand,
	onPendingToolCommandHandled,
	onPreviewMediaResource,
	isMediaResourcePreviewOpen,
}: ActiveImageMessageEditorProps) {
	const { canvas } = useCanvas()
	const [hiddenAfterSubmit, setHiddenAfterSubmit] = useState(false)
	const activeContent = getActiveImageContent(imageElement)
	const generationRuntime = useGenerationRuntime(imageElement.id, activeContent.contentId)
	const activeContentState = getContentState(activeContent)

	const hasGenerateImageRequest = !!(
		generationRuntime?.generateImageRequest || activeContent.generateImageRequest
	)
	const hasResultImage = !!activeContent.src
	const { hasOssSrc } = useImageOssSrc(imageElement)

	const isTemporaryElement =
		canvas != null ? canvas.elementManager.isTemporary(imageElement.id) : false

	const isUploading = activeContentState === "processing" && !hasGenerateImageRequest

	const isRequestPlaceholder =
		!hasResultImage && (activeContentState === "pending" || activeContentState === "processing")
	const hasTerminalImageGenerationState =
		hasResultImage || activeContentState === "completed" || activeContentState === "failed"

	const hasPendingImageTask =
		!hasResultImage && (activeContentState === "pending" || activeContentState === "processing")
	const hasRuntimeGenerationAttempt = Boolean(generationRuntime)

	const isGenerating = useMemo(() => {
		if (!canvas || hasTerminalImageGenerationState) return false
		const imageInstance = canvas.elementManager.getElementInstance(imageElement.id)
		if (!(imageInstance instanceof ImageElementClass)) return false
		return (
			imageInstance.isImageGenerating(activeContent.contentId) || hasRuntimeGenerationAttempt
		)
	}, [
		activeContent.contentId,
		canvas,
		imageElement.id,
		hasRuntimeGenerationAttempt,
		hasTerminalImageGenerationState,
	])

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
		activeContentState === "failed" && retryEditingElementId === imageElement.id

	// 如果没有生成图片请求且没有结果图片，则显示图片编辑器
	if ((!hasGenerateImageRequest && !hasResultImage) || isRetryEditing) {
		return (
			<ImageMessageEditorRender
				key={`${imageElement.id}-${isRetryEditing ? "retry" : "create"}`}
				imageElement={imageElement}
				autoFocus={isRetryEditing}
				autoFocusAtDocumentEnd={isRetryEditing}
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
				pendingToolCommand={pendingToolCommand}
				onPendingToolCommandHandled={onPendingToolCommandHandled}
				onPreviewMediaResource={onPreviewMediaResource}
				isMediaResourcePreviewOpen={isMediaResourcePreviewOpen}
			/>
		)
	}

	return null
}
