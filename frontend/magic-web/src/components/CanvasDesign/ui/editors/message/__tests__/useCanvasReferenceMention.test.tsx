import { render } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CanvasDesignI18nProvider } from "../../../../app/providers/I18nProvider"
import { MagicProvider } from "../../../../app/providers/MagicProvider"
import type {
	MentionDataServiceCtor,
	MentionExtensionCtor,
	ProjectAttachmentMentionNode,
	ReferenceResourcePanelLimitInfo,
} from "../../../../public/props"
import { CANVAS_REFERENCE_MENTION_ITEM_TYPE } from "../reference-assets/canvasReferenceMention.constants"
import type {
	ReferenceAssetPerTypeLimits,
	ReferenceAssetTypeCounts,
} from "../reference-assets/reference-resource.types"
import { useCanvasReferenceMentionRuntime } from "../reference-assets/useCanvasReferenceMentionRuntime"
import { useCanvasReferenceMention } from "../useCanvasReferenceMention"
import { getContentFromString } from "../tiptap/contentUtils"

class TestMentionDataService {
	static instances: TestMentionDataService[] = []

	roots: ProjectAttachmentMentionNode[]
	limitInfoGetter?: () => ReferenceResourcePanelLimitInfo | undefined
	refreshCount = 0

	constructor(roots: ProjectAttachmentMentionNode[]) {
		this.roots = roots
		TestMentionDataService.instances.push(this)
	}

	dispatch = vi.fn(() => ({ items: [] }))

	setLimitInfoGetter(getter: (() => ReferenceResourcePanelLimitInfo | undefined) | undefined) {
		this.limitInfoGetter = getter
	}

	syncProjectAttachmentRoots(roots: ProjectAttachmentMentionNode[]) {
		this.roots = roots
	}

	requestRefresh() {
		this.refreshCount += 1
	}
}

const TestMentionDataServiceCtor = TestMentionDataService as unknown as MentionDataServiceCtor

const imageVideoLimits: ReferenceAssetPerTypeLimits = {
	reference_images: { min: 0, max: 2 },
	reference_videos: { min: 0, max: 1 },
	reference_audios: { min: 0, max: 0 },
	total: { min: 0, max: 3 },
}

const currentVideoFullCounts: ReferenceAssetTypeCounts = {
	images: 0,
	videos: 1,
	audios: 0,
}

let latestRuntime: ReturnType<typeof useCanvasReferenceMentionRuntime> | undefined
let latestMention: ReturnType<typeof useCanvasReferenceMention> | undefined
let configureMentionExtension: ReturnType<typeof vi.fn>
const TestMentionExtension = {
	configure: (options: unknown) => configureMentionExtension(options),
} as unknown as MentionExtensionCtor

function getRuntime() {
	if (!latestRuntime) throw new Error("Runtime hook did not render")
	return latestRuntime
}

function getMention() {
	if (!latestMention) throw new Error("Mention hook did not render")
	return latestMention
}

function getConfiguredOptions() {
	const firstCall = configureMentionExtension.mock.calls[0]
	if (!firstCall) throw new Error("Mention extension was not configured")
	return firstCall[0] as {
		getInitialLoadOptions?: () => { itemId?: string } | undefined
		getInitialNavigationStack?: () => Array<{ id: string; name: string }> | undefined
		canSelectItem?: (item: { type?: string; isFolder?: boolean }) => boolean
	}
}

function fileNode(name: string, path: string): ProjectAttachmentMentionNode {
	const extension = name.includes(".") ? `.${name.split(".").pop() ?? ""}` : ""
	return {
		id: path,
		fileId: path,
		name,
		path,
		extension,
		isDirectory: false,
	}
}

function folderNode(
	id: string,
	name: string,
	children: ProjectAttachmentMentionNode[],
): ProjectAttachmentMentionNode {
	return {
		id,
		fileId: id,
		name,
		path: id,
		isDirectory: true,
		children,
	}
}

interface ProviderProps {
	children: ReactNode
	folderId?: string
	folderName?: string
	tree?: ProjectAttachmentMentionNode[]
}
type ProviderConfig = Omit<ProviderProps, "children">

