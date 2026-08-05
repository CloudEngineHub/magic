import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { AppRootStore } from "./store/root-store"

const AppStoreContext = createContext<AppRootStore | null>(null)

interface AppStoreProviderProps {
	children: ReactNode
}

export function AppStoreProvider({ children }: AppStoreProviderProps) {
	const [store] = useState(() => new AppRootStore())

	useEffect(() => {
		return () => {
			store.dispose()
		}
	}, [store])

	return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>
}

export function useAppStore(): AppRootStore {
	const store = useContext(AppStoreContext)
	if (!store) throw new Error("useAppStore must be used within <AppStoreProvider>")
	return store
}
