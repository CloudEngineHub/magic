import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { ScenePanelVariant } from "../../components/LazyScenePanel/types"

const { mockPublish } = vi.hoisted(() => ({
	mockPublish: vi.fn(),
}))

vi.mock("mobx-react-lite", () => ({
	observer: <T,>(component: T) => component,
}))

vi.mock("@/hooks/usePortalTarget", () => ({
	default: () => document.body,
}))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("../../hooks", () => ({
	useCurrentSceneConfig: () => ({
		placeholder: "",
		panels: [],
		isLoading: false,
	}),
}))

vi.mock("../../stores", () => ({
	useOptionalScenePanelVariant: () => ScenePanelVariant.TopicPage,
}))

vi.mock("../../components/editors/DefaultMessageEditorContainer", () => ({
	default: () => <div data-testid="default-message-editor" />,
}))

vi.mock("../../components/ScenePanelContainer", () => ({
	default: ({
		onTemplateSelect,
	}: {
		onTemplateSelect?: (template: { value: string }) => void
	}) => (
		<button type="button" onClick={() => onTemplateSelect?.({ value: "template-a" })}>
			选择模板
		</button>
	),
}))

vi.mock("../Slides/SlidesTemplateHomeSelectionPreview", () => ({
	default: () => <div data-testid="slides-template-preview" />,
}))

vi.mock("@/utils/pubsub", () => ({
	default: { publish: mockPublish },
	PubSubEvents: { Message_Scroll_To_Bottom: "scroll_messages_to_bottom" },
}))

import DefaultInputContainer from "../Default"

describe("DefaultInputContainer", () => {
	afterEach(() => {
		vi.useRealTimers()
		vi.clearAllMocks()
	})

	it("项目页选择模板后不改变消息列表位置", () => {
		vi.useFakeTimers()

		render(
			<DefaultInputContainer
				editorContext={{
					topicMode: TopicMode.PPT,
					editorRef: { current: null },
				}}
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: "选择模板" }))
		expect(mockPublish).not.toHaveBeenCalled()
	})
})
