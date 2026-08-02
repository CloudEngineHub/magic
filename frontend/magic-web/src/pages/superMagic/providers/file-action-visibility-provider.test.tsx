import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
	FileActionVisibilityProvider,
	VIEWER_FILE_ACTIONS,
	useFileActionVisibility,
} from "./file-action-visibility-provider"

describe("VIEWER_FILE_ACTIONS", () => {
	it("keeps preview/download actions while hiding write and share actions", () => {
		const { result } = renderHook(() => useFileActionVisibility(), {
			wrapper: ({ children }) => (
				<FileActionVisibilityProvider value={VIEWER_FILE_ACTIONS}>
					{children}
				</FileActionVisibilityProvider>
			),
		})

		expect(result.current).toMatchObject({
			hideCopyTo: true,
			hideMoveTo: true,
			hideShareFile: true,
			hideShareTopic: true,
			hideCreateNewTopic: true,
			hideFullscreen: false,
		})
	})
})
