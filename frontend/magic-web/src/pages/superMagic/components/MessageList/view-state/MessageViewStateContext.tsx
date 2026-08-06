import {
	createContext,
	type Dispatch,
	type PropsWithChildren,
	type SetStateAction,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react"

const MAX_VIEW_STATE_ENTRIES = 10_000

class MessageViewStateRegistry {
	private values = new Map<string, unknown>()
	private listeners = new Map<string, Set<() => void>>()

	has(key: string) {
		return this.values.has(key)
	}

	get<T>(key: string): T | undefined {
		return this.values.get(key) as T | undefined
	}

	set<T>(key: string, value: T) {
		if (this.values.has(key) && Object.is(this.values.get(key), value)) return
		if (!this.values.has(key) && this.values.size >= MAX_VIEW_STATE_ENTRIES) {
			const oldestKey = this.values.keys().next().value as string | undefined
			if (oldestKey) {
				this.values.delete(oldestKey)
				this.listeners.delete(oldestKey)
			}
		}
		this.values.set(key, value)
		this.listeners.get(key)?.forEach((listener) => listener())
	}

	subscribe(key: string, listener: () => void) {
		const listeners = this.listeners.get(key) || new Set<() => void>()
		listeners.add(listener)
		this.listeners.set(key, listeners)
		return () => {
			listeners.delete(listener)
			if (listeners.size === 0) this.listeners.delete(key)
		}
	}
}

interface MessageViewStateProviderValue {
	registry: MessageViewStateRegistry
	topicKey: string
}

interface MessageViewStateScopeValue extends MessageViewStateProviderValue {
	messageKey: string
}

const ProviderContext = createContext<MessageViewStateProviderValue | null>(null)
const ScopeContext = createContext<MessageViewStateScopeValue | null>(null)

export function MessageViewStateProvider({
	topicKey,
	children,
}: PropsWithChildren<{ topicKey: string }>) {
	const registryRef = useRef<MessageViewStateRegistry | null>(null)
	if (!registryRef.current) registryRef.current = new MessageViewStateRegistry()
	const value = useMemo(
		() => ({ registry: registryRef.current as MessageViewStateRegistry, topicKey }),
		[topicKey],
	)

	return <ProviderContext.Provider value={value}>{children}</ProviderContext.Provider>
}

export function MessageViewStateScopeProvider({
	messageKey,
	children,
}: PropsWithChildren<{ messageKey: string }>) {
	const provider = useContext(ProviderContext)
	const value = useMemo(
		() => (provider ? { ...provider, messageKey } : null),
		[messageKey, provider],
	)
	if (!value) return children

	return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
}

/**
 * Persists only semantic user choices across virtual row lifecycles. Components rendered outside
 * MessageList keep normal local state so isolated stories and tests do not share global values.
 */
export function useMessageViewState<T>(
	controlKey: string,
	initialValue: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
	const scope = useContext(ScopeContext)
	const [localValue, setLocalValue] = useState(initialValue)
	const initialValueRef = useRef(localValue)
	const stateKey = scope ? `${scope.topicKey}\u0000${scope.messageKey}\u0000${controlKey}` : ""

	const subscribe = useCallback(
		(listener: () => void) =>
			scope ? scope.registry.subscribe(stateKey, listener) : () => undefined,
		[scope, stateKey],
	)
	const getSnapshot = useCallback(() => {
		if (!scope || !scope.registry.has(stateKey)) return initialValueRef.current
		return scope.registry.get<T>(stateKey) as T
	}, [scope, stateKey])
	const persistedValue = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

	const setValue = useCallback<Dispatch<SetStateAction<T>>>(
		(nextValue) => {
			if (!scope) {
				setLocalValue(nextValue)
				return
			}
			const currentValue = scope.registry.has(stateKey)
				? (scope.registry.get<T>(stateKey) as T)
				: initialValueRef.current
			const resolvedValue =
				typeof nextValue === "function"
					? (nextValue as (previousValue: T) => T)(currentValue)
					: nextValue
			scope.registry.set(stateKey, resolvedValue)
		},
		[scope, stateKey],
	)

	return scope ? [persistedValue, setValue] : [localValue, setValue]
}
