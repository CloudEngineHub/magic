import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { runInAction } from "mobx"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import MobileComposerModeSelector from "../MobileComposerModeSelector"

interface SyntheticModeItem {
	mode: { identifier: string; name: string }
}

interface SyntheticModeService {
	modeList: SyntheticModeItem[]
	getModeConfigWithLegacy: ReturnType<typeof vi.fn>
}

const modeServiceControl = vi.hoisted(() => ({
	current: null as SyntheticModeService | null,
}))

vi.mock("@/services/superMagic/SuperMagicModeService", async () => {
	const { makeAutoObservable } = await vi.importActual<typeof import("mobx")>("mobx")
	const service: SyntheticModeService = {
		modeList: [],
		/** Resolve the selected crew from the latest synthetic featured-mode response. */
		getModeConfigWithLegacy: vi.fn(
			(topicMode: string, _translation: unknown, _isMobile: boolean, agentCode?: string) => {
				const identifier = topicMode === "custom_agent" ? agentCode : topicMode
				return service.modeList.find((item) => item.mode.identifier === identifier) ?? null
			},
		),
	}
	makeAutoObservable(service, { getModeConfigWithLegacy: false })
	modeServiceControl.current = service

	return { default: service }
})

vi.mock("react-i18next", () => ({
	Trans: ({ children }: { children?: ReactNode }) => <>{children}</>,
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/base-mobile/MagicPopup", () => ({
	default: () => null,
}))

vi.mock("@/pages/superMagic/hooks/useFeaturedModeListRefresh", () => ({
	useFeaturedModeListRefreshOnFirstOpen: vi.fn(),
}))

vi.mock("@/pages/superMagic/components/ModeAvatar", () => ({
	default: ({
		mode,
		"data-testid": testId,
	}: {
		mode: { identifier: string }
		iconSize?: number
		"data-testid"?: string
	}) => <div data-testid={testId} data-mode-identifier={mode.identifier} />,
}))

vi.mock("@/pages/superMagic/components/MessageEditor/hooks/useTopicModel", () => ({
	default: () => ({
		modelList: [],
		imageModelList: [],
		videoModelList: [],
		topicModelStore: {
			selectedLanguageModel: null,
			selectedImageModel: null,
			selectedVideoModel: null,
		},
		validateSelectedModels: vi.fn(),
		setSelectedModel: vi.fn(),
		setSelectedImageModel: vi.fn(),
		setSelectedVideoModel: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/components/MessageEditor/stores", () => ({
	useOptionalMessageEditorStore: () => null,
}))

vi.mock(
	"@/pages/superMagic/components/MessageEditor/components/ModelSwitch/components/ModelIcon",
	() => ({ default: () => null }),
)

vi.mock(
	"@/pages/superMagic/components/MessageEditor/components/ModelSwitch/components/ModelListContent",
	() => ({ ModelListContent: () => null }),
)

vi.mock(
	"@/pages/superMagic/components/MessageEditor/components/ModelSwitch/components/ModelTabSwitcher",
	() => ({ ModelTabSwitcher: () => null }),
)

vi.mock("@/pages/superMagicMobile/components/DataEmptyState", () => ({
	DataEmptyState: () => null,
}))

vi.mock("@/components/shadcn-ui/button", () => ({
	Button: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
}))

vi.mock("@/utils/pubsub", () => ({
	default: { publish: vi.fn() },
	PubSubEvents: { Create_New_Topic: "create-new-topic" },
}))

vi.mock("../MobileCrewModeList", () => ({
	default: () => null,
}))

/** Return the initialized observable mode service used by this test module. */
function getModeServiceMock(): SyntheticModeService {
	if (!modeServiceControl.current) throw new Error("Synthetic mode service is not initialized")
	return modeServiceControl.current
}

describe("MobileComposerModeSelector", () => {
	beforeEach(() => {
		const modeServiceMock = getModeServiceMock()
		runInAction(() => {
			modeServiceMock.modeList = []
		})
		modeServiceMock.getModeConfigWithLegacy.mockClear()
	})

	it("shows the selected crew after the featured mode list loads asynchronously", async () => {
		const modeServiceMock = getModeServiceMock()
		const props = {
			topicMode: TopicMode.CustomAgent,
			agentCode: "synthetic-agent-code",
		}
		render(<MobileComposerModeSelector {...props} />)

		expect(screen.queryByTestId("mobile-composer-mode-selector-avatar")).toBeNull()

		act(() => {
			runInAction(() => {
				modeServiceMock.modeList = [
					{
						mode: {
							identifier: "synthetic-agent-code",
							name: "Synthetic Crew",
						},
					},
				]
			})
		})

		expect(await screen.findByTestId("mobile-composer-mode-selector-avatar")).toHaveAttribute(
			"data-mode-identifier",
			"synthetic-agent-code",
		)
	})

	it("uses the employee selector trigger for the default variant", () => {
		render(
			<MobileComposerModeSelector
				topicMode={TopicMode.CustomAgent}
				agentCode="synthetic-agent-code"
				selectorVariant="default"
			/>,
		)

		expect(screen.getByTestId("mobile-composer-mode-selector-trigger")).toBeInTheDocument()
		expect(
			screen.queryByTestId("mobile-composer-claw-model-selector-trigger"),
		).not.toBeInTheDocument()
	})
})
