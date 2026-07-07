import { describe, expect, it } from "vitest"
import { createRecordingShareUiConfig } from "../recordingShareUiConfig"

describe("createRecordingShareUiConfig", () => {
	it("hides the generic manage-share link from recording share success UI", () => {
		expect(createRecordingShareUiConfig()).toMatchObject({
			hideManageShareLinks: true,
		})
	})
})
