import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { getPromptRichTextPlainText } from "@/pages/superMagic/components/MainInputContainer/panels/promptRichText"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import SlidesTemplatePromptDock from "../SlidesTemplatePromptDock"

const { sceneStateStoreMock } = vi.hoisted(() => ({
	sceneStateStoreMock: {
		resetState: vi.fn(),
		setInputScopeKey: vi.fn(),
		setPresetSuffixContent: vi.fn(),
	},
}))

vi.mock("mobx-react-lite", () => ({
	observer: <T,>(component: T) => component,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		i18n: { language: "en_US" },
		t: (_key: string, options?: { name?: string }) => options?.name ?? "",
	}),
}))

vi.mock(
	"@/pages/superMagic/components/MainInputContainer/components/editors/DefaultMessageEditorContainer",
	() => ({
		__esModule: true,
		default: ({ editorContext }: { editorContext: { topicMode: string } }) => (
			<div data-testid="mock-default-message-editor">{editorContext.topicMode}</div>
		),
	}),
)

vi.mock("@/pages/superMagic/components/MainInputContainer/stores", () => ({
	SceneStateProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
	buildTopicInputScopeKey: (...parts: string[]) => parts.join(":"),
	createSceneStateStore: () => sceneStateStoreMock,
}))

vi.mock("@/pages/superMagic/stores", () => ({
	roleStore: {
		setCurrentRole: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	projectStore: {
		selectedProject: null,
		setSelectedProject: vi.fn(),
	},
	topicStore: {
		selectedTopic: null,
		setSelectedTopic: vi.fn(),
	},
	workspaceStore: {
		firstWorkspace: { id: "workspace-1" },
		selectedWorkspace: { id: "workspace-1" },
		setSelectedWorkspace: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/services", () => ({
	__esModule: true,
	default: {
		route: {
			navigateToTopic: vi.fn(),
		},
	},
}))

const businessTemplate: OptionItem = {
	value: "PPT-business",
	label: {
		zh_CN: "商务模板",
		en_US: "Business Template",
	},
	thumbnail_url: "https://example.com/business-cover.png",
	colors: ["#315ECA", "#7AA7FF", "#182A5A"],
}

describe("SlidesTemplatePromptDock", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("writes selected template preset suffix into the scene store", () => {
		render(<SlidesTemplatePromptDock selectedTemplate={businessTemplate} />)

		const lastPresetContent = sceneStateStoreMock.setPresetSuffixContent.mock.calls.at(-1)?.[0]
		expect(screen.getByTestId("slides-template-prompt-dock")).toHaveClass(
			"dark",
			"flex",
			"gap-2",
		)
		expect(screen.getByTestId("mock-default-message-editor")).toHaveTextContent("ppt")
		expect(getPromptRichTextPlainText(lastPresetContent)).toBe(
			"Use slide template: PPT-business.",
		)
		expect(screen.getByTestId("slides-templates-page-selected-template-image")).toHaveAttribute(
			"src",
			"https://example.com/business-cover.png",
		)
		expect(screen.getByTestId("slides-template-color-palette")).toBeInTheDocument()
		expect(screen.getByTestId("slides-templates-page-selected-template")).toHaveClass(
			"rounded-xl",
			"border-white/[0.12]",
		)
		expect(
			screen
				.getByTestId("slides-templates-page-selected-template")
				.compareDocumentPosition(screen.getByTestId("mock-default-message-editor")) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
	})

	it("clears the selected template from the preview action", () => {
		const onClearSelectedTemplate = vi.fn()
		render(
			<SlidesTemplatePromptDock
				selectedTemplate={businessTemplate}
				onClearSelectedTemplate={onClearSelectedTemplate}
			/>,
		)

		screen.getByTestId("slides-templates-page-clear-selected-template").click()

		expect(onClearSelectedTemplate).toHaveBeenCalledTimes(1)
	})

	it("opens the selected template preview from the selected template area", () => {
		const onPreviewSelectedTemplate = vi.fn()
		render(
			<SlidesTemplatePromptDock
				selectedTemplate={businessTemplate}
				onPreviewSelectedTemplate={onPreviewSelectedTemplate}
			/>,
		)

		screen.getByTestId("slides-templates-page-preview-selected-template").click()

		expect(onPreviewSelectedTemplate).toHaveBeenCalledTimes(1)
	})

	it("finds templates with colors similar to the selected template", () => {
		const onFindSimilarColors = vi.fn()
		render(
			<SlidesTemplatePromptDock
				selectedTemplate={businessTemplate}
				onFindSimilarColors={onFindSimilarColors}
			/>,
		)

		screen.getByTestId("slides-templates-page-find-similar-colors").click()

		expect(onFindSimilarColors).toHaveBeenCalledWith(businessTemplate)
	})

	it("clears preset suffix when no template is selected", () => {
		render(<SlidesTemplatePromptDock selectedTemplate={null} />)

		expect(sceneStateStoreMock.setPresetSuffixContent).toHaveBeenLastCalledWith(undefined)
	})
})