function Providers(props: ProviderProps) {
	return (
		<MagicProvider
			readonly
			projectAttachmentMentionTree={props.tree}
			defaultProjectAttachmentFolderId={props.folderId}
			defaultProjectAttachmentFolderName={props.folderName}
			mentionDataServiceCtor={TestMentionDataServiceCtor}
			mentionExtension={TestMentionExtension}
		>
			<CanvasDesignI18nProvider
				t={(key, defaultValue) => (typeof defaultValue === "string" ? defaultValue : key)}
			>
				{props.children}
			</CanvasDesignI18nProvider>
		</MagicProvider>
	)
}

type RuntimeOptions = Parameters<typeof useCanvasReferenceMentionRuntime>[0]
type MentionOptions = Parameters<typeof useCanvasReferenceMention>[0]

function RuntimeProbe(props: { options: RuntimeOptions }) {
	latestRuntime = useCanvasReferenceMentionRuntime(props.options)
	return null
}

function MentionProbe(props: { options?: MentionOptions }) {
	latestMention = useCanvasReferenceMention(props.options)
	return null
}

function renderRuntime(props: ProviderConfig & { options?: Partial<RuntimeOptions> }) {
	const runtimeOptions: RuntimeOptions = {
		referenceResourceType: "image",
		referenceFileInfos: [],
		...props.options,
	}
	return render(
		<Providers {...props}>
			<RuntimeProbe options={runtimeOptions} />
		</Providers>,
	)
}

function renderMention(props: ProviderConfig & { options?: MentionOptions }) {
	return render(
		<Providers {...props}>
			<MentionProbe options={props.options} />
		</Providers>,
	)
}

function getItemDisabled(name: string) {
	const item = getMention().matchableItems.find((entry) => entry.name === name)
	if (!item) throw new Error(`Missing matchable item: ${name}`)
	return item.disabled ?? false
}

