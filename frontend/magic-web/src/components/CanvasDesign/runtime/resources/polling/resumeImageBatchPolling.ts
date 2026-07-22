import { ElementTypeEnum, type ImageElement as ImageElementData } from "../../document/types"
import type { Canvas } from "../../core/Canvas"
import { ImageBatchPollingManager } from "./ImageBatchPollingManager"
import {
	getImageGenerationTaskMeta,
	isBatchImageGenerationTaskMeta,
} from "../image/imageGenerationTaskMeta"
import { shouldContinueGenerationPolling } from "./generationPollingUtils"
import { collectElementsByType } from "../../shared/ids"

interface BatchPollingGroup {
	imageId: string
	items: Array<{ elementId: string; outputIndex: number }>
}

export function resumeImageBatchPollingManagers(canvas: Canvas): void {
	const imageElements = collectElementsByType(
		canvas.elementManager.getAllElements(),
		ElementTypeEnum.Image,
	) as ImageElementData[]
	const groups = new Map<string, BatchPollingGroup>()

	imageElements.forEach((element) => {
		if (!shouldResumeBatchPolling(element)) return

		const meta = getImageGenerationTaskMeta(element)
		if (!isBatchImageGenerationTaskMeta(meta)) return

		const group =
			groups.get(meta.image_id) ??
			({
				imageId: meta.image_id,
				items: [],
			} satisfies BatchPollingGroup)

		group.items.push({ elementId: element.id, outputIndex: meta.output_index })
		groups.set(meta.image_id, group)
	})

	groups.forEach((group) => {
		const orderedItems = group.items.slice().sort((a, b) => a.outputIndex - b.outputIndex)
		if (orderedItems.length === 0) return

		const elementIds = orderedItems.map((item) => item.elementId)
		const outputIndexes = orderedItems.map((item) => item.outputIndex)

		const activeManager = canvas.imageBatchPollingRegistry.get(group.imageId)
		// 如果已经存在轮询管理器，则同步元素 ID 和输出索引
		if (activeManager) {
			activeManager.syncElementIds(elementIds, outputIndexes)
			return
		}

		const batchPollingManager = new ImageBatchPollingManager({
			canvas,
			imageId: group.imageId,
			elementIds,
			outputIndexes,
			registry: canvas.imageBatchPollingRegistry,
		})
		void batchPollingManager.start()
	})
}

function shouldResumeBatchPolling(element: ImageElementData): boolean {
	if (element.src) return false
	if (element.status !== undefined && !shouldContinueGenerationPolling(element.status)) {
		return false
	}

	return true
}
