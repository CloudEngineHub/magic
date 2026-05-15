import { lazy } from "react"

const AppDesktopPage = lazy(() => import("./index.desktop"))

function AppPage() {
	return <AppDesktopPage />
}

export default AppPage
