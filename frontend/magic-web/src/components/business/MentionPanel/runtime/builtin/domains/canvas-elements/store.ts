import { createElement } from "react"
import { Folder, Image as ImageIcon, Video } from "lucide-react"
import { makeAutoObservable } from "mobx"
import type {
	CanvasDocument,
	ElementType,
	LayerElement,
} from "@/components/CanvasDesign/runtime/document/types"
import { ElementTypeEnum } from "@/components/CanvasDesign/runtime/document/types"
import { CanvasFileIcon, FolderIcon } from "@/components/CanvasDesign/ui/primitives/icons"
import { MentionItemType, type MentionItem } from "../../../../types"
import { createProjectFileMentionData } from "../../../../utils/projectReferenceMention"
import { MentionPanelBuiltinItemId } from "../../catalog-ids"
import { CANVAS_ELEMENT_TAG } from "./item-utils"

const CANVAS_ELEMENT_ITEM_ID_PREFIX = `${MentionPanelBuiltinItemId.CANVAS_ELEMENTS}:element:`

export interface ActiveCanvasElementsContext {
	designProjectId: string
	canvasName: string
	getCanvasDocument: () => CanvasDocument | null | undefined
	resolveFileBySrc: (src: string) => CanvasElementResolvedFile | null
}

export interface CanvasElementResolvedFile {
	file_id?: string | number
	file_name?: string | number
	display_filename?: string | number
	filename?: string | number
	name?: string | number
	file_extension?: string
	file_size?: number
	relative_file_path?: string
	parent_id?: string | number | null
	display_config?: Record<string, unknown>
	unSelectable?: boolean
}

function encodeElementId(elementId: string): string {
	return encodeURIComponent(elementId)
}

export function getCanvasElementMentionItemId(elementId: string): string {
	return `${CANVAS_ELEMENT_ITEM_ID_PREFIX}${encodeElementId(elementId)}`
}

export function isCanvasElementsMentionItemId(id: string | undefined): boolean {
	return (
		id === MentionPanelBuiltinItemId.CANVAS_ELEMENTS ||
		Boolean(id?.startsWith(CANVAS_ELEMENT_ITEM_ID_PREFIX))
	)
}

function getSortedElements(elements: LayerElement[] | undefined): LayerElement[] {
	return [...(elements ?? [])].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))
}

function getElementChildren(element: LayerElement): LayerElement[] {
	if (!("children" in element)) return []

	return Array.isArray(element.children) ? element.children : []
}

function isContainerElement(element: LayerElement): boolean {
	return element.type === ElementTypeEnum.Frame || element.type === ElementTypeEnum.Group
}

function isMediaElement(element: LayerElement): element is LayerElement & { src?: string } {
	return element.type === ElementTypeEnum.Image || element.type === ElementTypeEnum.Video
}

function getElementTypeLabel(type: ElementType): string {
	switch (type) {
		case ElementTypeEnum.Frame:
			return "Frame"
		case ElementTypeEnum.Group:
			return "Group"
		case ElementTypeEnum.Image:
			return "图片"
		case ElementTypeEnum.Video:
			return "视频"
		case ElementTypeEnum.Text:
			return "文本"
		case ElementTypeEnum.Rectangle:
			return "矩形"
		case ElementTypeEnum.Ellipse:
			return "椭圆"
		case ElementTypeEnum.Triangle:
			return "三角形"
		case ElementTypeEnum.Star:
			return "星形"
		default:
			return "图层"
	}
}

function getElementDisplayName(element: LayerElement): string {
	const name = element.name?.trim()
	if (name) return name

	return getElementTypeLabel(element.type)
}

function getElementIcon(element: LayerElement) {
	switch (element.type) {
		case ElementTypeEnum.Frame:
			return createElement(FolderIcon, {
				size: 16,
				className: "text-slate-400",
			})
		case ElementTypeEnum.Group:
			return createElement(Folder, {
				size: 16,
				className: "text-slate-400",
			})
		case ElementTypeEnum.Image:
			return createElement(ImageIcon, { size: 16 })
		case ElementTypeEnum.Video:
			return createElement(Video, { size: 16 })
		default:
			return null
	}
}

function getCanvasRootIcon() {
	return createElement(CanvasFileIcon, {
		size: 16,
		gradientFrom: "#7C3AED",
		gradientTo: "#A78BFA",
	})
}

interface CanvasElementSearchEntry {
	elementName: string
	item: MentionItem
}

interface CanvasElementsSnapshot {
	rootItems: MentionItem[]
	folderItemsById: Map<string, MentionItem[]>
	searchEntriesByFolderId: Map<string, CanvasElementSearchEntry[]>
}

interface CanvasElementBuildResult {
	item: MentionItem
	searchEntries: CanvasElementSearchEntry[]
}

interface CanvasElementsBuildResult {
	items: MentionItem[]
	searchEntries: CanvasElementSearchEntry[]
}

export class MentionPanelCanvasElementsStore {
	private context: ActiveCanvasElementsContext | null = null
	private snapshot: CanvasElementsSnapshot | null = null

	constructor() {
		makeAutoObservable<MentionPanelCanvasElementsStore, "context" | "snapshot">(
			this,
			{
				context: false,
				snapshot: false,
			},
			{ autoBind: true },
		)
	}

	setActiveContext(context: ActiveCanvasElementsContext | null) {
		this.context = context
		this.invalidateCache()
	}

	clearActiveContext(designProjectId?: string) {
		if (!designProjectId || this.context?.designProjectId === designProjectId) {
			this.context = null
			this.invalidateCache()
		}
	}

