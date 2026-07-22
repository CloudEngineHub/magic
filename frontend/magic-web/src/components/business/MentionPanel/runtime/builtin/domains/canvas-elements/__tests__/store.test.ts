import { beforeEach, describe, expect, it, vi } from "vitest"
import { isValidElement } from "react"
import { Folder } from "lucide-react"
import {
	ElementTypeEnum,
	type CanvasDocument,
} from "@/components/CanvasDesign/runtime/document/types"
import { FolderIcon } from "@/components/CanvasDesign/ui/primitives/icons"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import type { I18nTexts } from "../../../../../i18n/types"
import { MentionItemType, type MentionItem } from "../../../../../types"
import { workspaceFilesRendererEntries } from "../../workspace-files/renderer"
import { getCanvasElementMentionItemId, MentionPanelCanvasElementsStore } from "../store"

const files: FileItem[] = [
	{
		file_id: "file-hero",
		file_name: "hero.png",
		file_extension: "png",
		relative_file_path: "/design/images/hero.png",
		is_directory: false,
	},
	{
		file_id: "file-clip",
		file_name: "clip.mp4",
		file_extension: "mp4",
		relative_file_path: "/design/videos/clip.mp4",
		is_directory: false,
	},
]

const canvasDocument: CanvasDocument = {
	elements: [
		{
			id: "shape",
			type: ElementTypeEnum.Rectangle,
			name: "Background Shape",
			zIndex: 1,
		},
		{
			id: "frame",
			type: ElementTypeEnum.Frame,
			name: "Main Frame",
			zIndex: 3,
			children: [
				{
					id: "hero",
					type: ElementTypeEnum.Image,
					name: "Hero Layer",
					src: "./images/hero.png",
					zIndex: 2,
				},
				{
					id: "caption",
					type: ElementTypeEnum.Text,
					name: "Caption Text",
					zIndex: 1,
				},
				{
					id: "missing",
					type: ElementTypeEnum.Image,
					name: "Missing Media",
					src: "./images/missing.png",
					zIndex: 0,
				},
				{
					id: "group",
					type: ElementTypeEnum.Group,
					name: "Nested Group",
					zIndex: 4,
					children: [
						{
							id: "clip",
							type: ElementTypeEnum.Video,
							name: "Clip Layer",
							src: "./videos/clip.mp4",
							zIndex: 1,
						},
					],
				},
			],
		},
	],
}

function createStore() {
	const store = new MentionPanelCanvasElementsStore()
	store.setActiveContext({
		designProjectId: "design-id",
		canvasName: "Pink Design",
		getCanvasDocument: () => canvasDocument,
		resolveFileBySrc: (src) => {
			if (src === "./images/hero.png") return files[0]
			if (src === "./videos/clip.mp4") return files[1]
			return null
		},
	})
	return store
}

function matchesQuery(target: string, query: string) {
	return target.toLowerCase().includes(query.toLowerCase())
}

const t = {
	selectPathItemDescription: {
		rootDirectory: "根目录",
	},
	defaultItems: {
		canvasElements: "画布元素",
	},
} as I18nTexts

function getTypeDescription(item: MentionItem, isSearch = false) {
	const renderer = workspaceFilesRendererEntries.find(([type]) => type === item.type)?.[1]
	return renderer?.getTypeDescription?.({
		item,
		t,
		isSearch,
		platform: "desktop",
	})
}

