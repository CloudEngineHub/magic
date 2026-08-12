import { v4 as uuidv4 } from "uuid"
import type { Container } from "@/services/ServiceContainer"
import type { AccountService } from "@/services/user/AccountService"
import { userStore } from "@/models/user"
import { authEventBus } from "./AuthEventBus"
import { AuthEventName } from "./AuthEvents"
import type { AuthIntent, AuthSessionInvalidationRequest } from "./contracts"

class AuthSessionCoordinator {
	private readonly inFlight = new Map<string, Promise<void>>()
	private sessionGeneration = 0

	async invalidate({
		service,
		accountId,
		reason,
		source,
		returnTo,
	}: AuthSessionInvalidationRequest & { service: Container }): Promise<void> {
		const key = `${accountId ?? "current"}:${reason}`
		const existing = this.inFlight.get(key)
		if (existing) return existing

		const task = (async () => {
			this.sessionGeneration += 1
			const currentAccountId = userStore.user.userInfo?.magic_id
			const targetAccountId = accountId ?? currentAccountId
			await service.get<AccountService>("accountService").deleteAccount(targetAccountId)
			const remainingAccount = userStore.account.accounts[0]
			let fallbackRestored = false
			if (targetAccountId === currentAccountId && remainingAccount) {
				try {
					await service
						.get<AccountService>("accountService")
						.switchAccount(remainingAccount.magic_id, remainingAccount.organizationCode)
					fallbackRestored = true
				} catch {
					// A fallback account is only considered usable after its session is restored.
					// Failed restoration falls through to the single login-required path below.
				}
			}
			const event = {
				accountId,
				reason,
				source,
				eventId: uuidv4(),
				sessionGeneration: this.sessionGeneration,
			}
			authEventBus.emit(AuthEventName.SessionInvalidated, event)

			const intent: AuthIntent = {
				reason: reason === "missing-session" ? "missing-session" : "auth-expired",
				source,
				returnTo,
			}
			if (
				userStore.account.accounts.length === 0 ||
				!userStore.user.authorization ||
				(targetAccountId === currentAccountId && remainingAccount && !fallbackRestored)
			) {
				authEventBus.emit(AuthEventName.LoginRequired, { intent })
			}
		})()

		this.inFlight.set(key, task)
		try {
			await task
		} finally {
			this.inFlight.delete(key)
		}
	}
}

export const authSessionCoordinator = new AuthSessionCoordinator()
