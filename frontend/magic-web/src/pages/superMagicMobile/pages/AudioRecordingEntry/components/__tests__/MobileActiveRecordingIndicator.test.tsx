import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MobileActiveRecordingIndicator } from "../MobileActiveRecordingIndicator"

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => key,
		}),
	}
})

describe("MobileActiveRecordingIndicator duration display", () => {
	it("keeps compact mm:ss labels for sub-hour sessions", () => {
		render(
			<MobileActiveRecordingIndicator
				duration="00:15:30"
				isPaused={false}
				onOpen={vi.fn()}
			/>,
		)

		expect(screen.getByText("15:30")).toBeInTheDocument()
	})

	it("keeps compact HH:MM labels for hour-long sessions without changing the UI shell", () => {
		render(
			<MobileActiveRecordingIndicator
				duration="01:24:59"
				isPaused={false}
				onOpen={vi.fn()}
			/>,
		)

		expect(screen.getByText("01:24")).toBeInTheDocument()
		expect(screen.queryByText("01:24:59")).not.toBeInTheDocument()
	})
})
