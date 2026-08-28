import { useCallback, useEffect, useState } from "react"
import ElementToolTopSurfaceRender from "./ElementToolTopSurfaceRender"
import { useCanvasSelectionUI } from "../../../app/providers/CanvasUIProvider"
import { useMagic } from "../../../app/providers/MagicProvider"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useCanvasEvent } from "../../../app/hooks/canvas"
import { isStoryboardOutputFrame } from "../../../runtime/interaction/storyboard/storyboardOutputFrame"
import { useElementTools } from "../model/useElementTools"

/** 顶部工具栏只是统一 Resolver 的 top surface 适配器。 */
export default function ElementTools() {
	const { methods, convertHightConfig, aiAbilityAvailability } = useMagic()
	const { canvas } = useCanvas()
	const { selectedElements, isDragging, isSelecting, activeToolSession } = useCanvasSelectionUI()
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
				if (data.status === "uploading" || data.status === "applying") return data.elementId
				return current === data.elementId ? null : current
			})
		}, []),
		[],
	)

	const [firstSelectedElement] = selectedElements
	const availability = aiAbilityAvailability?.abilities
	const hasAvailability = Boolean(availability)
	const hasAvailabilityProvider = Boolean(methods?.getAiAbilityAvailability)
	const tools = useElementTools(firstSelectedElement?.id ?? null, "top", {
		selectedElements,
		isDragging,
		isSelecting,
		activeToolSession,
		isReplacing: Boolean(
			firstSelectedElement && replacingMediaElementId === firstSelectedElement.id,
		),
		convertHightSupported: hasAvailability
			? Boolean(availability?.image_convert_high.enabled)
			: hasAvailabilityProvider
				? false
				: Boolean(convertHightConfig?.enabled),
		removeBackgroundSupported: hasAvailability
			? Boolean(availability?.image_remove_background.enabled)
			: hasAvailabilityProvider
				? false
				: undefined,
		eraserSupported: hasAvailability
			? Boolean(availability?.image_eraser.enabled)
			: hasAvailabilityProvider
				? false
				: undefined,
		expandSupported: hasAvailability
			? Boolean(availability?.image_expand.enabled)
			: hasAvailabilityProvider
				? false
				: undefined,
		isStoryboardOutputFrame: Boolean(
			canvas?.elementManager?.getElementData &&
			firstSelectedElement &&
			isStoryboardOutputFrame(canvas, firstSelectedElement.id),
		),
	})
	if (!tools.length) return null
	return <ElementToolTopSurfaceRender tools={tools} />
}
