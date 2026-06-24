;(function initMagicPromptLocale(global) {
	if (global.MagicPromptLocale) return

	function resolveLocale(ctxOrLocale) {
		if (typeof ctxOrLocale === "string") return ctxOrLocale
		return ctxOrLocale?.i18n?.locale ?? ""
	}

	function isChinese(ctxOrLocale) {
		return String(resolveLocale(ctxOrLocale))
			.toLowerCase()
			.startsWith("zh")
	}

	function pickText(textMap, ctxOrLocale, fallbackKey = "en") {
		if (!textMap) return ""
		if (isChinese(ctxOrLocale)) {
			return textMap.zh ?? textMap[fallbackKey] ?? textMap.en ?? ""
		}
		return textMap[fallbackKey] ?? textMap.en ?? textMap.zh ?? ""
	}

	function getReferenceLabel(index, ctxOrLocale) {
		return isChinese(ctxOrLocale)
			? `参考图 ${index}`
			: `reference image ${index}`
	}

	function joinReferenceLabels(count, ctxOrLocale) {
		const labels = Array.from({ length: count }, (_, index) =>
			getReferenceLabel(index + 1, ctxOrLocale),
		)
		return isChinese(ctxOrLocale) ? labels.join("、") : labels.join(", ")
	}

	global.MagicPromptLocale = {
		resolveLocale,
		isChinese,
		pickText,
		getReferenceLabel,
		joinReferenceLabels,
	}
})(window)