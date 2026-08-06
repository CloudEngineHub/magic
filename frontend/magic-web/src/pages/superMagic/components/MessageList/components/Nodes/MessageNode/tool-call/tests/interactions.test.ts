import { beforeEach, describe, expect, it, vi } from "vitest"

import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { getToolDetailSelectionTarget } from "../../../toolDetailSelection"
import { handleToolCallInteraction } from "../interactions"

vi.mock("@/pages/superMagic/components/Detail/contents/Design/utils/toolDesignProjectInfo", () => ({
	getToolDesignProjectInfo: vi.fn(),
}))

describe("handleToolCallInteraction", () => {
	const publishSpy = vi.spyOn(pubsub, "publish")

	beforeEach(() => {
		publishSpy.mockClear()
	})

	it("marks source-file interactions as file navigation", () => {
		const onSelectDetail = vi.fn()

		handleToolCallInteraction({
			toolData: {
				id: "tool-file-1",
				name: "write_file",
				action: "write file",
				attachments: [],
				detail: {
					type: "code",
					data: { source_file_id: "file-1" },
				},
			},
			onSelectDetail,
		})

		expect(publishSpy).toHaveBeenCalledWith(PubSubEvents.Open_File_Tab, {
			fileId: "file-1",
		})
		expect(publishSpy).toHaveBeenCalledWith(PubSubEvents.Locate_File_In_Tree, "file-1")
		const selectedDetail = onSelectDetail.mock.calls[0][0]
		expect(selectedDetail).toEqual(
			expect.objectContaining({ id: "tool-file-1", isFromNode: true }),
		)
		expect(getToolDetailSelectionTarget(selectedDetail)).toBe("file")
	})

	it("marks ordinary tool interactions as detail previews", () => {
		const onSelectDetail = vi.fn()

		handleToolCallInteraction({
			toolData: {
				id: "tool-detail-1",
				name: "shell_exec",
				action: "run command",
				attachments: [],
				detail: {
					type: "shell",
					data: { command: "pwd" },
				},
			},
			onSelectDetail,
		})

		expect(publishSpy).toHaveBeenCalledWith(
			PubSubEvents.Open_Playback_Tab,
			expect.objectContaining({ id: "tool-detail-1" }),
		)
		const selectedDetail = onSelectDetail.mock.calls[0][0]
		expect(selectedDetail).toEqual(
			expect.objectContaining({ id: "tool-detail-1", isFromNode: true }),
		)
		expect(getToolDetailSelectionTarget(selectedDetail)).toBe("detail")
	})
})
