import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import PublishedMicroAppAttachmentsPanel from "../PublishedMicroAppAttachmentsPanel"

const filesMocks = vi.hoisted(() => ({
	allowEdit: undefined as boolean | undefined,
}))

vi.mock("@/pages/superMagic/components/TopicFilesButton", () => ({
	default: function MockTopicFilesButton(props: { allowEdit?: boolean }) {
		filesMocks.allowEdit = props.allowEdit
		return <div data-testid="runtime-files" />
	},
}))

describe("PublishedMicroAppAttachmentsPanel", () => {
	it("lets the owner edit runtime project files", () => {
		render(
			<PublishedMicroAppAttachmentsPanel
				attachments={[]}
				projectId="runtime-1"
				setUserSelectDetail={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("published-micro-app-attachments-panel")).toBeInTheDocument()
		expect(filesMocks.allowEdit).toBe(true)
	})
})