describe("MentionPanelCanvasElementsStore", () => {
	let store: MentionPanelCanvasElementsStore

	beforeEach(() => {
		store = createStore()
	})

	it("builds a root entry for the active canvas", () => {
		const rootItem = store.getRootMentionItem({ label: t.defaultItems.canvasElements })
		if (!rootItem) throw new Error("Expected canvas elements root item")

		expect(rootItem).toMatchObject({
			id: "canvas-elements",
			type: MentionItemType.FOLDER,
			name: "画布元素",
			description: "Pink Design",
			hasChildren: true,
			isFolder: true,
		})
		expect(getTypeDescription(rootItem, false)).toBe("Pink Design")
	})

	it("builds a lazy root entry without reading the canvas document", () => {
		const getCanvasDocument = vi.fn(() => ({
			elements: [],
		}))
		const lazyStore = new MentionPanelCanvasElementsStore()
		lazyStore.setActiveContext({
			designProjectId: "empty-design-id",
			canvasName: "Empty Design",
			getCanvasDocument,
			resolveFileBySrc: () => null,
		})

		const rootItem = lazyStore.getRootMentionItem({
			lazy: true,
			label: t.defaultItems.canvasElements,
		})

		expect(rootItem).toMatchObject({
			id: "canvas-elements",
			type: MentionItemType.FOLDER,
			name: "画布元素",
			description: "Empty Design",
		})
		expect(getCanvasDocument).not.toHaveBeenCalled()
	})

	it("reuses the warmed snapshot when entering the canvas elements root", () => {
		const getCanvasDocument = vi.fn(() => canvasDocument)
		const warmedStore = new MentionPanelCanvasElementsStore()
		warmedStore.setActiveContext({
			designProjectId: "design-id",
			canvasName: "Pink Design",
			getCanvasDocument,
			resolveFileBySrc: (src) => {
				if (src === "./images/hero.png") return files[0]
				if (src === "./videos/clip.mp4") return files[1]
				return null
			},
		})

		expect(warmedStore.getRootMentionItem()).not.toBeNull()
		expect(
			warmedStore.getFolderMentionItems("canvas-elements").map((item) => item.name),
		).toEqual(["Main Frame"])
		expect(getCanvasDocument).toHaveBeenCalledTimes(1)
	})

	it("rebuilds the snapshot after cache invalidation", () => {
		const nextDocument: CanvasDocument = {
			elements: [
				{
					id: "clip",
					type: ElementTypeEnum.Video,
					name: "Fresh Clip",
					src: "./videos/clip.mp4",
					zIndex: 1,
				},
			],
		}
		let currentDocument = canvasDocument
		const getCanvasDocument = vi.fn(() => currentDocument)
		const cachedStore = new MentionPanelCanvasElementsStore()
		cachedStore.setActiveContext({
			designProjectId: "design-id",
			canvasName: "Pink Design",
			getCanvasDocument,
			resolveFileBySrc: (src) => {
				if (src === "./images/hero.png") return files[0]
				if (src === "./videos/clip.mp4") return files[1]
				return null
			},
		})

		expect(
			cachedStore.getFolderMentionItems("canvas-elements").map((item) => item.name),
		).toEqual(["Main Frame"])
		currentDocument = nextDocument
		cachedStore.invalidateCache()

		expect(
			cachedStore.getFolderMentionItems("canvas-elements").map((item) => item.name),
		).toEqual(["Fresh Clip"])
		expect(getCanvasDocument).toHaveBeenCalledTimes(2)
	})

	it("does not build a root entry when the active canvas has no selectable media", () => {
		const emptyStore = new MentionPanelCanvasElementsStore()
		emptyStore.setActiveContext({
			designProjectId: "empty-design-id",
			canvasName: "Empty Design",
			getCanvasDocument: () => ({
				elements: [
					{
						id: "shape",
						type: ElementTypeEnum.Rectangle,
						name: "Background Shape",
						zIndex: 1,
					},
				],
			}),
			resolveFileBySrc: () => null,
		})

		expect(emptyStore.getRootMentionItem()).toBeNull()
	})

	it("shows available root layers and keeps frame/group as folders", () => {
		const items = store.getFolderMentionItems("canvas-elements")

		expect(items.map((item) => item.name)).toEqual(["Main Frame"])
		expect(items[0]).toMatchObject({
			type: MentionItemType.FOLDER,
			isFolder: true,
			hasChildren: true,
			tags: ["canvas-element"],
		})
		expect(items[0].description).toBeUndefined()
		expect(isValidElement(items[0].icon)).toBe(true)
		if (isValidElement(items[0].icon)) {
			expect(items[0].icon.type).toBe(FolderIcon)
		}
	})

	it("resolves media layers to project file mention data and hides unavailable layers", () => {
		const frameItems = store.getFolderMentionItems(getCanvasElementMentionItemId("frame"))

		expect(frameItems.map((item) => item.name)).toEqual(["Nested Group", "Hero Layer"])

		const heroItem = frameItems.find((item) => item.name === "Hero Layer")
		const groupItem = frameItems.find((item) => item.name === "Nested Group")
		expect(isValidElement(groupItem?.icon)).toBe(true)
		if (isValidElement(groupItem?.icon)) {
			expect(groupItem.icon.type).toBe(Folder)
		}

		expect(heroItem).toMatchObject({
			type: MentionItemType.PROJECT_FILE,
			tags: ["canvas-element"],
			sourcePreview: {
				kind: "canvas-element",
				elementId: "hero",
				mediaType: "image",
				src: "./images/hero.png",
			},
			data: {
				file_id: "file-hero",
				file_name: "hero.png",
				file_path: "design/images/hero.png",
			},
		})
		expect(heroItem?.description).toBeUndefined()
		expect(heroItem?.unSelectable).toBeUndefined()
		expect(frameItems.some((item) => item.unSelectable)).toBe(false)
		expect(frameItems.find((item) => item.name === "Caption Text")).toBeUndefined()
		expect(frameItems.find((item) => item.name === "Missing Media")).toBeUndefined()
	})

	it("keeps resolved media visible when selection rules mark it unavailable", () => {
		const limitedStore = new MentionPanelCanvasElementsStore()
		limitedStore.setActiveContext({
			designProjectId: "design-id",
			canvasName: "Pink Design",
			getCanvasDocument: () => ({
				elements: [
					{
						id: "clip",
						type: ElementTypeEnum.Video,
						name: "Clip Layer",
						src: "./videos/clip.mp4",
						zIndex: 1,
					},
				],
			}),
			resolveFileBySrc: () => ({
				...files[1],
				unSelectable: true,
			}),
		})

		const items = limitedStore.getFolderMentionItems("canvas-elements")

		expect(items).toHaveLength(1)
		expect(items[0]).toMatchObject({
			name: "Clip Layer",
			type: MentionItemType.PROJECT_FILE,
			unSelectable: true,
			sourcePreview: {
				kind: "canvas-element",
				elementId: "clip",
				mediaType: "video",
				src: "./videos/clip.mp4",
			},
		})
	})

	it("searches by element name while selection data remains the resolved file", () => {
		const results = store.searchItems("Clip", "canvas-elements", matchesQuery)

		expect(results).toHaveLength(1)
		const resultItem = results[0]
		if (!resultItem) throw new Error("Expected one canvas element search result")

		expect(resultItem).toMatchObject({
			name: "Clip Layer",
			type: MentionItemType.PROJECT_FILE,
			tags: ["canvas-element"],
			data: {
				file_id: "file-clip",
				file_name: "clip.mp4",
			},
		})
		expect(resultItem.description).toBeUndefined()
		expect(getTypeDescription(resultItem, true)).toBe("画布元素")
	})

	it("keeps scoped search inside the current canvas element folder", () => {
		const groupResults = store.searchItems(
			"Hero",
			getCanvasElementMentionItemId("group"),
			matchesQuery,
		)
		const frameResults = store.searchItems(
			"Hero",
			getCanvasElementMentionItemId("frame"),
			matchesQuery,
		)

		expect(groupResults).toEqual([])
		expect(frameResults.map((item) => item.name)).toEqual(["Hero Layer"])
	})
})
