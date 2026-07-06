import { Bot, Box, House, LayoutGrid, MessageCircle, Mic, Trash2 } from "lucide-react"

import { MagiClawNavIcon } from "@/pages/superMagicMobile/components/icons/MagiClawNavIcon"
import { RouteName } from "@/routes/constants"

import type { SuperMobileShellNavConfigItem } from "./types"

/** Default mobile shell nav config; enterprise overlays should compose from this list when possible. */
export const BASE_SUPER_MOBILE_SHELL_NAV_ITEMS: SuperMobileShellNavConfigItem[] = [
	{
		key: "home",
		icon: House,
		labelKey: "mobile.shell.navSuper",
		routeName: RouteName.MobileHome,
	},
	{
		key: "chats",
		icon: MessageCircle,
		labelKey: "mobile.shell.navChats",
		routeName: RouteName.SuperChatsList,
	},
	{
		key: "workspaces",
		icon: Box,
		labelKey: "mobile.shell.navWorkspaces",
		routeName: RouteName.SuperWorkspacesList,
	},
	{
		key: "recording",
		icon: Mic,
		labelKey: "mobile.shell.navRecording",
		routeName: RouteName.AudioRecordings,
		nativeRecordingTab: "ai_recording",
	},
	{
		key: "myCrew",
		icon: Bot,
		labelKey: "mobile.shell.navMyCrew",
		routeName: RouteName.MyCrew,
	},
	{
		key: "magiClaw",
		icon: MagiClawNavIcon,
		labelKey: "mobile.shell.navMagiClaw",
		routeName: RouteName.MagiClaw,
	},
	{
		key: "apps",
		icon: LayoutGrid,
		labelKey: "mobile.shell.navApps",
		routeName: RouteName.SuperApps,
	},
	{
		key: "trash",
		icon: Trash2,
		labelKey: "mobile.shell.navTrash",
		routeName: RouteName.RecycleBin,
	},
]
