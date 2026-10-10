import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { inboxStore } from "./store"

/** Prefetch counts for the sidebar badge, and reload templates when the UI language changes. */
export function useInboxBootstrap() {
	const { i18n } = useTranslation()

	useEffect(() => {
		void inboxStore.loadCounts()
	}, [])

	useEffect(() => {
		void inboxStore.loadTemplates(i18n.language)
	}, [i18n.language])
}
