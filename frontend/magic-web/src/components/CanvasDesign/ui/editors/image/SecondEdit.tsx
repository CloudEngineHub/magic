import { useCallback, useEffect, useRef, useState } from "react"
import { useEventListener, useLatest } from "ahooks"
import { ElementTypeEnum, type ImageElement } from "../../../runtime/document/types"
import { useCanvasUI } from "../../../app/providers/CanvasUIProvider"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useMagic } from "../../../app/providers/MagicProvider"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import useElementPositionEffect from "../../../app/hooks/layout/useElementPositionEffect"
import IconButton from "../../primitives/custom/IconButton/index"
import { MediaResultActionBar } from "../../canvas-editor/media-result-action-bar/MediaResultActionBar"
import styles from "./index.module.css"
import { LoaderCircle, Pencil, RotateCcw, SquarePen } from "lucide-react"
import { type MessageEditorRef } from "../message/MessageEditor"
import { ImageElement as ImageElementClass } from "../../../runtime/elements/image/ImageElement"
import {
	generateElementId,
	calculateNewElementPosition,
	getDefaultImageSize,
} from "../../../runtime/shared/ids"
import { getCanvasResourceFileName } from "../../../runtime/shared/path/canvasResourcePath"
import { getImageProcessRequestPayload } from "../../../runtime/resources/image/imageCropUtils"
import type { GenerateImageRequest } from "../../../public/magic-types"
import { useImageEditorConfig } from "./useImageEditorConfig"
import { useFloatingComponent } from "../../../app/hooks/layout/useFloatingComponent"
import ImageEditorSurface from "./ImageEditorSurface"
import type { MediaResourceFullscreenPreviewItem } from "../../fullscreen/media-resource/index"
import type { LinkedEditorInputsState } from "../connection/useLinkedEditorInputs"
import { buildImageRequestWithLinkedEditorInputs } from "../connection/linkedImageRequest"
import { createAndSubmitImageGeneration as createAndSubmitNewImageGeneration } from "./submit/createAndSubmitImageGeneration"

interface SecondEditProps {
	imageElement: ImageElement
	onPreviewMediaResource?: (resource: MediaResourceFullscreenPreviewItem) => void
	isMediaResourcePreviewOpen?: boolean
}

