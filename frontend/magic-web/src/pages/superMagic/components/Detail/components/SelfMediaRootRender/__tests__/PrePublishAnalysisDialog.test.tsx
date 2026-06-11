import { fireEvent, render, screen } from "@testing-library/react"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { PrePublishAnalysisDialog } from "../components/PrePublishAnalysisDialog"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	initReactI18next: {
		type: "3rdParty",
		init: () => {},
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

describe("PrePublishAnalysisDialog", () => {
	it("confirms only after a goal is selected and cancel does not confirm", () => {
		const onOpenChange = vi.fn()
		const onConfirm = vi.fn()

		render(<PrePublishAnalysisDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} />)

		fireEvent.click(screen.getByText("detail.selfMedia.analysis.cancel"))
		expect(onOpenChange).toHaveBeenCalledWith(false)
		expect(onConfirm).not.toHaveBeenCalled()

		fireEvent.click(screen.getByText("detail.selfMedia.analysis.goals.conversion"))
		fireEvent.click(screen.getByTestId("pre-publish-analysis-confirm"))
		expect(onConfirm).toHaveBeenCalledWith("conversion")
	})
})
