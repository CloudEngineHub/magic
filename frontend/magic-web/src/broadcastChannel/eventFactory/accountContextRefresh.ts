/**
 * Refreshes the whole page after the active account context has changed.
 * Account-scoped pages hold data in multiple stores, so a full reload rebuilds them from the new token and organization.
 */
export function refreshAccountContextPage() {
	window.location.reload()
}
