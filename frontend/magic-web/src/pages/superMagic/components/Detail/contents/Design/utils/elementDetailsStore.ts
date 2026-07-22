import { isEqual } from "lodash-es"
import type { LayerElement } from "@/components/CanvasDesign/runtime/document/types"

/**
 * element-details 重字段拆分（与后端 element_details_store.py 对齐）。
 *
 * v2 把渲染无关的重字段从 magic.project.js 主文件拆到同级 sidecar：
 * - element-details.json       由后端写、前端读（baseline）
 * - element-details-user.json  由前端写、前端读，避免与后端写写冲突
 *
 * 数据形态：
 *   { "version": "1.0.0", "elements": { "<id>": { generateImageRequest: {...}, source?: "user" } } }
 *
 * 读取时按 source 路由：带 source="user" 的用户条目优先，否则回退后端 baseline。
 */

export const ELEMENT_DETAILS_FILENAME = "element-details.json"
export const ELEMENT_DETAILS_USER_FILENAME = "element-details-user.json"
export const ELEMENT_DETAILS_VERSION = "1.0.0"

/** 数据来源标记，仅前端写入的条目带此标记 */
export const ELEMENT_DETAIL_SOURCE_USER = "user"

/** 需要从主文件拆出的重字段（与后端 HEAVY_FIELDS 一致） */
export const HEAVY_FIELDS = [
	"generateImageRequest",
	"generateVideoRequest",
	"visualUnderstanding",
] as const

/** 单个元素的重字段集合（不含 source 等元信息） */
export type ElementHeavyFields = Record<string, unknown>

/** sidecar 中单个元素条目：重字段 + 可选 source 标记 */
export type ElementDetailEntry = ElementHeavyFields & { source?: string }

export interface ElementDetailsDoc {
	version: string
	elements: Record<string, ElementDetailEntry>
}

export function emptyElementDetailsDoc(): ElementDetailsDoc {
	return { version: ELEMENT_DETAILS_VERSION, elements: {} }
}

/** 把任意输入规整成合法的 ElementDetailsDoc，非法时返回空文档 */
export function normalizeElementDetailsDoc(raw: unknown): ElementDetailsDoc {
	if (
		!raw ||
		typeof raw !== "object" ||
		typeof (raw as { elements?: unknown }).elements !== "object" ||
		(raw as { elements?: unknown }).elements === null
	) {
		return emptyElementDetailsDoc()
	}
	const data = raw as { version?: unknown; elements: Record<string, ElementDetailEntry> }
	return {
		version: typeof data.version === "string" ? data.version : ELEMENT_DETAILS_VERSION,
		elements: data.elements,
	}
}

type AnyElement = LayerElement & {
	children?: LayerElement[]
	[key: string]: unknown
}

/** 深度遍历元素树（含 Frame / Group 的 children） */
function walkElements(
	elements: LayerElement[] | undefined,
	visit: (element: AnyElement) => void,
): void {
	if (!elements?.length) return
	for (const element of elements) {
		const anyEl = element as AnyElement
		visit(anyEl)
		if (Array.isArray(anyEl.children)) {
			walkElements(anyEl.children, visit)
		}
	}
}

/** 收集树内所有元素 id */
export function collectElementIds(elements: LayerElement[] | undefined): Set<string> {
	const ids = new Set<string>()
	walkElements(elements, (el) => {
		if (el.id) ids.add(el.id)
	})
	return ids
}

/** 取出元素当前带的重字段（仅收集有值的字段） */
function pickHeavyFields(element: AnyElement): ElementHeavyFields | null {
	const detail: ElementHeavyFields = {}
	for (const field of HEAVY_FIELDS) {
		const value = element[field]
		if (value !== undefined && value !== null) {
			detail[field] = value
		}
	}
	return Object.keys(detail).length > 0 ? detail : null
}

/** 原地剥离元素树上的重字段（用于 v2 主文件序列化前） */
export function stripHeavyFields(elements: LayerElement[] | undefined): void {
	walkElements(elements, (el) => {
		for (const field of HEAVY_FIELDS) {
			if (el[field] !== undefined) {
				delete el[field]
			}
		}
	})
}

/** 仅保留重字段（剔除 source 等元信息），用于和 baseline 比对 */
function stripEntryMeta(entry: ElementDetailEntry | undefined): ElementHeavyFields {
	if (!entry) return {}
	const result: ElementHeavyFields = {}
	for (const field of HEAVY_FIELDS) {
		if (entry[field] !== undefined && entry[field] !== null) {
			result[field] = entry[field]
		}
	}
	return result
}

/**
 * 把 sidecar 中的重字段回填到元素树上（原地修改）。
 * 优先级：用户条目（source=user）> 后端 baseline 条目 > 无源用户条目。
 */
export function rehydrateHeavyFields(
	elements: LayerElement[] | undefined,
	userDoc: ElementDetailsDoc,
	agentDoc: ElementDetailsDoc,
): void {
	walkElements(elements, (el) => {
		if (!el.id) return
		const userEntry = userDoc.elements[el.id]
		const agentEntry = agentDoc.elements[el.id]

		let winner: ElementDetailEntry | undefined
		if (userEntry && userEntry.source === ELEMENT_DETAIL_SOURCE_USER) {
			winner = userEntry
		} else if (agentEntry) {
			winner = agentEntry
		} else {
			winner = userEntry
		}

		if (!winner) return
		for (const field of HEAVY_FIELDS) {
			const value = winner[field]
			if (value !== undefined && value !== null) {
				el[field] = value
			}
		}
	})
}

/**
 * 基于内存元素树构建用户 sidecar 文档。
 * 与后端 baseline 完全一致的条目（后端生成且用户未改）跳过，留给后端文件 own；
 * 新增或被改过的条目写入用户文件并打 source=user 标记。
 */
export function buildUserElementDetailsDoc(
	elements: LayerElement[] | undefined,
	agentBaseline: ElementDetailsDoc,
): ElementDetailsDoc {
	const result: Record<string, ElementDetailEntry> = {}
	walkElements(elements, (el) => {
		if (!el.id) return
		const detail = pickHeavyFields(el)
		if (!detail) return

		const baselineDetail = stripEntryMeta(agentBaseline.elements[el.id])
		if (isEqual(detail, baselineDetail)) return

		result[el.id] = { ...detail, source: ELEMENT_DETAIL_SOURCE_USER }
	})
	return { version: ELEMENT_DETAILS_VERSION, elements: result }
}
