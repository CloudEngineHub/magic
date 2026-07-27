const DATA_RAW_PREFIX = "--data-raw '"
const MIN_FORMATTABLE_DATA_RAW_LENGTH = 1_000

/**
 * Converts a long JSON curl payload into physical lines for the read-only
 * source preview. This avoids giving Monaco one model line that expands into
 * hundreds of virtual wrapped lines, while leaving the persisted Markdown
 * untouched.
 */
export function formatLongCurlDataRawForPreview(content: string): string {
	return content
		.split("\n")
		.map((line) => formatLongCurlDataRawLine(line))
		.join("\n")
}

function formatLongCurlDataRawLine(line: string): string {
	const prefixIndex = line.indexOf(DATA_RAW_PREFIX)
	if (prefixIndex === -1) return line

	const payloadStart = prefixIndex + DATA_RAW_PREFIX.length
	const payloadEnd = line.lastIndexOf("'")
	if (payloadEnd <= payloadStart) return line

	const payload = line.slice(payloadStart, payloadEnd)
	if (payload.length < MIN_FORMATTABLE_DATA_RAW_LENGTH) return line

	try {
		const formattedPayload = JSON.stringify(JSON.parse(payload), null, 2)
		return `${line.slice(0, payloadStart)}${formattedPayload}${line.slice(payloadEnd)}`
	} catch {
		// Only JSON request bodies can be safely formatted for display.
		return line
	}
}
