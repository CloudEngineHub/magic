import type { FileViewerTabType, TabItem } from "../types"
import { KNOWLEDGE_BASE_TAB_ID_PREFIX, PLAYBACK_TAB_ID } from "./tabConstants"
import { isWebsiteTab } from "./websiteTabs"

type TabTypeSource = Pick<TabItem, "id"> & Partial<Pick<TabItem, "type">>

export function getFileViewerTabType(
	tab: TabTypeSource | null | undefined,
): FileViewerTabType | null {
	if (!tab) return null
	if (tab.type) return tab.type
	if (tab.id === PLAYBACK_TAB_ID) return "playback"
	if (tab.id.startsWith(KNOWLEDGE_BASE_TAB_ID_PREFIX)) return "knowledge_base"
	if (isWebsiteTab(tab)) return "website"
	return "file"
}
