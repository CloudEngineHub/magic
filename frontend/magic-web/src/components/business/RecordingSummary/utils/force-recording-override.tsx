import { Mic, TriangleAlert } from "lucide-react"
import i18next from "i18next"
import MagicModal from "@/components/base/MagicModal"
import {
	RecordSummaryActionButton,
	RecordSummaryAlertIcon,
} from "../components/RecordSummaryAlertCard"

export type ForceRecordingSource = "currentTab" | "otherTab"
export type ForceRecordingStatus = "recording" | "paused"

export interface ForceRecordingOverrideContext {
	duration: string
	source: ForceRecordingSource
	status: ForceRecordingStatus
}

function renderDescriptionLines(lines: string[]) {
	return (
		<div className="space-y-1.5">
			{lines.map((line) => (
				<p key={line} className="m-0">
					{line}
				</p>
			))}
		</div>
	)
}

/** Opens the same explicit confirmation UI for both recording entry points. */
export function confirmForceRecordingOverride(
	context: ForceRecordingOverrideContext,
): Promise<boolean> {
	return new Promise((resolve) => {
		let settled = false
		const settle = (value: boolean) => {
			if (settled) return
			settled = true
			resolve(value)
		}

		const sourceLabel =
			context.source === "otherTab"
				? i18next.t("recordingSummary.forceOverride.sourceOtherTab", { ns: "super" })
				: i18next.t("recordingSummary.forceOverride.sourceCurrentTab", { ns: "super" })
		const statusLabel =
			context.status === "paused"
				? i18next.t("recordingSummary.forceOverride.statusPaused", { ns: "super" })
				: i18next.t("recordingSummary.forceOverride.statusRecording", { ns: "super" })
		const modalInstance = MagicModal.confirm({
			title: i18next.t("recordingSummary.forceOverride.title", { ns: "super" }),
			content: renderDescriptionLines([
				i18next.t("recordingSummary.forceOverride.description", { ns: "super" }),
				`${i18next.t("recordingSummary.forceOverride.source", { ns: "super" })}：${sourceLabel}`,
				`${i18next.t("recordingSummary.forceOverride.duration", { ns: "super" })}：${context.duration}`,
				`${i18next.t("recordingSummary.forceOverride.status", { ns: "super" })}：${statusLabel}`,
			]),
			closable: false,
			maskClosable: false,
			icon: (
				<RecordSummaryAlertIcon tone="danger">
					<TriangleAlert size={16} />
				</RecordSummaryAlertIcon>
			),
			footer: (
				<div className="flex items-center justify-end gap-2 border-t border-border bg-muted/60 p-4">
					<RecordSummaryActionButton
						appearance="secondary"
						onClick={() => {
							modalInstance.destroy()
							settle(false)
						}}
						data-testid="recording-force-override-cancel-button"
					>
						{i18next.t("recordingSummary.forceOverride.cancel", { ns: "super" })}
					</RecordSummaryActionButton>
					<RecordSummaryActionButton
						appearance="danger"
						onClick={() => {
							modalInstance.destroy()
							settle(true)
						}}
						data-testid="recording-force-override-confirm-button"
					>
						<Mic size={16} />
						{i18next.t("recordingSummary.forceOverride.confirm", { ns: "super" })}
					</RecordSummaryActionButton>
				</div>
			),
		})

		if (!modalInstance) settle(false)
	})
}

/** Keep retry explicit after a cross-tab timeout; never start optimistically. */
export function confirmForceRecordingRetry(): Promise<boolean> {
	return new Promise((resolve) => {
		let settled = false
		const settle = (value: boolean) => {
			if (settled) return
			settled = true
			resolve(value)
		}
		const modalInstance = MagicModal.confirm({
			title: i18next.t("recordingSummary.forceOverride.retryTitle", { ns: "super" }),
			content: i18next.t("recordingSummary.forceOverride.failed", { ns: "super" }),
			closable: false,
			maskClosable: false,
			icon: (
				<RecordSummaryAlertIcon tone="danger">
					<TriangleAlert size={16} />
				</RecordSummaryAlertIcon>
			),
			footer: (
				<div className="flex items-center justify-end gap-2 border-t border-border bg-muted/60 p-4">
					<RecordSummaryActionButton
						appearance="secondary"
						onClick={() => {
							modalInstance.destroy()
							settle(false)
						}}
						data-testid="recording-force-override-retry-cancel-button"
					>
						{i18next.t("recordingSummary.forceOverride.cancel", { ns: "super" })}
					</RecordSummaryActionButton>
					<RecordSummaryActionButton
						appearance="primary"
						onClick={() => {
							modalInstance.destroy()
							settle(true)
						}}
						data-testid="recording-force-override-retry-button"
					>
						{i18next.t("recordingSummary.forceOverride.retry", { ns: "super" })}
					</RecordSummaryActionButton>
				</div>
			),
		})

		if (!modalInstance) settle(false)
	})
}

/** Shared confirmation, retry, and failure-close flow for both entry points. */
export async function runForceRecordingOverride(
	context: ForceRecordingOverrideContext,
	prepare: () => Promise<boolean>,
): Promise<boolean> {
	if (!(await confirmForceRecordingOverride(context))) return false

	let shouldRetry = true
	while (shouldRetry) {
		let prepared = false
		try {
			prepared = await prepare()
		} catch {
			prepared = false
		}
		if (prepared) return true
		shouldRetry = await confirmForceRecordingRetry()
	}
	return false
}
