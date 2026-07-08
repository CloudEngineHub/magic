import { MagicSuspense } from "../components"
import AppRoutes from "./routes"

function App() {
	return (
		<MagicSuspense style={{ height: "100vh", width: "100vw" }}>
			<AppRoutes />
		</MagicSuspense>
	)
}

export default App
