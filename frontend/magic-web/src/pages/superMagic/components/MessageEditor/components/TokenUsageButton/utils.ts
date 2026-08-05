export function formatTokenCount(count: number): string {
	const roundedThousands = Math.round(count / 1_000)

	if (roundedThousands >= 1_000) {
		const millions = Math.round((count / 1_000_000) * 10) / 10
		return `${millions}M`
	}

	if (count >= 1_000) return `${roundedThousands}K`
	return String(count)
}
