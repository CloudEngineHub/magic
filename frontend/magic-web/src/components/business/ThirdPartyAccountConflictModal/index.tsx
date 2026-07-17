import { lazy, Suspense } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import AppearanceProvider from "@/providers/AppearanceProvider"
import { i18nStore } from "@/models/config/stores/i18n.store"
import type {
	RequestThirdPartyAccountConflictDecision,
	ThirdPartyAccountConflictDecision,
} from "@/services/app/types/thirdPartyAccountReconcile"

const ThirdPartyAccountConflictModal = lazy(() => import("./ThirdPartyAccountConflictModal"))

let activeDecisionPromise: Promise<ThirdPartyAccountConflictDecision> | null = null
let modalContainer: HTMLDivElement | null = null
let modalRoot: Root | null = null

function cleanupModal() {
	modalRoot?.unmount()
	modalRoot = null
	modalContainer?.remove()
	modalContainer = null
	activeDecisionPromise = null
}

/**
 * Expose the account conflict decision to the service as a Promise while only passing display-safe account data to the UI.
 */
export const showThirdPartyAccountConflictModal: RequestThirdPartyAccountConflictDecision = (
	context,
) => {
	if (activeDecisionPromise) return activeDecisionPromise

	modalContainer = document.createElement("div")
	modalContainer.dataset.testid = "third-party-account-conflict-modal-root"
	document.body.appendChild(modalContainer)
	modalRoot = createRoot(modalContainer)

	activeDecisionPromise = new Promise((resolve) => {
		const handleDecision = (decision: ThirdPartyAccountConflictDecision) => {
			resolve(decision)
			// Wait until the click event finishes before unmounting the Radix dialog tree.
			queueMicrotask(cleanupModal)
		}

		modalRoot?.render(
			<I18nextProvider i18n={i18nStore.i18n.instance}>
				<AppearanceProvider>
					<Suspense fallback={null}>
						<ThirdPartyAccountConflictModal {...context} onDecision={handleDecision} />
					</Suspense>
				</AppearanceProvider>
			</I18nextProvider>,
		)
	})

	return activeDecisionPromise
}
