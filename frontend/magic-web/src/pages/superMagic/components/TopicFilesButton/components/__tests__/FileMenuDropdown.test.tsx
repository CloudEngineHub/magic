import { act, render } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import FileMenuDropdown from "../FileMenuDropdown"

const fileMenuItemsSpy = vi.fn(() => [])

vi.mock("../hooks/useFileMenuItems", () => ({
	default: (options: Record<string, unknown>) => fileMenuItemsSpy(options),
}))

vi.mock("@/components/base/MagicDropdown", () => ({
	default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("ahooks", () => ({
	useMemoizedFn: (fn: (...args: unknown[]) => unknown) => fn,
}))

describe("FileMenuDropdown", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		fileMenuItemsSpy.mockClear()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("forwards self-media and AI card actions after the dropdown closes", () => {
		const onAddSelfMedia = vi.fn()
		const onAddAICard = vi.fn()

		render(
			<FileMenuDropdown onAddSelfMedia={onAddSelfMedia} onAddAICard={onAddAICard}>
				<button type="button">add</button>
			</FileMenuDropdown>,
		)

		const menuOptions = fileMenuItemsSpy.mock.lastCall?.[0] as {
			onAddSelfMedia?: () => void
			onAddAICard?: () => void
		}

		act(() => {
			menuOptions.onAddSelfMedia?.()
			menuOptions.onAddAICard?.()
			vi.advanceTimersByTime(100)
		})

		expect(onAddSelfMedia).toHaveBeenCalledTimes(1)
		expect(onAddAICard).toHaveBeenCalledTimes(1)
	})

	it("does not render project entries without matching callbacks", () => {
		render(
			<FileMenuDropdown>
				<button type="button">add</button>
			</FileMenuDropdown>,
		)

		const menuOptions = fileMenuItemsSpy.mock.lastCall?.[0] as {
			onAddSelfMedia?: () => void
			onAddAICard?: () => void
		}

		expect(menuOptions.onAddSelfMedia).toBeUndefined()
		expect(menuOptions.onAddAICard).toBeUndefined()
	})
})
