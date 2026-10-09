const owners = new Set<symbol>()
const listeners = new Set<() => void>()

export const isMobilePresentationLayoutLocked = () => owners.size > 0

export function subscribeMobilePresentationLayout(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

/** Keep every responsive ancestor on the mobile tree while a PPT is presenting. */
export function retainMobilePresentationLayout() {
	const owner = Symbol("mobile-presentation")
	owners.add(owner)
	listeners.forEach((listener) => listener())
	return () => {
		if (!owners.delete(owner)) return
		listeners.forEach((listener) => listener())
	}
}
