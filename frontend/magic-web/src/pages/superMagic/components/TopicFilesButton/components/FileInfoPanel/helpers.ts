export function translateValue(t: (key: string) => string, value: string) {
	return value.startsWith("topicFiles.fileInfo.") ? t(value) : value
}
