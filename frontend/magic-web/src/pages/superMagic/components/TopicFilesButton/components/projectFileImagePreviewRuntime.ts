type PreviewVisibilityListener = (visible: boolean) => void

const PREVIEW_VISIBILITY_ROOT_MARGIN = "320px 0px"

const previewVisibilityListeners = new Map<Element, PreviewVisibilityListener>()
let sharedPreviewIntersectionObserver: IntersectionObserver | null = null

function getSharedPreviewIntersectionObserver(): IntersectionObserver | null {
	if (typeof IntersectionObserver === "undefined") return null
	if (sharedPreviewIntersectionObserver) return sharedPreviewIntersectionObserver

	sharedPreviewIntersectionObserver = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				previewVisibilityListeners.get(entry.target)?.(entry.isIntersecting)
			}
		},
		{ rootMargin: PREVIEW_VISIBILITY_ROOT_MARGIN },
	)

	return sharedPreviewIntersectionObserver
}

export function observeProjectFileImagePreviewVisibility(
	element: Element,
	listener: PreviewVisibilityListener,
): () => void {
	const observer = getSharedPreviewIntersectionObserver()
	if (!observer) {
		listener(true)
		return () => listener(false)
	}

	previewVisibilityListeners.set(element, listener)
	observer.observe(element)

	return () => {
		observer.unobserve(element)
		previewVisibilityListeners.delete(element)
	}
}

export function __resetProjectFileImagePreviewRuntimeForTests() {
	sharedPreviewIntersectionObserver?.disconnect()
	sharedPreviewIntersectionObserver = null
	previewVisibilityListeners.clear()
}
