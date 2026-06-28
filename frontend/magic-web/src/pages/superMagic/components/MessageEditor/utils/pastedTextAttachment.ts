export const LONG_PLAIN_TEXT_PASTE_THRESHOLD = 4000
const MAGIC_CLIPBOARD_TYPES = new Set([
	"text/x-magic-message-rich-text",
	"text/x-magic-message-mentions",
])

interface ClipboardDataLike {
	files: FileList | File[]
	types?: readonly string[] | DOMStringList
	getData: (format: string) => string
}

interface CreatePastedTextFileOptions {
	text: string
	now?: Date
}

export function shouldConvertPastedTextToAttachment(
	clipboardData: ClipboardDataLike,
	threshold = LONG_PLAIN_TEXT_PASTE_THRESHOLD,
): boolean {
	if (clipboardData.files.length > 0) return false

	const text = clipboardData.getData("text/plain")
	if (text.trim().length < threshold) return false

	const types = getClipboardTypes(clipboardData.types)
	if (types.length === 0) return true
	if (!types.includes("text/plain")) return false
	if (hasMagicClipboardData({ clipboardData, types })) return false

	return true
}

export function createPastedTextFile({ text, now = new Date() }: CreatePastedTextFileOptions) {
	return new File([text], `pasted-text-${formatTimestamp(now)}.txt`, {
		type: "text/plain;charset=utf-8",
		lastModified: now.getTime(),
	})
}

function getClipboardTypes(types?: readonly string[] | DOMStringList): string[] {
	if (!types) return []
	return Array.from(types)
}

function hasMagicClipboardData({
	clipboardData,
	types,
}: {
	clipboardData: ClipboardDataLike
	types: string[]
}): boolean {
	if (types.some((type) => MAGIC_CLIPBOARD_TYPES.has(type))) return true

	const html = clipboardData.getData("text/html")
	return html.includes("data-magic-clipboard")
}

function formatTimestamp(date: Date): string {
	const year = date.getFullYear()
	const month = padDatePart(date.getMonth() + 1)
	const day = padDatePart(date.getDate())
	const hour = padDatePart(date.getHours())
	const minute = padDatePart(date.getMinutes())
	const second = padDatePart(date.getSeconds())

	return `${year}${month}${day}-${hour}${minute}${second}`
}

function padDatePart(value: number): string {
	return value.toString().padStart(2, "0")
}