export default function SecondEdit(props: SecondEditProps) {
	const { selectedElements } = useCanvasUI()
	const { canvas } = useCanvas()
	const { imageModelList } = useMagic()
	const { t } = useCanvasDesignI18n()
	const editorRef = useRef<MessageEditorRef>(null)
	const [pendingOpenMode, setPendingOpenMode] = useState<"quick-edit" | "regenerate" | null>(null)

	// 使用共享的配置 hook（ossSrc 会直接从实例中获取，因为二次编辑只有在 ossSrc 准备好后才会显示）
	const config = useImageEditorConfig({
		imageElement: props.imageElement,
		originalImageSrc: props.imageElement.src,
		editorFocusRef: editorRef,
		originalImageName:
			// 从 src 字段提取文件名（例如："/超级画布/images/111.jpg" -> "111.jpg"）
			getCanvasResourceFileName(props.imageElement.src) ||
			props.imageElement.name ||
			t("imageEditor.originalImage", "原图"), // 从 src 提取文件名，否则使用 name，最后使用默认值
	})

	const { prompt, handlers } = config
	const { restoreQuickEditConfigToUi, restoreOriginalGenerateImageRequestToUi, setPrompt } =
		handlers

	const [isEditing, setIsEditing] = useState<boolean>(false)
	const [isVisible, setIsVisible] = useState<boolean>(true)
	const [isSending, setIsSending] = useState(false)
	const sendingRef = useRef(false)
	const canRegenerate = Boolean(props.imageElement.generateImageRequest?.model_id)
	const directGenerateRequest = props.imageElement.generateImageRequest

	const { containerRef: positionRef } = useElementPositionEffect({
		position: "bottom",
		offset: 12,
		shouldShow: () => {
			return selectedElements.some((element) => element?.type === ElementTypeEnum.Image)
		},
	})

	const { containerRef: floatingRef } = useFloatingComponent({
		id: "second-edit-result",
		enableWheelForwarding: true,
	})

	// 合并 refs
	const setRefs = useCallback(
		(node: HTMLDivElement | null) => {
			positionRef.current = node
			floatingRef.current = node
		},
		[positionRef, floatingRef],
	)

	const createAndSubmitImageGeneration = useCallback(
		async (
			request: GenerateImageRequest,
			options?: {
				closeEditorOnSuccess?: boolean
				clearEditorPromptOnSuccess?: boolean
				deselectOnSuccess?: boolean
			},
		) => {
			if (sendingRef.current) return false
			if (!canvas || !request.prompt?.trim() || !request.model_id) {
				return false
			}

			// 获取原图片元素实例
			const originalElementInstance = canvas.elementManager.getElementInstance(
				props.imageElement.id,
			)
			if (
				!originalElementInstance ||
				!(originalElementInstance instanceof ImageElementClass)
			) {
				return false
			}

			// 新元素位置间距常量（像素）
			const NEW_ELEMENT_SPACING = 0

			// 计算新元素的位置（放在原元素右边，顶部对齐）
			const newPosition = calculateNewElementPosition(
				props.imageElement,
				originalElementInstance,
				canvas.elementManager,
				NEW_ELEMENT_SPACING,
			)
			if (!newPosition) {
				return false
			}
			const { x: newX, y: newY } = newPosition

			const originalElement = props.imageElement
			let imageInfo = originalElementInstance.getImageInfo()
			if (!imageInfo?.naturalWidth || !imageInfo?.naturalHeight) {
				await originalElementInstance.getHTMLImageElement({ variant: "preview" })
				imageInfo = originalElementInstance.getImageInfo()
			}

			const imageProcessRequestPayload = getImageProcessRequestPayload({
				crop: props.imageElement.crop,
				sourceDimensions: {
					width: imageInfo?.naturalWidth ?? props.imageElement.width ?? 0,
					height: imageInfo?.naturalHeight ?? props.imageElement.height ?? 0,
				},
			})

			const croppedVisibleWidth = originalElement.width ?? originalElement.crop?.displayWidth
			const croppedVisibleHeight =
				originalElement.height ?? originalElement.crop?.displayHeight
			const hasCroppedVisibleSize =
				!!originalElement.crop &&
				Number.isFinite(croppedVisibleWidth) &&
				Number.isFinite(croppedVisibleHeight) &&
				!!croppedVisibleWidth &&
				!!croppedVisibleHeight &&
				croppedVisibleWidth > 0 &&
				croppedVisibleHeight > 0

			// 新元素尺寸优先跟随当前请求配置；没有请求尺寸时再复用裁剪可视尺寸。
			const requestSize = parseImageElementSize(request.size)
			const cropPayloadSize = parseImageElementSize(imageProcessRequestPayload.size)
			let newWidth: number
			let newHeight: number
			if (requestSize) {
				newWidth = requestSize.width
				newHeight = requestSize.height
			} else if (hasCroppedVisibleSize) {
				newWidth = croppedVisibleWidth
				newHeight = croppedVisibleHeight
			} else if (cropPayloadSize) {
				newWidth = cropPayloadSize.width
				newHeight = cropPayloadSize.height
			} else {
				const defaultSize = getDefaultImageSize(imageModelList)
				newWidth = originalElement.width ?? defaultSize?.width ?? 1024
				newHeight = originalElement.height ?? defaultSize?.height ?? 1024
			}

			// 生成新元素 ID
			const newElementId = generateElementId()

			// 获取下一个 zIndex
			const newZIndex = canvas.elementManager.getNextZIndexInLevel()

			const generateRequest: GenerateImageRequest = {
				...request,
				prompt: request.prompt.trim(),
				size: request.size || imageProcessRequestPayload.size,
			}

			// 创建新的图片元素数据（使用选中的尺寸）
			const newImageElement: ImageElement = {
				id: newElementId,
				type: ElementTypeEnum.Image,
				x: newX,
				y: newY,
				width: newWidth,
				height: newHeight,
				zIndex: newZIndex,
				name: "Image",
			}

			sendingRef.current = true
			setIsSending(true)
			try {
				const submitted = await createAndSubmitNewImageGeneration({
					canvas,
					newImageElement,
					request: generateRequest,
					draftRequest: {
						...generateRequest,
						prompt: "",
						reference_images: [],
						reference_image_options: undefined,
					},
					onSubmitStarted: () => {
						canvas.eventEmitter.emit({
							type: "element:image:generate-submit-started",
							data: { elementId: props.imageElement.id },
						})
					},
					onSubmitFailed: () => {
						canvas.eventEmitter.emit({
							type: "element:image:generate-submit-failed",
							data: { elementId: props.imageElement.id },
						})
					},
				})
				if (!submitted) {
					return false
				}
				originalElementInstance.clearTempGenerateImageRequestPrompt()
				if (options?.clearEditorPromptOnSuccess) {
					setPrompt("")
				}
				if (options?.closeEditorOnSuccess) {
					setIsEditing(false)
				}
				if (options?.deselectOnSuccess) {
					canvas.selectionManager.deselectAll()
				}
				return true
			} finally {
				sendingRef.current = false
				setIsSending(false)
			}
		},
		[canvas, imageModelList, props.imageElement, setPrompt],
	)

	// 处理发送按钮点击
	const handleSend = useCallback(
		async (linkedEditorInputs: LinkedEditorInputsState) => {
			const requestParams = handlers.buildRequestParams()
			if (!requestParams.model_id) {
				console.error("[SecondEdit] 无法确定 model_id")
				return
			}
			const generateRequest = buildImageRequestWithLinkedEditorInputs(
				requestParams,
				linkedEditorInputs,
				prompt,
			)
			if (!generateRequest.prompt?.trim()) return

			await createAndSubmitImageGeneration(
				{
					...generateRequest,
					model_id: requestParams.model_id,
				},
				{
					clearEditorPromptOnSuccess: true,
					closeEditorOnSuccess: true,
					deselectOnSuccess: true,
				},
			)
		},
		[createAndSubmitImageGeneration, handlers, prompt],
	)

	const handleGenerateAgain = useCallback(async () => {
		if (!directGenerateRequest?.model_id || !directGenerateRequest.prompt) return
		await createAndSubmitImageGeneration(directGenerateRequest)
	}, [createAndSubmitImageGeneration, directGenerateRequest])

	const openEditor = useCallback(() => {
		// 先隐藏
		setIsVisible(false)
		// 设置编辑状态
		setIsEditing(true)
		// 延迟 50ms 后显示并聚焦
		setTimeout(() => {
			setIsVisible(true)
		}, 50)
	}, [])

	// 处理进入编辑状态的函数
	const handleStartEditing = useCallback(() => {
		setPendingOpenMode("quick-edit")
	}, [])

	/** 按已保存的 generateImageRequest 完整回填后进入编辑态（与快捷编辑仅对齐模型/尺寸不同） */
	const handleRegenerateFromSavedConfig = useCallback(() => {
		if (!props.imageElement.generateImageRequest?.model_id) return
		setPendingOpenMode("regenerate")
	}, [props.imageElement.generateImageRequest])

	useEffect(() => {
		if (!pendingOpenMode) return
		if (isEditing) {
			setPendingOpenMode(null)
			return
		}

		const modeToOpen = pendingOpenMode
		// 先消费指令，避免 restore/open 过程中 effect 重入再次执行。
		setPendingOpenMode(null)

		if (modeToOpen === "quick-edit") {
			restoreQuickEditConfigToUi()
		} else {
			restoreOriginalGenerateImageRequestToUi()
		}
		openEditor()
	}, [
		isEditing,
		openEditor,
		pendingOpenMode,
		restoreOriginalGenerateImageRequestToUi,
		restoreQuickEditConfigToUi,
	])

	// 使用 useLatest 获取最新的值，避免闭包问题
	const isEditingRef = useLatest(isEditing)
	const selectedElementsRef = useLatest(selectedElements)
	const handleStartEditingRef = useLatest(handleStartEditing)

	// 监听 Tab 按键
	useEventListener(
		"keydown",
		(e: KeyboardEvent) => {
			// 只在未处于编辑状态时监听
			if (isEditingRef.current) {
				return
			}

			// 检查是否选中了图片元素
			const hasImageSelected = selectedElementsRef.current?.some(
				(element) => element?.type === ElementTypeEnum.Image,
			)
			if (!hasImageSelected) {
				return
			}

			// 如果用户在输入框中，不处理 Tab 键
			const target = e.target as HTMLElement
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable
			) {
				return
			}

			// 监听 Tab 键
			if (e.key === "Tab" && !e.shiftKey) {
				e.preventDefault()
				handleStartEditingRef.current?.()
			}
		},
		{ target: window },
	)

	if (isEditing) {
		return (
			<ImageEditorSurface
				imageElement={props.imageElement}
				config={config}
				editorRef={editorRef}
				shouldShow={() =>
					selectedElements.some((element) => element?.type === ElementTypeEnum.Image)
				}
				floatingId="second-edit"
				selectionPersistenceKey={`image-second-edit:${props.imageElement.id}`}
				placeholder={t("imageEditor.editPlaceholder", "请输入您的编辑需求")}
				onSend={handleSend}
				isSending={isSending}
				autoFocus
				isDropEnabled={isEditing}
				className={styles.imageMessageEditor}
				style={{ visibility: isVisible ? "visible" : "hidden" }}
				onPreviewMediaResource={props.onPreviewMediaResource}
				isMediaResourcePreviewOpen={props.isMediaResourcePreviewOpen}
			/>
		)
	}

	return (
		<div
			ref={setRefs}
			className={`${styles.imageMessageEditor} ${styles.secondEditImageMessageEditorNoEditing}`}
			data-canvas-ui-component
			style={{ visibility: isVisible ? "visible" : "hidden" }}
		>
			<MediaResultActionBar
				showDividers
				dividerBeforeIndices={canRegenerate ? [1] : []}
				actions={[
					<IconButton
						className={styles.secondEditButton}
						onClick={handleStartEditing}
						key="quick-edit"
					>
						<Pencil size={14} />
						<span>{t("imageEditor.quickEdit", "快捷编辑")}</span>
						<span className={styles.secondEditButtonTag}>Tab</span>
					</IconButton>,
					canRegenerate ? (
						<IconButton
							className={styles.secondEditButton}
							onClick={handleRegenerateFromSavedConfig}
							key="re-edit"
						>
							<SquarePen size={14} />
							<span>{t("imageEditor.reEditFromSaved", "重新编辑")}</span>
						</IconButton>
					) : null,
					canRegenerate ? (
						<IconButton
							className={styles.secondEditButton}
							onClick={handleGenerateAgain}
							key="generate-again"
						>
							{isSending ? (
								<LoaderCircle size={14} className="animate-spin" />
							) : (
								<RotateCcw size={14} />
							)}
							<span>{t("imageEditor.generateAgain", "再次生成")}</span>
						</IconButton>
					) : null,
				]}
			/>
		</div>
	)
}

function parseImageElementSize(size?: string): { width: number; height: number } | null {
	if (!size) return null
	const [width, height] = size.split("x").map(Number)
	if (!Number.isFinite(width) || !Number.isFinite(height)) return null
	if (width <= 0 || height <= 0) return null
	return { width, height }
}
