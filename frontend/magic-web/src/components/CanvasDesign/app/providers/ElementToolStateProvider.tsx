import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import type { ElementToolType } from "../../public/props"
import { useCanvasEvent } from "../hooks/canvas/useCanvasEvent"

type ElementToolStateRecord = Partial<Record<ElementToolType, unknown>>
type ElementToolStateStore = Record<string, ElementToolStateRecord>

interface ElementToolStateContextValue {
	getElementToolState: <T>(elementId: string, toolType: ElementToolType) => T | undefined
	setElementToolState: <T>(elementId: string, toolType: ElementToolType, state: T) => void
	clearElementToolState: (elementId: string, toolType: ElementToolType) => void
	clearElementToolStates: (elementId: string) => void
	clearAllElementToolStates: () => void
}

interface ElementToolStateProviderProps {
	children: ReactNode
}

const ElementToolStateContext = createContext<ElementToolStateContextValue | undefined>(undefined)

export function ElementToolStateProvider({ children }: ElementToolStateProviderProps) {
	const [store, setStore] = useState<ElementToolStateStore>({})

	const getElementToolState = useCallback(
		<T,>(elementId: string, toolType: ElementToolType): T | undefined => {
			return store[elementId]?.[toolType] as T | undefined
		},
		[store],
	)

	const setElementToolState = useCallback(
		<T,>(elementId: string, toolType: ElementToolType, state: T) => {
			if (!elementId) return
			setStore((prev) => ({
				...prev,
				[elementId]: {
					...prev[elementId],
					[toolType]: state,
				},
			}))
		},
		[],
	)

	const clearElementToolState = useCallback((elementId: string, toolType: ElementToolType) => {
		if (!elementId) return
		setStore((prev) => {
			const elementStates = prev[elementId]
			if (!elementStates || !(toolType in elementStates)) return prev

			const nextElementStates = { ...elementStates }
			delete nextElementStates[toolType]

			const next = { ...prev }
			if (Object.keys(nextElementStates).length === 0) {
				delete next[elementId]
				return next
			}

			next[elementId] = nextElementStates
			return next
		})
	}, [])

	const clearElementToolStates = useCallback((elementId: string) => {
		if (!elementId) return
		setStore((prev) => {
			if (!prev[elementId]) return prev
			const next = { ...prev }
			delete next[elementId]
			return next
		})
	}, [])

	const clearAllElementToolStates = useCallback(() => {
		setStore({})
	}, [])

	useCanvasEvent(
		"element:deleted",
		({ data }) => {
			clearElementToolStates(data.elementId)
		},
		[clearElementToolStates],
	)

	useCanvasEvent("document:loaded", clearAllElementToolStates, [clearAllElementToolStates])

	const value = useMemo<ElementToolStateContextValue>(
		() => ({
			getElementToolState,
			setElementToolState,
			clearElementToolState,
			clearElementToolStates,
			clearAllElementToolStates,
		}),
		[
			clearAllElementToolStates,
			clearElementToolState,
			clearElementToolStates,
			getElementToolState,
			setElementToolState,
		],
	)

	return (
		<ElementToolStateContext.Provider value={value}>
			{children}
		</ElementToolStateContext.Provider>
	)
}

export function useElementToolState<T>(
	elementId: string | null | undefined,
	toolType: ElementToolType,
) {
	const context = useContext(ElementToolStateContext)
	if (context === undefined) {
		throw new Error("useElementToolState must be used within an ElementToolStateProvider")
	}

	const state = elementId ? context.getElementToolState<T>(elementId, toolType) : undefined

	const setState = useCallback(
		(nextState: T) => {
			if (!elementId) return
			context.setElementToolState(elementId, toolType, nextState)
		},
		[context, elementId, toolType],
	)

	const clearState = useCallback(() => {
		if (!elementId) return
		context.clearElementToolState(elementId, toolType)
	}, [context, elementId, toolType])

	return {
		state,
		setState,
		clearState,
	}
}
