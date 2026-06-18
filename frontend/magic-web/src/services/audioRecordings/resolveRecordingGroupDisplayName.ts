/**
 * Resolves the user-visible recording group name.
 * Backend rows may return empty or whitespace-only names; callers supply the localized fallback.
 */
export function resolveRecordingGroupDisplayName(
	name: string | undefined | null,
	unnamedLabel: string,
): string {
	const trimmed = name?.trim() ?? ""
	return trimmed || unnamedLabel
}
