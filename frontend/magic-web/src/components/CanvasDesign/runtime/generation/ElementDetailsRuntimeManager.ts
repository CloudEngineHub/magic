import type {
	ElementDetailSource,
	ElementDetailsProvenance,
	GenerateImageRequestProvenance,
} from "../document/elementDetailsProvenance"
import { cloneDeep } from "lodash-es"

export type ElementDetailsProvenanceChangeHandler = (provenance: ElementDetailsProvenance) => void

/**
 * 保存从 sidecar 加载出的来源信息，以及当前会话成功提交的前端任务身份。
 * 数据只存在于 Canvas Runtime，不参与 DSL 导出、历史记录和剪贴板序列化。
 */
export class ElementDetailsRuntimeManager {
	private provenance: ElementDetailsProvenance = {}
	private hasExplicitProvenance = false
	private onChange?: ElementDetailsProvenanceChangeHandler

	constructor(options?: { onChange?: ElementDetailsProvenanceChangeHandler }) {
		this.onChange = options?.onChange
	}

	public replace(provenance?: ElementDetailsProvenance): void {
		this.hasExplicitProvenance = provenance !== undefined
		this.provenance = provenance ? cloneDeep(provenance) : {}
	}

	public setOnChange(onChange?: ElementDetailsProvenanceChangeHandler): void {
		this.onChange = onChange
	}

	public export(): ElementDetailsProvenance {
		return cloneDeep(this.provenance)
	}

	public getGenerateImageRequest(
		elementId: string,
		imageId?: string,
	): GenerateImageRequestProvenance | null {
		const entry = this.provenance[elementId]?.generateImageRequest
		if (!entry) return null
		if (imageId && entry.imageId !== imageId) return null
		return entry
	}

	public getGenerateImageRequestImageIdSource(
		elementId: string,
		imageId?: string,
	): ElementDetailSource {
		return (
			this.getGenerateImageRequest(elementId, imageId)?.imageIdSource ??
			(this.hasExplicitProvenance ? "unknown" : "inline")
		)
	}

	public markGenerateImageRequestAsUser(elementId: string, imageId: string): void {
		if (!imageId.trim()) return
		this.hasExplicitProvenance = true
		this.provenance = {
			...this.provenance,
			[elementId]: {
				...this.provenance[elementId],
				generateImageRequest: {
					valueSource: "user",
					imageId,
					imageIdSource: "user",
				},
			},
		}
		this.onChange?.(this.export())
	}

	public clearElement(elementId: string): void {
		if (!this.provenance[elementId]) return
		const next = { ...this.provenance }
		delete next[elementId]
		this.provenance = next
		this.onChange?.(this.export())
	}
}
