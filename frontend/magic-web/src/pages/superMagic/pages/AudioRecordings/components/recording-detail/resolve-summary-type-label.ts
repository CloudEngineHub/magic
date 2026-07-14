import i18next from "i18next"

/** Resolves summary tab labels via literal i18n keys so locale tooling can statically discover every entry. */
export function resolveSummaryTypeLabel(type: string) {
	if (type === "summary") return i18next.t("detail.tabs.summary", { ns: "audioRecordings" })
	if (type === "topics") return i18next.t("detail.tabs.topics", { ns: "audioRecordings" })
	if (type === "highlights") return i18next.t("detail.tabs.highlights", { ns: "audioRecordings" })
	if (type === "insights") return i18next.t("detail.tabs.insights", { ns: "audioRecordings" })
	if (type === "metrics") return i18next.t("detail.tabs.metrics", { ns: "audioRecordings" })
	if (type === "mindmap") return i18next.t("detail.tabs.mindmap", { ns: "audioRecordings" })
	if (type === "followup") return i18next.t("detail.tabs.followup", { ns: "audioRecordings" })
	if (type === "power_dynamics")
		return i18next.t("detail.tabs.powerDynamics", { ns: "audioRecordings" })
	if (type === "intent") return i18next.t("detail.tabs.intent", { ns: "audioRecordings" })
	return type
}
