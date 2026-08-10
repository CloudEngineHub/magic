import { Divider, ElementToolTypeEnum } from "../../public/props"
import ElementToolsRender from "./ElementToolsRender"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { ElementToolOptionType } from "./types"
import { ElementTypeEnum } from "../../runtime/document/types"
import { useCanvasSelectionUI } from "../../app/providers/CanvasUIProvider"
import { useMagic } from "../../app/providers/MagicProvider"
import { useCanvas } from "../../app/providers/CanvasProvider"
import { useCanvasEvent } from "../../app/hooks/canvas"
import useShowVideoOriginalSizeButton from "./hooks/useShowVideoOriginalSizeButton"
import { getActiveContent, getActiveImageContent } from "../../runtime/document/elementContent"

export default function ElementTools() {
	const { convertHightConfig } = useMagic()
	const { canvas } = useCanvas()

	const { selectedElements, isDragging, isSelecting, subElementTooltip } = useCanvasSelectionUI()
	const [replacingMediaElementId, setReplacingMediaElementId] = useState<string | null>(
		() => canvas?.mediaReplaceController?.getReplacingElementId?.() ?? null,
	)

	useEffect(() => {
		setReplacingMediaElementId(
			canvas?.mediaReplaceController?.getReplacingElementId?.() ?? null,
		)
	}, [canvas])

	useCanvasEvent(
		"element:media:replaceStateChanged",
		useCallback(({ data }) => {
			setReplacingMediaElementId((current) => {
				if (data.status === "uploading" || data.status === "applying") {
					return data.elementId
				}
				return current === data.elementId ? null : current
			})
		}, []),
		[],
	)

	const [firstSelectedElement] = selectedElements

	const isSingleElement = selectedElements.length === 1

	const imageSrc =
		firstSelectedElement?.type === ElementTypeEnum.Image
			? getActiveImageContent(firstSelectedElement).src
			: undefined
	const audioSrc =
		firstSelectedElement?.type === ElementTypeEnum.Audio
			? getActiveContent(firstSelectedElement)?.src
			: undefined
	const videoSrc =
		firstSelectedElement?.type === ElementTypeEnum.Video
			? getActiveContent(firstSelectedElement)?.src
			: undefined

	const showVideoOriginalSizeButton = useShowVideoOriginalSizeButton({
		canvas,
		isSingleElement,
		elementType: firstSelectedElement?.type,
		elementId: firstSelectedElement?.id,
		videoSrc:
			firstSelectedElement?.type === ElementTypeEnum.Video
				? getActiveContent(firstSelectedElement)?.src
				: undefined,
		elementWidth: firstSelectedElement?.width,
		elementHeight: firstSelectedElement?.height,
	})

	const options: ElementToolOptionType[] = useMemo(() => {
		const hideToolsWhileTransform =
			isDragging && !(isSingleElement && firstSelectedElement?.type === ElementTypeEnum.Text)
		if (!selectedElements.length || hideToolsWhileTransform || isSelecting) return []

		if (selectedElements.some((el) => el.locked === true)) return []

		if (
			isSingleElement &&
			(firstSelectedElement?.type === ElementTypeEnum.Image ||
				firstSelectedElement?.type === ElementTypeEnum.Video ||
				firstSelectedElement?.type === ElementTypeEnum.Audio) &&
			replacingMediaElementId === firstSelectedElement.id
		) {
			return []
		}

		if (subElementTooltip) {
			return [{ type: subElementTooltip }]
		}

		if (isSingleElement) {
			switch (firstSelectedElement?.type) {
				case ElementTypeEnum.Text:
					return [
						{ type: ElementToolTypeEnum.RichTextFillColor },
						Divider,
						{ type: ElementToolTypeEnum.RichTextFontFamily },
						{ type: ElementToolTypeEnum.RichTextFontSize },
						Divider,
						{ type: ElementToolTypeEnum.RichTextFontStyle },
						Divider,
						{ type: ElementToolTypeEnum.RichTextTextAlign },
						Divider,
						{ type: ElementToolTypeEnum.RichTextAdvancedButton },
						Divider,
						{ type: ElementToolTypeEnum.DownloadButton },
						{ type: ElementToolTypeEnum.TextContentOptimizationButton },
					]

				case ElementTypeEnum.Frame:
					return [
						{ type: ElementToolTypeEnum.FrameRemoveButton },
						Divider,
						{ type: ElementToolTypeEnum.SizeEditButton },
						{ type: ElementToolTypeEnum.FrameDownloadButton },
						Divider,
						{ type: ElementToolTypeEnum.ElementAlign },
						{ type: ElementToolTypeEnum.ElementDistribute },
					]

				case ElementTypeEnum.Image:
					const imageElementTools: ElementToolOptionType[] = []
					if (!imageSrc) return []
					imageElementTools.push({
						type: ElementToolTypeEnum.SizeEditButton,
					})
					imageElementTools.push(Divider)
					imageElementTools.push({
						type: ElementToolTypeEnum.ImageCropButton,
					})
					imageElementTools.push({
						type: ElementToolTypeEnum.ImageExtendButton,
					})
					imageElementTools.push({
						type: ElementToolTypeEnum.ImageRemoveBackgroundButton,
					})
					imageElementTools.push({
						type: ElementToolTypeEnum.ImageEraserButton,
					})
					if (convertHightConfig?.supported) {
						imageElementTools.push(Divider)
						imageElementTools.push({
							type: ElementToolTypeEnum.ImageConvertHightButton,
						})
					}
					imageElementTools.push({
						type: ElementToolTypeEnum.ImagePromptExtractionButton,
					})
					imageElementTools.push(Divider)
					imageElementTools.push({
						type: ElementToolTypeEnum.MediaReplaceButton,
					})
					imageElementTools.push({
						type: ElementToolTypeEnum.MediaDownloadButton,
					})
					return imageElementTools

				case ElementTypeEnum.Video:
					if (!videoSrc) return []
					return [
						...(showVideoOriginalSizeButton
							? [{ type: ElementToolTypeEnum.VideoOriginalSizeButton }, Divider]
							: []),
						{ type: ElementToolTypeEnum.MediaReplaceButton },
						{ type: ElementToolTypeEnum.MediaDownloadButton },
					]

				case ElementTypeEnum.Audio:
					return audioSrc
						? [
								{ type: ElementToolTypeEnum.MediaReplaceButton },
								{ type: ElementToolTypeEnum.MediaDownloadButton },
							]
						: [{ type: ElementToolTypeEnum.MediaReplaceButton }]

				default:
					break
			}
		} else {
			if (!selectedElements.find((element) => element.type === ElementTypeEnum.Frame)) {
				return [
					{ type: ElementToolTypeEnum.FrameCreateButton },
					Divider,
					{ type: ElementToolTypeEnum.ElementAlign },
					{ type: ElementToolTypeEnum.ElementDistribute },
				]
			} else {
				return [
					{ type: ElementToolTypeEnum.ElementAlign },
					{ type: ElementToolTypeEnum.ElementDistribute },
				]
			}
		}
		return []
	}, [
		convertHightConfig?.supported,
		firstSelectedElement,
		audioSrc,
		imageSrc,
		videoSrc,
		isDragging,
		isSelecting,
		isSingleElement,
		selectedElements,
		showVideoOriginalSizeButton,
		replacingMediaElementId,
		subElementTooltip,
	])

	if (!options.length) {
		return null
	}

	return <ElementToolsRender options={options} />
}
