import { Suspense } from "react"
import { observer } from "mobx-react-lite"
import { Outlet } from "react-router-dom"
import { FileAccessProvider } from "@/pages/superMagic/providers/FileAccessProvider"
import { isTopicTaskRunning } from "@/pages/superMagic/pages/Workspace/types"
import { PersonaResearchStoreProvider, usePersonaResearchStore } from "./context"
import ResearchStateView from "./components/ResearchStateView"
import { useResearchRealtime } from "./hooks/useResearchRealtime"

/**
 * Parent route of the AI research pages. The store lives here so moving between home,
 * studio and persona library keeps the conversation and parsed files in memory.
 */
const PersonaResearchShell = observer(function PersonaResearchShell() {
	const store = usePersonaResearchStore()
	const isStudyRunning = isTopicTaskRunning(store.selectedTopic) || store.isConversationGenerating
	useResearchRealtime(store, isStudyRunning)

	if (store.status === "error") {
		return <ResearchStateView status="error" onRetry={() => void store.bootstrap()} />
	}
	if (store.status !== "ready") {
		return <ResearchStateView status="loading" />
	}
	return (
		<Suspense fallback={<ResearchStateView status="loading" />}>
			<Outlet />
		</Suspense>
	)
})

export default function PersonaResearchLayout() {
	return (
		<FileAccessProvider>
			<PersonaResearchStoreProvider>
				<PersonaResearchShell />
			</PersonaResearchStoreProvider>
		</FileAccessProvider>
	)
}
