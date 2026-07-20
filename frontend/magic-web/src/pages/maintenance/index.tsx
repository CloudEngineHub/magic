import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { RefreshCw } from "lucide-react"
import { SupportLocales } from "@/constants/locale"
import { globalConfigStore } from "@/stores/globalConfig"
import { Button } from "@/components/shadcn-ui/button"

function MaintenancePage() {
	const { i18n } = useTranslation()
	const platformConfig = globalConfigStore.globalConfig
	const maintenanceConfig = globalConfigStore.maintenanceConfig
	const currentLanguage = i18n.language as SupportLocales
	const refreshText = currentLanguage === SupportLocales.enUS ? "Refresh" : "刷新页面"
	const logo =
		platformConfig?.logo?.[currentLanguage] ||
		platformConfig?.logo?.[SupportLocales.zhCN] ||
		platformConfig?.logo?.[SupportLocales.enUS] ||
		platformConfig?.minimal_logo ||
		platformConfig?.favicon
	const handleRefresh = () => {
		window.location.reload()
	}

	return (
		<main className="flex min-h-screen w-full items-center justify-center bg-background px-5 py-8">
			<section className="flex w-full min-w-0 max-w-[520px] flex-col items-center text-center">
				{logo && (
					<img
						src={logo}
						alt=""
						className="mb-7 max-h-[72px] max-w-[240px] object-contain"
					/>
				)}
				<div className="w-full min-w-0 whitespace-pre-wrap break-words text-lg font-medium leading-7 text-foreground">
					{maintenanceConfig.maintenance_description}
				</div>
				<Button type="button" size="sm" className="mt-6" onClick={handleRefresh}>
					<RefreshCw />
					{refreshText}
				</Button>
			</section>
		</main>
	)
}

export default observer(MaintenancePage)
