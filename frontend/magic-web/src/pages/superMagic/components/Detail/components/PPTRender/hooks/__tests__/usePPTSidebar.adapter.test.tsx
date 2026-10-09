import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { usePPTSidebar } from "../usePPTSidebar"

const mocks = vi.hoisted(() => ({
	findMagicProjectJsFile: vi.fn(),
	updateSlidesOrder: vi.fn(),
	duplicateSlide: vi.fn(),
	getTemporaryDownloadUrl: vi.fn(),
	registeredSync: undefined as undefined | ((slides: Array<{ path: string }>) => Promise<void>),
}))

vi.mock("ahooks", async () => {
	const React = await import("react")
	return {
		useMemoizedFn: <T extends (...args: never[]) => unknown>(fn: T) => fn,
		useMount: (fn: () => void | (() => void)) => {
			const fnRef = React.useRef(fn)
			fnRef.current = fn
			return React.useEffect(() => fnRef.current(), [])
		},
	}
})

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		error: vi.fn(),
		warning: vi.fn(),
		loading: vi.fn(() => "toast"),
		destroy: vi.fn(),
		success: vi.fn(),
	},
}))
vi.mock("../../../../contents/HTML/utils/magicProjectUpdater", () => ({
	findMagicProjectJsFile: mocks.findMagicProjectJsFile,
	updateSlidesOrder: mocks.updateSlidesOrder,
	duplicateSlide: mocks.duplicateSlide,
	insertSlide: vi.fn(),
	deleteSlide: vi.fn(),
	renameSlide: vi.fn(),
}))
vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: mocks.getTemporaryDownloadUrl,
}))
vi.mock("@/components/base/MagicModal", () => ({ default: { confirm: vi.fn() } }))
vi.mock("@/apis", () => ({ SuperMagicApi: {} }))
vi.mock("@/pages/superMagic/utils/topics", () => ({
	addFileToCurrentChat: vi.fn(),
	addFileToNewChat: vi.fn(),
}))
vi.mock("@/pages/superMagic/stores/core", () => ({ workspaceStore: {}, projectStore: {} }))
vi.mock("@/utils/pubsub", () => ({ default: { publish: vi.fn() }, PubSubEvents: {} }))
vi.mock("@/stores/projectFiles", () => ({ default: { addWorkspaceFile: vi.fn() } }))
vi.mock("@/pages/superMagic/services/attachmentsTopicSync", () => ({
	requestProjectAttachmentsFullRefresh: vi.fn(),
}))

