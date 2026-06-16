import { fireEvent, render, screen } from "@testing-library/react"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { PrePublishAnalysisDialog } from "../components/PrePublishAnalysisDialog"

const DEFAULT_MODEL = {
	id: "model-1",
	group_id: "group-1",
	model_id: "gpt-5",
	model_name: "GPT-5",
	provider_model_id: "gpt-5",
	model_description: "",
	model_icon: "https://example.com/gpt-5.svg",
	model_status: "normal",
	sort: 1,
}

const ALT_MODEL = {
	...DEFAULT_MODEL,
	id: "model-2",
	model_id: "claude-sonnet",
	model_name: "Claude Sonnet",
}

const DISABLED_MODEL = {
	...DEFAULT_MODEL,
	id: "model-disabled",
	model_id: "disabled-model",
	model_name: "Disabled Model",
	model_status: "disabled",
}

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
}))

vi.mock("../services/selfMediaPrePublishAnalysis", () => ({
	SELF_MEDIA_PRE_PUBLISH_ANALYSIS_GOALS: [
		{
			value: "ip-growth",
			labelKey: "detail.selfMedia.analysis.goals.ipGrowth",
			descriptionKey: "detail.selfMedia.analysis.goalDescriptions.ipGrowth",
		},
		{
			value: "conversion",
			labelKey: "detail.selfMedia.analysis.goals.conversion",
			descriptionKey: "detail.selfMedia.analysis.goalDescriptions.conversion",
		},
		{
			value: "viral-traffic",
			labelKey: "detail.selfMedia.analysis.goals.viralTraffic",
			descriptionKey: "detail.selfMedia.analysis.goalDescriptions.viralTraffic",
		},
	],
}))

vi.mock("@/components/shadcn-ui/button", () => ({
	Button: ({
		children,
		...props
	}: ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) => (
		<button {...props}>{children}</button>
	),
}))

vi.mock("@/components/shadcn-ui/dialog", () => ({
	Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
		open ? <div>{children}</div> : null,
	DialogContent: ({ children, ...props }: { children?: ReactNode }) => (
		<div {...props}>{children}</div>
	),
	DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
	DialogFooter: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
	DialogHeader: ({ children }: { children?: ReactNode }) => <header>{children}</header>,
	DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}))

vi.mock("@/components/shadcn-ui/radio-group", async () => {
	const React = await vi.importActual<typeof import("react")>("react")
	const eventName = "pre-publish-analysis-test-radio-change"

	return {
		RadioGroup: ({
			onValueChange,
			children,
		}: {
			onValueChange: (value: string) => void
			children?: ReactNode
		}) => {
			React.useEffect(() => {
				const handler = (event: Event) => {
					onValueChange((event as CustomEvent<string>).detail)
				}
				window.addEventListener(eventName, handler)
				return () => window.removeEventListener(eventName, handler)
			}, [onValueChange])

			return <div>{children}</div>
		},
		RadioGroupItem: ({ value }: { value: string }) => (
			<button
				type="button"
				aria-label={value}
				onClick={() => {
					window.dispatchEvent(new CustomEvent(eventName, { detail: value }))
				}}
			/>
		),
	}
})

vi.mock("@/pages/superMagic/components/MessageEditor/components/ModelSwitch", () => ({
	default: ({
		selectedModel,
		onModelChange,
		showSelectedModelName,
		className,
	}: {
		selectedModel: typeof DEFAULT_MODEL | null
		onModelChange: (model: typeof DEFAULT_MODEL | null) => void
		showSelectedModelName?: boolean
		className?: string
	}) => (
		<div data-testid="pre-publish-analysis-model-switch" className={className}>
			{showSelectedModelName && selectedModel ? (
				<span>
					<img src={selectedModel.model_icon} alt={selectedModel.model_name} />
					{selectedModel.model_name}
				</span>
			) : null}
			<button type="button" onClick={() => onModelChange(ALT_MODEL)}>
				choose-alt-model
			</button>
		</div>
	),
}))

describe("PrePublishAnalysisDialog", () => {
	it("selects the first available model by default when no selected model is provided", () => {
		const onOpenChange = vi.fn()
		const onConfirm = vi.fn()

		render(
			<PrePublishAnalysisDialog
				open
				onOpenChange={onOpenChange}
				onConfirm={onConfirm}
				modelList={[
					{
						group: { id: "group-1", name: "Models" },
						models: [DISABLED_MODEL, DEFAULT_MODEL, ALT_MODEL],
					},
				]}
				selectedModel={null}
			/>,
		)

		expect(screen.getByTestId("pre-publish-analysis-model-switch")).toHaveTextContent("GPT-5")
		expect(screen.getByAltText("GPT-5")).toHaveAttribute("src", DEFAULT_MODEL.model_icon)
		expect(screen.getByTestId("pre-publish-analysis-model-switch")).toHaveClass(
			"rounded-[18px]",
		)
		fireEvent.click(screen.getByTestId("pre-publish-analysis-confirm"))
		expect(onConfirm).toHaveBeenCalledWith("ip-growth", DEFAULT_MODEL)
	})

	it("confirms only after a goal is selected and cancel does not confirm", () => {
		const onOpenChange = vi.fn()
		const onConfirm = vi.fn()

		render(
			<PrePublishAnalysisDialog
				open
				onOpenChange={onOpenChange}
				onConfirm={onConfirm}
				modelList={[
					{
						group: { id: "group-1", name: "Models" },
						models: [DEFAULT_MODEL, ALT_MODEL],
					},
				]}
				selectedModel={DEFAULT_MODEL}
			/>,
		)

		fireEvent.click(screen.getByText("detail.selfMedia.analysis.cancel"))
		expect(onOpenChange).toHaveBeenCalledWith(false)
		expect(onConfirm).not.toHaveBeenCalled()

		expect(screen.getByTestId("pre-publish-analysis-model-switch")).toHaveTextContent("GPT-5")
		fireEvent.click(screen.getByText("choose-alt-model"))
		fireEvent.click(screen.getByText("detail.selfMedia.analysis.goals.conversion"))
		fireEvent.click(screen.getByTestId("pre-publish-analysis-confirm"))
		expect(onConfirm).toHaveBeenCalledWith("conversion", ALT_MODEL)
	})
})
