import { beforeEach, describe, expect, it, vi } from "vitest"

const pendingService = vi.hoisted(() => ({
	mark: vi.fn().mockResolvedValue(undefined),
	take: vi.fn().mockResolvedValue(true),
}))

vi.mock("@/services/analytics", () => ({
	markPendingEntityCreation: pendingService.mark,
	takePendingEntityCreation: pendingService.take,
}))

import {
	markMagicClawCreationPending,
	takeMagicClawCreationPending,
} from "../magicClawCreationAnalytics"

describe("magic claw creation analytics handoff", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("delegates the cross-route hand-off to the shared persistence service", async () => {
		await markMagicClawCreationPending(" MC-new ")
		await expect(takeMagicClawCreationPending("MC-new")).resolves.toBe(true)

		expect(pendingService.mark).toHaveBeenCalledWith({
			scene: "magic_claw",
			resourceCode: " MC-new ",
		})
		expect(pendingService.take).toHaveBeenCalledWith({
			scene: "magic_claw",
			resourceCode: "MC-new",
		})
	})
})
