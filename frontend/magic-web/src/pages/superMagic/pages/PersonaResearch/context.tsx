import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react"
import { PersonaResearchStore } from "./store/research-store"

const PersonaResearchStoreContext = createContext<PersonaResearchStore | null>(null)

/** Owns one store for the research home, studio and persona library routes. */
export function PersonaResearchStoreProvider({ children }: PropsWithChildren) {
	const [store] = useState(() => new PersonaResearchStore())

	useEffect(() => {
		void store.bootstrap()
		return () => {
			store.dispose()
		}
	}, [store])

	return (
		<PersonaResearchStoreContext.Provider value={store}>
			{children}
		</PersonaResearchStoreContext.Provider>
	)
}

export function usePersonaResearchStore() {
	const store = useContext(PersonaResearchStoreContext)
	if (!store) {
		throw new Error("usePersonaResearchStore must be used inside PersonaResearchStoreProvider")
	}
	return store
}