describe("usePPTSidebar structure adapter", () => {
	it.each([true, false])("reports the actual rename result: %s", async (success) => {
		const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined)
		const adapter = {
			reorder: vi.fn(),
			insert: vi.fn(),
			duplicate: vi.fn(),
			remove: vi.fn(),
			rename: success
				? vi.fn().mockResolvedValue("slides/renamed.html")
				: vi.fn().mockRejectedValue(new Error("rename failed")),
		}
		const store = {
			slides: [{ id: "one", path: "slides/one.html", index: 0 }],
			slidePaths: ["slides/one.html"],
			syncManager: { registerSyncFunction: vi.fn() },
			getFileIdByPath: () => "one",
			pathMappingService: { getUrlByPath: () => "", setPathFileIdMapping: vi.fn() },
			setSlides: vi.fn(),
		}
		const { result, unmount } = renderHook(() =>
			usePPTSidebar({
				slides: store.slides as never,
				activeIndex: 0,
				isTransitioning: false,
				allowEdit: true,
				setActiveIndex: vi.fn(),
				setIsTransitioning: vi.fn(),
				store: store as never,
				slideStructureAdapter: adapter,
			}),
		)
		try {
			await act(async () => {
				expect(await result.current.handleRenameSlide(0, "renamed")).toBe(success)
			})
		} finally {
			unmount()
			errorLog.mockRestore()
		}
	})

	beforeEach(() => {
		vi.clearAllMocks()
		mocks.registeredSync = undefined
	})

	it("persists sorting through the adapter without looking for magic.project.js", async () => {
		const adapter = {
			reorder: vi.fn().mockResolvedValue(undefined),
			insert: vi.fn(),
			duplicate: vi.fn(),
			remove: vi.fn(),
			rename: vi.fn(),
		}
		const store = {
			slides: [
				{ id: "one", path: "slides/one.html", index: 0 },
				{ id: "two", path: "slides/two.html", index: 1 },
			],
			slidePaths: ["slides/one.html", "slides/two.html"],
			syncManager: {
				registerSyncFunction: (sync: typeof mocks.registeredSync) => {
					mocks.registeredSync = sync
				},
			},
			markSkipNextExternalSync: vi.fn(),
			setSlides: vi.fn(),
		}

		renderHook(() =>
			usePPTSidebar({
				slides: store.slides as never,
				activeIndex: 0,
				isTransitioning: false,
				allowEdit: true,
				setActiveIndex: vi.fn(),
				setIsTransitioning: vi.fn(),
				store: store as never,
				slideStructureAdapter: adapter,
			}),
		)

		expect(mocks.registeredSync).toEqual(expect.any(Function))
		await act(async () => {
			await mocks.registeredSync?.([{ path: "slides/two.html" }, { path: "slides/one.html" }])
		})

		expect(adapter.reorder).toHaveBeenCalledWith(["slides/two.html", "slides/one.html"])
		expect(mocks.findMagicProjectJsFile).not.toHaveBeenCalled()
		expect(mocks.updateSlidesOrder).not.toHaveBeenCalled()
	})

	it("keeps the .html suffix on a newly inserted template slide title", async () => {
		mocks.getTemporaryDownloadUrl.mockResolvedValue([
			{ file_id: "slide-12", url: "https://example.com/slide-12.html" },
		])
		const adapter = {
			reorder: vi.fn(),
			insert: vi.fn().mockResolvedValue({
				filePath: "slides/slide-12.html",
				fileId: "slide-12",
				content: "<html>slide-12.html</html>",
			}),
			duplicate: vi.fn(),
			remove: vi.fn(),
			rename: vi.fn(),
		}
		const store = {
			slides: [{ id: "one", path: "slides/contents.html", index: 0 }],
			slidePaths: ["slides/contents.html"],
			syncManager: { registerSyncFunction: vi.fn() },
			markSkipNextExternalSync: vi.fn(),
			setSlides: vi.fn(),
			setActiveIndex: vi.fn(),
			pathMappingService: {
				setPathFileIdMapping: vi.fn(),
				setPathUrlMapping: vi.fn(),
			},
			loadSlideContentByFileId: vi.fn().mockResolvedValue(""),
			ensureSlideScreenshot: vi.fn().mockResolvedValue(undefined),
		}

		const { result } = renderHook(() =>
			usePPTSidebar({
				slides: store.slides as never,
				activeIndex: 0,
				isTransitioning: false,
				allowEdit: true,
				setActiveIndex: store.setActiveIndex,
				setIsTransitioning: vi.fn(),
				store: store as never,
				slideStructureAdapter: adapter,
			}),
		)

		await act(async () => {
			await result.current.handleInsertSlide(0, "after")
		})

		expect(store.setSlides).toHaveBeenCalledWith(
			[
				expect.objectContaining({ path: "slides/contents.html" }),
				expect.objectContaining({
					path: "slides/slide-12.html",
					title: "slide-12.html",
				}),
			],
			true,
		)
	})

	it("duplicates a template slide, selects it, and generates its screenshot", async () => {
		mocks.getTemporaryDownloadUrl.mockResolvedValue([
			{ file_id: "slide-copy", url: "https://example.com/slide-copy.html" },
		])
		const adapter = {
			reorder: vi.fn(),
			insert: vi.fn(),
			duplicate: vi.fn().mockResolvedValue({
				filePath: "slides/contents (1).html",
				fileId: "slide-copy",
				content: "<html>copied</html>",
			}),
			remove: vi.fn(),
			rename: vi.fn(),
		}
		const store = {
			slides: [{ id: "one", path: "slides/contents.html", index: 0 }],
			slidePaths: ["slides/contents.html"],
			syncManager: { registerSyncFunction: vi.fn() },
			markSkipNextExternalSync: vi.fn(),
			setSlides: vi.fn(),
			setActiveIndex: vi.fn(),
			getFileIdByPath: vi.fn((path: string) => (path ? "source-file" : undefined)),
			pathMappingService: {
				setPathFileIdMapping: vi.fn(),
				setPathUrlMapping: vi.fn(),
			},
			loadSlideContentByFileId: vi.fn().mockResolvedValue(""),
			ensureSlideScreenshot: vi.fn().mockResolvedValue(undefined),
		}

		const { result } = renderHook(() =>
			usePPTSidebar({
				slides: store.slides as never,
				activeIndex: 0,
				isTransitioning: false,
				allowEdit: true,
				setActiveIndex: store.setActiveIndex,
				setIsTransitioning: vi.fn(),
				store: store as never,
				slideStructureAdapter: adapter,
				projectId: "project-1",
			}),
		)

		await act(async () => {
			await result.current.handleDuplicateSlide(0)
		})

		expect(adapter.duplicate).toHaveBeenCalledWith({
			slidePath: "slides/contents.html",
			position: 0,
		})
		expect(store.setSlides).toHaveBeenCalledWith(
			[
				expect.objectContaining({ path: "slides/contents.html" }),
				expect.objectContaining({
					path: "slides/contents (1).html",
					id: "slide-slide-copy",
				}),
			],
			true,
		)
		expect(store.setActiveIndex).toHaveBeenCalledWith(1)
		expect(store.ensureSlideScreenshot).toHaveBeenCalledWith(1)
	})

	it("duplicates a regular PPT slide through magic.project.js", async () => {
		mocks.findMagicProjectJsFile.mockResolvedValue({ fileId: "magic-project" })
		mocks.duplicateSlide.mockResolvedValue({
			newFilePath: "slides/contents (1).html",
			newFileId: "slide-copy",
			content: "<html>copied</html>",
			newFile: {
				file_id: "slide-copy",
				file_name: "contents (1).html",
				relative_file_path: "slides/contents (1).html",
			},
		})
		mocks.getTemporaryDownloadUrl.mockResolvedValue([
			{ file_id: "slide-copy", url: "https://example.com/slide-copy.html" },
		])
		const store = {
			slides: [{ id: "one", path: "slides/contents.html", index: 0 }],
			slidePaths: ["slides/contents.html"],
			syncManager: { registerSyncFunction: vi.fn() },
			markSkipNextExternalSync: vi.fn(),
			setSlides: vi.fn(),
			setActiveIndex: vi.fn(),
			getFileIdByPath: vi.fn(() => "source-file"),
			pathMappingService: {
				setPathFileIdMapping: vi.fn(),
				setPathUrlMapping: vi.fn(),
			},
			loadSlideContentByFileId: vi.fn().mockResolvedValue(""),
			ensureSlideScreenshot: vi.fn().mockResolvedValue(undefined),
		}

		const { result } = renderHook(() =>
			usePPTSidebar({
				slides: store.slides as never,
				activeIndex: 0,
				isTransitioning: false,
				allowEdit: true,
				setActiveIndex: store.setActiveIndex,
				setIsTransitioning: vi.fn(),
				store: store as never,
				projectId: "project-1",
				mainFileId: "main-file",
				mainFileName: "deck",
			}),
		)

		await act(async () => {
			await result.current.handleDuplicateSlide(0)
		})

		expect(mocks.duplicateSlide).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: "project-1",
				magicProjectFileId: "magic-project",
				sourceFileId: "source-file",
				slidePath: "slides/contents.html",
				position: 0,
			}),
		)
		expect(store.setActiveIndex).toHaveBeenCalledWith(1)
		expect(store.ensureSlideScreenshot).toHaveBeenCalledWith(1)
	})
})
