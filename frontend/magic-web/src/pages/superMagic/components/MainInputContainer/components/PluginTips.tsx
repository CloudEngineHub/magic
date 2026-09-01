import { useMemo } from "react"
import { Plug, ChevronRight } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useCreation, useRequest } from "ahooks"

import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@/components/shadcn-ui/avatar"
import {
	MCPManagerService,
	OfficialStrategy,
} from "@/components/Agent/MCP/service/MCPManagerService"

const MAX_DISPLAY_ICONS = 5

interface PluginTipsProps {
	onConnectClick?: () => void
}

function PluginTips({ onConnectClick }: PluginTipsProps) {
	const { t } = useTranslation("super/mainInput")

	const service = useCreation(() => {
		const s = new MCPManagerService()
		s.setContext(new OfficialStrategy())
		return s
	}, [])

	const { data } = useRequest(() => service.getMCPList(), {
		cacheKey: "plugin-tips-mcp-list",
	})

	const iconList = useMemo(() => {
		const availableIcons = (data ?? []).filter((item) => item.icon)
		const shuffledIcons = [...availableIcons]

		for (let index = shuffledIcons.length - 1; index > 0; index -= 1) {
			const randomIndex = Math.floor(Math.random() * (index + 1))
			const currentIcon = shuffledIcons[index]
			shuffledIcons[index] = shuffledIcons[randomIndex]
			shuffledIcons[randomIndex] = currentIcon
		}

		return shuffledIcons.slice(0, MAX_DISPLAY_ICONS)
	}, [data])

	return (
		<button
			className="flex w-full items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-accent/50"
			onClick={onConnectClick}
			data-testid="on-connect-click"
		>
			<div className="flex grow items-center gap-2">
				<Plug className="size-4 text-foreground" />
				<p className="text-sm font-medium leading-5 text-foreground">
					{t("pluginTips.connectTools")}
				</p>
			</div>

			{/* Icon Group - Tool integration icons */}
			{iconList.length > 0 && (
				<div className="flex items-center pr-1.5">
					<AvatarGroup>
						{iconList.map((tool) => (
							<Avatar
								key={tool.id}
								className="size-6 border-2 border-white bg-background shadow-sm !ring-white"
								title={tool.name}
							>
								<AvatarImage
									src={tool.icon}
									alt={tool.name}
									className="size-full rounded-full object-cover"
									draggable={false}
									data-testid="plugin-tips-image"
								/>
								<AvatarFallback className="text-[10px]">
									{tool.name.charAt(0).toUpperCase()}
								</AvatarFallback>
							</Avatar>
						))}
					</AvatarGroup>
				</div>
			)}

			<ChevronRight className="size-4" />
		</button>
	)
}

export default PluginTips
