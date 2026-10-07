import { memo } from "react"
import Container from "../../components/MainInputContainer"
import NewUserBenefits from "../../components/NewUserBenefits"
import Header from "./components/Header"
import { useFeaturedModeListRefreshOnAgentsPageMount } from "@/pages/superMagic/hooks/useFeaturedModeListRefresh"

function AgentsPage() {
	useFeaturedModeListRefreshOnAgentsPageMount()

	return (
		<div className="relative flex flex-1 flex-col items-center overflow-hidden rounded-xl border border-border bg-background">
			<Header className="shrink-0" />
			<Container />
			<NewUserBenefits />
		</div>
	)
}

export default memo(AgentsPage)
