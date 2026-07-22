/** Shared employee-market card helpers (not UI). */

interface StoreAgentActionState {
	isAdded: boolean
	allowDelete: boolean
}

export function isOfficialPublisherType(publisherType: string): boolean {
	return publisherType === "OFFICIAL" || publisherType === "OFFICIAL_BUILTIN"
}

export function isOfficialBuiltinPublisherType(publisherType: string): boolean {
	return publisherType === "OFFICIAL_BUILTIN"
}

/**
 * The market only exposes `isAdded` and removal permission here. Those fields do not
 * identify the creator: an official agent can already exist for the user and still
 * be non-removable.
 */
function isNonRemovableAddedStoreAgent({ isAdded, allowDelete }: StoreAgentActionState): boolean {
	return isAdded && !allowDelete
}

/**
 * An already available, non-removable agent has no valid market action. Keep only
 * its conversation entry instead of rendering a disabled duplicate action.
 */
export function shouldHideEmployeeMarketPrimaryAction(
	employee: StoreAgentActionState & { publisherType: string },
): boolean {
	return (
		isOfficialBuiltinPublisherType(employee.publisherType) ||
		isNonRemovableAddedStoreAgent(employee)
	)
}

/** Label for hire/dismiss on store agent cards and market detail dialog. */
export function resolveEmployeeMarketPrimaryActionLabel(
	employee: StoreAgentActionState & { publisherType: string },
	t: (key: string) => string,
): string {
	if (isOfficialBuiltinPublisherType(employee.publisherType))
		return t("employeeCard.officialBuiltin")
	if (isNonRemovableAddedStoreAgent(employee)) return t("conversation")
	if (employee.allowDelete) return t("dismiss")
	return t("hire")
}

/** Prevent adding an agent that is already available locally or is built in. */
export function isEmployeeMarketPrimaryActionDisabled(
	employee: StoreAgentActionState & { publisherType: string },
): boolean {
	if (employee.allowDelete) return false
	return (
		isNonRemovableAddedStoreAgent(employee) ||
		isOfficialBuiltinPublisherType(employee.publisherType)
	)
}

/** Detail dialog only supports hire/dismiss; chat entry is handled by separate conversation actions. */
export function canShowEmployeeMarketDetailPrimaryAction(
	employee: StoreAgentActionState & { publisherType: string },
): boolean {
	if (employee.allowDelete) return true
	return !employee.isAdded && !isOfficialBuiltinPublisherType(employee.publisherType)
}

/** Label for market detail primary action: hire (not added) or dismiss (allowDelete). */
export function resolveEmployeeMarketDetailPrimaryActionLabel(
	employee: StoreAgentActionState,
	t: (key: string) => string,
): string {
	return employee.allowDelete ? t("dismiss") : t("hire")
}

export function resolvePublisherLabel(
	publisherType: string,
	publisherName: string | null | undefined,
	t: (key: string) => string,
): string {
	const normalizedPublisherName = publisherName?.trim()
	if (normalizedPublisherName && !isOfficialPublisherType(publisherType))
		return normalizedPublisherName

	switch (publisherType) {
		case "OFFICIAL":
			return t("skillsLibrary.official")
		case "OFFICIAL_BUILTIN":
			return t("employeeCard.officialBuiltin")
		case "USER":
			return t("employeeCard.publisherUser")
		case "VERIFIED_CREATOR":
			return t("employeeCard.publisherVerified")
		case "PARTNER":
			return t("employeeCard.publisherPartner")
		default:
			return t("employeeCard.publisherDefault")
	}
}

export function formatPublisherHandle(label: string): string {
	const s = label.trim()
	if (!s) return "@"
	const withoutAt = s.replace(/^@+/, "")
	return `@${withoutAt}`
}

export function formatVersionBadge(version: string | null | undefined): string | null {
	if (!version) return null
	const trimmed = version.trim()
	if (!trimmed) return null
	return trimmed
}
