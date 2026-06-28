import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react"
import { CrewConversationStore } from "./store/root-store"

const CrewConversationStoreContext = createContext<CrewConversationStore | null>(null)

export function CrewConversationStoreProvider({
	code,
	children,
}: PropsWithChildren<{ code?: string }>) {
	const [store] = useState(() => new CrewConversationStore())

	useEffect(() => {
		void store.bootstrap(code)
		return () => {
			store.dispose()
		}
	}, [code, store])

	return (
		<CrewConversationStoreContext.Provider value={store}>
			{children}
		</CrewConversationStoreContext.Provider>
	)
}

export function useCrewConversationStore() {
	const store = useContext(CrewConversationStoreContext)
	if (!store) {
		throw new Error(
			"useCrewConversationStore must be used inside CrewConversationStoreProvider",
		)
	}
	return store
}
