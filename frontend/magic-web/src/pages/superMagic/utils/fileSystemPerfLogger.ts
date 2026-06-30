import {
	manualPerfLogger,
	measureManualPerfAsyncOperation,
	measureManualPerfOperation,
	type ManualPerfLog,
	type ManualPerfSummaryItem,
	type MetricDataFactory,
	type ManualPerfLogger,
} from "@/utils/manualPerfLogger"

export {
	collectFileTreeStats,
	createFileTreePerfScope,
	measureFileTreeOperation,
	type FileTreeLike,
	type FileTreeStats,
} from "./fileTreePerf"
export { measureAttachmentFetch, recordAttachmentResponseMetrics } from "./attachmentPerf"

export type FileSystemPerfLog = ManualPerfLog

export const fileSystemPerfLogger = manualPerfLogger

export function measureFileSystemOperation<T>(
	metric: string,
	callback: () => T,
	data?: MetricDataFactory<T>,
): T {
	return measureManualPerfOperation(metric, callback, data)
}

export function measureFileSystemAsyncOperation<T>(
	metric: string,
	callback: () => Promise<T>,
	data?: MetricDataFactory<T>,
): Promise<T> {
	return measureManualPerfAsyncOperation(metric, callback, data)
}

declare global {
	interface Window {
		fileSystemPerfLogger: ManualPerfLogger
		enableFileSystemPerfLogger: () => void
		disableFileSystemPerfLogger: () => void
		startFileSystemPerfSession: (data?: Record<string, unknown>) => void
		finishFileSystemPerfSession: (data?: Record<string, unknown>) => void
		getFileSystemPerfLogs: () => FileSystemPerfLog[]
		getFileSystemPerfSummary: () => ManualPerfSummaryItem[]
		exportFileSystemPerfLogs: () => ReturnType<ManualPerfLogger["exportLogs"]>
		clearFileSystemPerfLogs: () => void
		flushFileSystemPerfLogs: () => FileSystemPerfLog[] | undefined
	}
}

if (typeof window !== "undefined") {
	window.fileSystemPerfLogger = fileSystemPerfLogger
	window.enableFileSystemPerfLogger = () => fileSystemPerfLogger.enable()
	window.disableFileSystemPerfLogger = () => fileSystemPerfLogger.disable()
	window.startFileSystemPerfSession = (data) => fileSystemPerfLogger.startSession(data)
	window.finishFileSystemPerfSession = (data) => fileSystemPerfLogger.finishSession(data)
	window.getFileSystemPerfLogs = () => {
		console.table(fileSystemPerfLogger.getLogs())
		return fileSystemPerfLogger.getLogs()
	}
	window.getFileSystemPerfSummary = () => fileSystemPerfLogger.flushSummaryToConsole() || []
	window.exportFileSystemPerfLogs = () => fileSystemPerfLogger.exportLogs()
	window.clearFileSystemPerfLogs = () => fileSystemPerfLogger.clearLogs()
	window.flushFileSystemPerfLogs = () => fileSystemPerfLogger.flushToConsoleTable()
}