	invalidateCache() {
		this.snapshot = null
	}

	getRootMentionItem(options?: { lazy?: boolean; label?: string }): MentionItem | null {
		if (!this.context) return null

		if (!options?.lazy) {
			const snapshot = this.getSnapshot()
			if (!snapshot || snapshot.rootItems.length === 0) return null
		}

		const description = this.context.canvasName || "当前画布"

		return {
			id: MentionPanelBuiltinItemId.CANVAS_ELEMENTS,
			type: MentionItemType.FOLDER,
			name: options?.label || "Canvas Elements",
			icon: getCanvasRootIcon(),
			description,
			hasChildren: true,
			isFolder: true,
		}
	}

	getFolderMentionItems(folderId: string): MentionItem[] {
		const snapshot = this.getSnapshot()
		if (!snapshot) return []

		if (folderId === MentionPanelBuiltinItemId.CANVAS_ELEMENTS) {
			return [...snapshot.rootItems]
		}

		return [...(snapshot.folderItemsById.get(folderId) ?? [])]
	}

	searchItems(
		query: string,
		scopeFolderId: string | undefined,
		matchesQuery: (target: string, query: string) => boolean,
	): MentionItem[] {
		if (!this.context || !query.trim()) return []

		const snapshot = this.getSnapshot()
		if (!snapshot) return []

		const normalizedQuery = query.trim()
		const searchScopeId = scopeFolderId ?? MentionPanelBuiltinItemId.CANVAS_ELEMENTS
		const entries = snapshot.searchEntriesByFolderId.get(searchScopeId) ?? []

		return entries
			.filter((entry) => matchesQuery(entry.elementName, normalizedQuery))
			.map((entry) => entry.item)
	}

	private getSnapshot(): CanvasElementsSnapshot | null {
		if (this.snapshot) return this.snapshot
		if (!this.context) return null

		const document = this.context.getCanvasDocument()
		if (!document) return null

		const folderItemsById = new Map<string, MentionItem[]>()
		const searchEntriesByFolderId = new Map<string, CanvasElementSearchEntry[]>()
		const rootResult = this.buildElementsSnapshot(
			getSortedElements(document.elements),
			folderItemsById,
			searchEntriesByFolderId,
		)
		searchEntriesByFolderId.set(
			MentionPanelBuiltinItemId.CANVAS_ELEMENTS,
			rootResult.searchEntries,
		)

		this.snapshot = {
			rootItems: rootResult.items,
			folderItemsById,
			searchEntriesByFolderId,
		}
		return this.snapshot
	}

	private buildElementsSnapshot(
		elements: LayerElement[],
		folderItemsById: Map<string, MentionItem[]>,
		searchEntriesByFolderId: Map<string, CanvasElementSearchEntry[]>,
	): CanvasElementsBuildResult {
		const items: MentionItem[] = []
		const searchEntries: CanvasElementSearchEntry[] = []

		for (const element of elements) {
			const result = this.buildElementSnapshot(
				element,
				folderItemsById,
				searchEntriesByFolderId,
			)
			if (!result) continue

			items.push(result.item)
			searchEntries.push(...result.searchEntries)
		}

		return { items, searchEntries }
	}

	private buildElementSnapshot(
		element: LayerElement,
		folderItemsById: Map<string, MentionItem[]>,
		searchEntriesByFolderId: Map<string, CanvasElementSearchEntry[]>,
	): CanvasElementBuildResult | null {
		const elementName = getElementDisplayName(element)
		const itemId = getCanvasElementMentionItemId(element.id)

		if (isContainerElement(element)) {
			const childResult = this.buildElementsSnapshot(
				getSortedElements(getElementChildren(element)),
				folderItemsById,
				searchEntriesByFolderId,
			)
			if (childResult.items.length === 0) return null

			const item: MentionItem = {
				id: itemId,
				type: MentionItemType.FOLDER,
				name: elementName,
				icon: getElementIcon(element),
				hasChildren: true,
				isFolder: true,
				tags: [CANVAS_ELEMENT_TAG],
			}
			folderItemsById.set(itemId, childResult.items)
			searchEntriesByFolderId.set(itemId, childResult.searchEntries)

			return {
				item,
				searchEntries: [{ elementName, item }, ...childResult.searchEntries],
			}
		}

		if (isMediaElement(element)) {
			const src = element.src
			const file = src ? this.context?.resolveFileBySrc(src) : null
			if (src && file) {
				const data = createProjectFileMentionData(file)

				const item: MentionItem = {
					id: itemId,
					type: MentionItemType.PROJECT_FILE,
					name: elementName,
					icon: file.file_extension || element.type,
					extension: file.file_extension,
					hasChildren: false,
					isFolder: false,
					path: file.relative_file_path,
					size: file.file_size,
					parentId: file.parent_id == null ? undefined : String(file.parent_id),
					displayConfig: file.display_config,
					data,
					tags: [CANVAS_ELEMENT_TAG],
					unSelectable: file.unSelectable || undefined,
					sourcePreview: {
						kind: "canvas-element",
						designProjectId: this.context?.designProjectId,
						elementId: element.id,
						mediaType: element.type === ElementTypeEnum.Video ? "video" : "image",
						src,
						...(element.type === ElementTypeEnum.Image && element.crop
							? { crop: element.crop }
							: {}),
					},
				}

				return {
					item,
					searchEntries: [{ elementName, item }],
				}
			}
		}

		return null
	}
}
