import { createContext, useContext, type ReactNode } from "react"
import type { RecordingDetailCapabilities } from "../../types/recording-detail-capabilities"

const RecordingDetailContext = createContext<RecordingDetailCapabilities | null>(null)

interface RecordingDetailProviderProps {
	capabilities: RecordingDetailCapabilities
	children: ReactNode
}

/** Injects owner/share capability matrix into the recording detail workbench subtree. */
export function RecordingDetailProvider({ capabilities, children }: RecordingDetailProviderProps) {
	return (
		<RecordingDetailContext.Provider value={capabilities}>
			{children}
		</RecordingDetailContext.Provider>
	)
}

/** Reads the active recording detail capability matrix from context. */
export function useRecordingDetailCapabilities(): RecordingDetailCapabilities {
	const value = useContext(RecordingDetailContext)
	if (!value) {
		throw new Error(
			"useRecordingDetailCapabilities must be used within RecordingDetailProvider",
		)
	}
	return value
}

/** Safe variant for optional capability reads in shared renderers. */
export function useOptionalRecordingDetailCapabilities(): RecordingDetailCapabilities | null {
	return useContext(RecordingDetailContext)
}
