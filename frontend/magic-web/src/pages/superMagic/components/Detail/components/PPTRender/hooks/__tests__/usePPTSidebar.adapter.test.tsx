import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { usePPTSidebar } from "../usePPTSidebar"

const mocks = vi.hoisted(() => ({
	findMagicProjectJsFile: vi.fn(),
	updateSlidesOrder: vi.fn(),
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
	insertSlide: vi.fn(),
	deleteSlide: vi.fn(),
	renameSlide: vi.fn(),
}))
vi.mock("@/pages/superMagic/utils/api", () => ({ getTemporaryDownloadUrl: vi.fn() }))
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
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.registeredSync = undefined
	})

	it("persists sorting through the adapter without looking for magic.project.js", async () => {
		const adapter = {
			reorder: vi.fn().mockResolvedValue(undefined),
			insert: vi.fn(),
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
})
