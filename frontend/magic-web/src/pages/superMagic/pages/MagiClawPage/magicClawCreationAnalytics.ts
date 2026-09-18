import { markPendingEntityCreation, takePendingEntityCreation } from "@/services/analytics"

/** The create API only returns the code; the playground later resolves real entity ids. */
export function markMagicClawCreationPending(clawCode?: string | null): Promise<void> {
	return markPendingEntityCreation({
		scene: "magic_claw",
		resourceCode: clawCode ?? "",
	})
}

/** Atomically consumes the cross-route hand-off after project/topic ids are available. */
export function takeMagicClawCreationPending(clawCode?: string | null): Promise<boolean> {
	return takePendingEntityCreation({
		scene: "magic_claw",
		resourceCode: clawCode ?? "",
	})
}
