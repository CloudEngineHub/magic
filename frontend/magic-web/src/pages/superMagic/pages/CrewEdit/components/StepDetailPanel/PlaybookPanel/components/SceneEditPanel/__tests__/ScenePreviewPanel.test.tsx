import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { ScenePreviewPanel } from "../components/ScenePreviewPanel"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("../store", () => ({
	useSceneEditStore: () => ({
		presets: { id: "presets" },
		quickStart: undefined,
		inspiration: undefined,
	}),
}))

vi.mock("@/pages/superMagic/components/MainInputContainer/stores", () => ({
	SceneConfigStore: class SceneConfigStore {},
	SceneStateStore: class SceneStateStore {},
	SceneStateProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/pages/superMagic/components/MainInputContainer/components/ScenePanelContainer", () => ({
	default: () => <div data-testid="scene-panel-container" />,
}))

vi.mock("@/components/shadcn-ui/smooth-tabs", () => ({
	SmoothTabs: ({
		tabs,
		value,
		onChange,
	}: {
		tabs: Array<{ value: string; label: string; "data-testid": string }>
		value: string
		onChange: (value: "home" | "topic") => void
	}) => (
		<div>
			{tabs.map((tab) => (
				<button
					key={tab.value}
					type="button"
					data-testid={tab["data-testid"]}
					aria-pressed={value === tab.value}
					onClick={() => onChange(tab.value as "home" | "topic")}
				>
					{tab.label}
				</button>
			))}
		</div>
	),
}))

describe("ScenePreviewPanel", () => {
	it("collapses and expands the preview content without removing the scene tabs", () => {
		render(<ScenePreviewPanel />)

		const toggle = screen.getByTestId("scene-preview-toggle")
		const content = screen.getByTestId("scene-preview-content")
		const topicTab = screen.getByTestId("scene-preview-topic-tab")

		expect(toggle).toHaveAttribute("aria-expanded", "true")
		expect(content).toBeVisible()
		fireEvent.click(topicTab)
		expect(topicTab).toHaveAttribute("aria-pressed", "true")

		fireEvent.click(toggle)

		expect(toggle).toHaveAttribute("aria-expanded", "false")
		expect(content).not.toBeVisible()
		expect(screen.getByTestId("scene-preview-home-tab")).toBeVisible()
		expect(topicTab).toBeVisible()

		fireEvent.click(toggle)

		expect(toggle).toHaveAttribute("aria-expanded", "true")
		expect(content).toBeVisible()
		expect(topicTab).toHaveAttribute("aria-pressed", "true")
	})
})
