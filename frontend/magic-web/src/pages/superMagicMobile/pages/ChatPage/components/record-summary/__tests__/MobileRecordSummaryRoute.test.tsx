import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RecordingSummaryEditorMode } from "@/pages/superMagic/components/MessagePanel/const/recordSummary"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { SceneEditorContext } from "@/pages/superMagic/components/MainInputContainer/components/editors/types"

const testState = vi.hoisted(() => ({
	savedEditorMode: "recording" as "recording" | "editing",
}))

vi.mock("@/pages/superMagic/components/MessagePanel/hooks/useRecordingSummaryEditorMode", () => ({
	default: () => ({
		editorMode: testState.savedEditorMode,
		setEditorMode: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/components/MainInputContainer/hooks", () => ({
	useSceneSelection: () => ({ hasOnlyScene: false }),
}))

vi.mock("@/pages/superMagic/components/MainInputContainer/hooks/useCurrentSceneConfig", () => ({
	useCurrentSceneConfig: () => ({
		placeholder: undefined,
		panels: [],
		isLoading: false,
	}),
}))

vi.mock("@/pages/superMagic/components/MessageEditor/hooks/useResolvedEditorStore", () => ({
	default: () => ({ store: {} }),
}))

vi.mock("@/pages/superMagic/components/MessageEditor/stores", () => ({
	MessageEditorStoreProvider: ({ children }: { children: unknown }) => <>{children}</>,
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	projectStore: { selectedProject: null },
	topicStore: { selectedTopic: null },
}))

vi.mock("@/pages/superMagic/stores", () => ({
	roleStore: { currentRole: "summary" },
}))

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: {
		getModeConfigWithLegacy: () => undefined,
	},
}))

vi.mock("../../mobile-composer/MobileComposer", () => ({
	default: () => <div data-testid="mobile-message-editor" />,
}))

vi.mock("../../mobile-composer/MobileComposerHeader", () => ({
	default: () => <div data-testid="mobile-composer-header" />,
}))

vi.mock("../../mobile-composer/MobileScenePanels", () => ({
	default: () => <div data-testid="mobile-scene-panels" />,
}))

vi.mock(
	"@/pages/superMagic/components/MainInputContainer/components/editors/RecordSummaryEditorContainer",
	() => ({
		default: () => <div data-testid="record-summary-editor-container" />,
	}),
)

import MobileRecordSummaryRoute from "../MobileRecordSummaryRoute"

/** Builds a minimal editor context for the mobile recording-summary route. */
function createEditorContext(overrides: Partial<SceneEditorContext> = {}): SceneEditorContext {
	return {
		selectedTopic: null,
		selectedProject: { id: "mock-project-001" } as never,
		topicMode: TopicMode.RecordSummary,
		...overrides,
	}
}

describe("MobileRecordSummaryRoute", () => {
	beforeEach(() => {
		testState.savedEditorMode = RecordingSummaryEditorMode.Recording
	})

	it("keeps the employee switcher when recording mode is disabled", () => {
		render(
			<MobileRecordSummaryRoute
				editorContext={createEditorContext({ allowRecordingMode: false })}
			/>,
		)

		// Detail pages still use the recording chrome so the crew header stays available.
		expect(screen.getByTestId("mobile-record-summary-route")).toBeInTheDocument()
		expect(screen.getByTestId("mobile-composer-header")).toBeInTheDocument()
		expect(screen.queryByTestId("mobile-record-summary-route-editing")).not.toBeInTheDocument()
		expect(screen.getByTestId("record-summary-editor-container")).toBeInTheDocument()
	})

	it("keeps the recording route when recording mode stays allowed", () => {
		render(<MobileRecordSummaryRoute editorContext={createEditorContext()} />)

		expect(screen.getByTestId("mobile-record-summary-route")).toBeInTheDocument()
		expect(screen.queryByTestId("mobile-record-summary-route-editing")).not.toBeInTheDocument()
		expect(screen.getByTestId("record-summary-editor-container")).toBeInTheDocument()
	})
})
