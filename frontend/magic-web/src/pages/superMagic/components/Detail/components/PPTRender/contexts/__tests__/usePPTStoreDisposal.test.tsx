import { StrictMode } from "react"
import { act, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { usePPTStoreDisposal } from "../usePPTStoreDisposal"

function LifecycleHarness({ dispose }: { dispose: () => void }) {
	usePPTStoreDisposal({ dispose })
	return null
}

describe("usePPTStoreDisposal", () => {
	it("survives StrictMode effect replay and disposes after the real unmount", async () => {
		const dispose = vi.fn()
		const view = render(
			<StrictMode>
				<LifecycleHarness dispose={dispose} />
			</StrictMode>,
		)

		await act(async () => Promise.resolve())
		expect(dispose).not.toHaveBeenCalled()

		view.unmount()
		await act(async () => Promise.resolve())
		expect(dispose).toHaveBeenCalledTimes(1)
	})
})
