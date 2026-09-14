interface SlidePathLike {
	path: string
}

function normalizePath(path: string): string {
	const normalized: string[] = []
	for (const segment of path.replace(/\\/g, "/").split("/")) {
		if (!segment || segment === ".") continue
		if (segment === "..") normalized.pop()
		else normalized.push(segment)
	}
	return normalized.join("/")
}

/** Finds a target slide from a relative project file link. */
export function findPPTSlideIndex(
	slides: readonly SlidePathLike[],
	currentSlidePath: string,
	href: string,
): number {
	const trimmedHref = href.trim()
	if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(trimmedHref)) return -1
	const rawPath = trimmedHref.split(/[?#]/, 1)[0]
	if (!rawPath) return -1

	const currentPath = normalizePath(currentSlidePath)
	const currentFolder = currentPath.includes("/")
		? currentPath.slice(0, currentPath.lastIndexOf("/") + 1)
		: ""
	const candidates = new Set([
		normalizePath(rawPath),
		normalizePath(`${currentFolder}${rawPath}`),
	])
	return slides.findIndex((slide) => candidates.has(normalizePath(slide.path)))
}