describe("useCanvasReferenceMention", () => {
	beforeEach(() => {
		latestRuntime = undefined
		latestMention = undefined
		TestMentionDataService.instances = []
		configureMentionExtension = vi.fn((options: unknown) => ({ options }))
	})

	it("keeps default directory getters fresh without rebuilding the mention extension", () => {
		const { rerender } = renderMention({
			folderId: "design-a",
			folderName: "Design A",
			tree: [],
		})
		const options = getConfiguredOptions()

		expect(configureMentionExtension).toHaveBeenCalledTimes(1)
		expect(options.getInitialLoadOptions?.()).toEqual({ itemId: "design-a" })
		expect(options.getInitialNavigationStack?.()).toEqual([
			{ id: "design-a", name: "Design A", state: "default" },
		])

		rerender(
			<Providers folderId="design-b" folderName="Design B" tree={[]}>
				<MentionProbe />
			</Providers>,
		)

		expect(configureMentionExtension).toHaveBeenCalledTimes(1)
		expect(options.getInitialLoadOptions?.()).toEqual({ itemId: "design-b" })
		expect(options.getInitialNavigationStack?.()).toEqual([
			{ id: "design-b", name: "Design B", state: "default" },
		])
	})

	it("returns the same default directory for @ mention and project-select panel runtime", () => {
		const { rerender } = renderRuntime({
			folderId: "design-a",
			folderName: "Design A",
		})
		const runtime = getRuntime()
		const getInitialLoadOptions = runtime.getInitialLoadOptions
		const getInitialNavigationStack = runtime.getInitialNavigationStack

		expect(runtime.initialLoadOptions).toEqual(getInitialLoadOptions())
		expect(runtime.initialNavigationStack).toEqual(getInitialNavigationStack())

		rerender(
			<Providers folderId="design-b" folderName="Design B">
				<RuntimeProbe
					options={{ referenceResourceType: "image", referenceFileInfos: [] }}
				/>
			</Providers>,
		)

		expect(getRuntime().getInitialLoadOptions).toBe(getInitialLoadOptions)
		expect(getRuntime().getInitialNavigationStack).toBe(getInitialNavigationStack)
		expect(getRuntime().initialLoadOptions).toEqual({ itemId: "design-b" })
		expect(getInitialLoadOptions()).toEqual({ itemId: "design-b" })
	})

	it("allows folder navigation but prevents folder insertion", () => {
		renderRuntime({ folderId: "design-a", folderName: "Design A" })
		const runtime = getRuntime()

		expect(
			runtime.catalogBehavior.shouldEnterFolderDirectly?.({
				selectedItem: {
					type: CANVAS_REFERENCE_MENTION_ITEM_TYPE.folder,
					isFolder: true,
				},
				enterFolder: false,
			}),
		).toBe(true)
		expect(
			runtime.canSelectItem({
				type: CANVAS_REFERENCE_MENTION_ITEM_TYPE.folder,
				isFolder: true,
			}),
		).toBe(false)
		expect(
			runtime.canSelectItem({
				type: CANVAS_REFERENCE_MENTION_ITEM_TYPE.projectFile,
			}),
		).toBe(true)
	})

	it("disables unselected files after reaching the total reference limit", () => {
		renderMention({
			tree: [
				folderNode("design-a", "Design A", [
					fileNode("cat.png", "design-a/cat.png"),
					fileNode("dog.png", "design-a/dog.png"),
				]),
			],
			options: {
				maxReferenceFiles: 1,
				currentReferenceFiles: ["design-a/cat.png"],
				isReferenceFileLimitReached: true,
				referenceResourceType: "image",
			},
		})

		expect(getItemDisabled("cat.png")).toBe(false)
		expect(getItemDisabled("dog.png")).toBe(true)
	})

	it("applies image and video editor type/capacity limits", () => {
		const tree = [
			folderNode("design-a", "Design A", [
				fileNode("cat.png", "design-a/cat.png"),
				fileNode("clip.mp4", "design-a/clip.mp4"),
				fileNode("voice.mp3", "design-a/voice.mp3"),
			]),
		]

		renderMention({
			tree,
			options: {
				referenceResourceType: "image",
			},
		})
		expect(getItemDisabled("cat.png")).toBe(false)
		expect(getItemDisabled("clip.mp4")).toBe(true)
		expect(getItemDisabled("voice.mp3")).toBe(true)

		renderMention({
			tree,
			options: {
				referenceResourceType: ["image", "video"],
				assetLimits: imageVideoLimits,
				currentAssetCounts: currentVideoFullCounts,
			},
		})
		expect(getItemDisabled("cat.png")).toBe(false)
		expect(getItemDisabled("clip.mp4")).toBe(true)
		expect(getItemDisabled("voice.mp3")).toBe(true)
	})

	it("prefers current reference files before project attachments for duplicate names", () => {
		renderMention({
			tree: [folderNode("design-a", "Design A", [fileNode("cat.png", "project/cat.png")])],
			options: {
				matchableItems: [{ name: "cat.png", path: "current/cat.png" }],
				referenceResourceType: "image",
			},
		})

		const catItems = getMention().matchableItems.filter((item) => item.name === "cat.png")
		expect(catItems.map((item) => item.path)).toEqual(["current/cat.png", "project/cat.png"])

		const doc = getContentFromString("@cat.png", getMention().matchableItems)
		const mentionNode = doc.content?.[0]?.content?.[0] as
			| { attrs?: { data?: { file_path?: string } } }
			| undefined
		expect(mentionNode?.attrs?.data?.file_path).toBe("current/cat.png")
	})

	it("deduplicates current and project files by Canvas canonical path", () => {
		renderMention({
			tree: [folderNode("design-a", "Design A", [fileNode("cat.png", "/images/cat.png")])],
			options: {
				matchableItems: [{ name: "cat.png", path: "./images/cat.png" }],
				referenceResourceType: "image",
			},
		})

		expect(getMention().matchableItems.filter((item) => item.name === "cat.png")).toEqual([
			expect.objectContaining({ path: "./images/cat.png" }),
		])
	})
})
