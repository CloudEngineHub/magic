import { fireEvent, render, screen } from "@testing-library/react"
import { useState, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import TopicTypeFilter from ".."
import { toggleTopicType, type TopicTypeFilterValue } from "../../../utils/topicTypeFilter"

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
// Use an accessible adapter: Radix positioning/focus is covered by shared primitive tests.
vi.mock("@/components/shadcn-ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
	DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DropdownMenuCheckboxItem: ({
		children,
		checked,
		onCheckedChange,
	}: {
		children: ReactNode
		checked: boolean
		onCheckedChange: () => void
	}) => (
		<button role="menuitemcheckbox" aria-checked={checked} onClick={onCheckedChange}>
			{children}
		</button>
	),
}))
function Harness() {
	const [value, onChange] = useState<TopicTypeFilterValue>("all")
	return <TopicTypeFilter value={value} onChange={onChange} />
}
describe("TopicTypeFilter", () => {
	it("normalizes selected types and clearing the final type to all", () => {
		expect(toggleTopicType("all", "topic")).toBe("scheduled_task")
		expect(toggleTopicType("topic", "scheduled_task")).toBe("all")
		expect(toggleTopicType("scheduled_task", "scheduled_task")).toBe("all")
		expect(toggleTopicType("scheduled_task", "all")).toBe("all")
	})
	it("updates all three checkbox states when changing categories", async () => {
		vi.useRealTimers()
		render(<Harness />)
		const topic = await screen.findByRole("menuitemcheckbox", { name: "topicTypeFilter.topic" })
		fireEvent.click(topic)
		expect(
			screen.getByRole("menuitemcheckbox", { name: "topicTypeFilter.scheduledTask" }),
		).toHaveAttribute("aria-checked", "true")
		expect(topic).toHaveAttribute("aria-checked", "false")
		fireEvent.click(topic)
		expect(
			screen.getByRole("menuitemcheckbox", { name: "topicTypeFilter.all" }),
		).toHaveAttribute("aria-checked", "true")
	})
})
