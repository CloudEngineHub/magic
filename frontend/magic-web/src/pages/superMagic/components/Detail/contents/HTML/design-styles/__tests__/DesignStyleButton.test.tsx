import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import DesignStyleButton from "../DesignStyleButton"
import { designStyleFixture } from "./fixtures"

const { publish } = vi.hoisted(() => ({ publish: vi.fn() }))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/utils/pubsub", () => ({
	default: { publish },
	PubSubEvents: { Set_Input_Message: "Set_Input_Message" },
}))

vi.mock("../DesignStyleDialog", () => ({
	default: ({
		open,
		onApply,
		canApply,
	}: {
		open: boolean
		onApply: (style: unknown) => void
		canApply: boolean
	}) =>
		open ? (
			<button type="button" disabled={!canApply} onClick={() => onApply(designStyleFixture)}>
				apply
			</button>
		) : null,
}))

describe("DesignStyleButton", () => {
	it("publishes one file-scoped style request", () => {
		render(
			<DesignStyleButton
				fileInfo={{
					fileId: "file-1",
					fileName: "index.html",
					filePath: "pages/index.html",
				}}
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: "htmlEditor.designStyle.open" }))
		fireEvent.click(screen.getByRole("button", { name: "apply" }))

		expect(publish).toHaveBeenCalledTimes(1)
		expect(publish).toHaveBeenCalledWith(
			"Set_Input_Message",
			expect.objectContaining({ type: "doc" }),
		)
	})
})
