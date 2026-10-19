import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import StudyTopics from "../components/StudyTopics"

const { store, navigate } = vi.hoisted(() => ({
	store: {
		isReadOnly: false,
		canChangeStudyTopics: true,
		isChangingStudyTopics: false,
		study: { topic_id: "main" },
		selectedTopic: { id: "main" },
		studyTopics: [{ id: "main", topic_name: "Study" }],
		createStudyTopic: vi.fn(),
		deleteStudyTopic: vi.fn(),
	},
	navigate: vi.fn(),
}))
vi.mock("../context", () => ({ usePersonaResearchStore: () => store }))
vi.mock("@/routes/hooks/useNavigate", () => ({ useNavigate: () => navigate }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@/components/base/MagicTooltip", () => ({
	default: ({ children }: { children: React.ReactNode }) => children,
}))

describe("study topics controls", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		store.isReadOnly = false
		store.canChangeStudyTopics = true
	})
	it("cancels a new topic without creating any relationship", () => {
		render(<StudyTopics />)
		fireEvent.click(screen.getByRole("button", { name: "topics.create" }))
		fireEvent.change(screen.getByLabelText("topics.name"), { target: { value: "Pricing" } })
		fireEvent.click(screen.getByRole("button", { name: "common.cancel" }))
		expect(store.createStudyTopic).not.toHaveBeenCalled()
	})
	it("opens the new conversation only after creation succeeds", async () => {
		store.createStudyTopic.mockResolvedValue({ id: "child" })
		render(<StudyTopics />)
		fireEvent.click(screen.getByRole("button", { name: "topics.create" }))
		fireEvent.change(screen.getByLabelText("topics.name"), { target: { value: "Pricing" } })
		const form = screen.getByLabelText("topics.name").closest("form")
		if (!form) throw new Error("missing topic form")
		fireEvent.submit(form)
		await waitFor(() =>
			expect(navigate).toHaveBeenCalledWith(
				expect.objectContaining({ params: { topicId: "child" } }),
			),
		)
		expect(store.createStudyTopic).toHaveBeenCalledWith("Pricing")
	})
	it("does not expose controls in a share", () => {
		store.isReadOnly = true
		render(<StudyTopics />)
		expect(screen.queryByRole("button", { name: "topics.create" })).toBeNull()
	})
})
