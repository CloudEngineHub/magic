import {
	createContext,
	useContext,
	useLayoutEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
	type ReactNode,
} from "react"
import type { ElementBottomToolbarItem, ElementBottomToolbarSection } from "./ElementBottomToolbar"

export interface ElementBottomToolbarRegistration extends ElementBottomToolbarSection {
	elementId: string
}

interface ElementBottomToolbarContextValue {
	registry: ElementBottomToolbarRegistry
}

const ElementBottomToolbarContext = createContext<ElementBottomToolbarContextValue | null>(null)

class ElementBottomToolbarRegistry {
	private readonly listeners = new Set<() => void>()
	private readonly sectionsByElementId = new Map<
		string,
		Map<string, ElementBottomToolbarRegistration>
	>()
	private revision = 0

	public set(registration: ElementBottomToolbarRegistration): void {
		const sections = this.sectionsByElementId.get(registration.elementId) ?? new Map()
		if (sections.get(registration.id) === registration) return
		sections.set(registration.id, registration)
		this.sectionsByElementId.set(registration.elementId, sections)
		this.notify()
	}

	public remove(elementId: string, sectionId: string): void {
		const sections = this.sectionsByElementId.get(elementId)
		if (!sections?.delete(sectionId)) return
		if (sections.size === 0) this.sectionsByElementId.delete(elementId)
		this.notify()
	}

	public getSections(elementId: string | null): ElementBottomToolbarSection[] {
		if (!elementId) return []
		return [...(this.sectionsByElementId.get(elementId)?.values() ?? [])].sort(
			(left, right) => (left.order ?? 0) - (right.order ?? 0),
		)
	}

	public subscribe = (listener: () => void) => {
		this.listeners.add(listener)
		return () => this.listeners.delete(listener)
	}

	public getSnapshot = () => this.revision

	private notify(): void {
		this.revision += 1
		this.listeners.forEach((listener) => listener())
	}
}

export function ElementBottomToolbarProvider({ children }: { children: ReactNode }) {
	const value = useMemo(() => ({ registry: new ElementBottomToolbarRegistry() }), [])

	return (
		<ElementBottomToolbarContext.Provider value={value}>
			{children}
		</ElementBottomToolbarContext.Provider>
	)
}

function useElementBottomToolbarContext() {
	const context = useContext(ElementBottomToolbarContext)
	if (!context) {
		throw new Error(
			"useElementBottomToolbarSection must be used within ElementBottomToolbarProvider",
		)
	}
	return context
}

export function useElementBottomToolbarSection(
	registration: (ElementBottomToolbarRegistration & { visible?: boolean }) | null,
) {
	const { registry } = useElementBottomToolbarContext()
	const registrationRef = useRef(registration)
	registrationRef.current = registration
	const elementId = registration?.elementId
	const sectionId = registration?.id

	useLayoutEffect(() => {
		const current = registrationRef.current
		if (!current || current.visible === false) {
			if (elementId && sectionId) registry.remove(elementId, sectionId)
			return
		}
		registry.set(current)
	}, [elementId, registration, registry, sectionId])

	useLayoutEffect(() => {
		if (!elementId || !sectionId) return
		return () => registry.remove(elementId, sectionId)
	}, [elementId, registry, sectionId])
}

export function useElementBottomToolbarSections(elementId: string | null) {
	const { registry } = useElementBottomToolbarContext()
	useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot)
	return registry.getSections(elementId)
}

export type ElementBottomToolbarSectionItem = ElementBottomToolbarItem
