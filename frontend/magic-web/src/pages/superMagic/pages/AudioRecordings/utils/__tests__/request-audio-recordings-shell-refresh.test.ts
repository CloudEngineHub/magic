import { beforeEach, describe, expect, it, vi } from "vitest"

import {
	registerAudioRecordingsShellRefreshHandler,
	requestAudioRecordingsShellRefresh,
} from "../request-audio-recordings-shell-refresh"

describe("requestAudioRecordingsShellRefresh", () => {
	beforeEach(() => {
		registerAudioRecordingsShellRefreshHandler(() => undefined)()
	})

	it("invokes the active shell refresh handler when registered", async () => {
		const refreshHandler = vi.fn()
		const unregister = registerAudioRecordingsShellRefreshHandler(refreshHandler)

		requestAudioRecordingsShellRefresh()

		expect(refreshHandler).toHaveBeenCalledTimes(1)

		unregister()
		requestAudioRecordingsShellRefresh()

		expect(refreshHandler).toHaveBeenCalledTimes(1)
	})
})
