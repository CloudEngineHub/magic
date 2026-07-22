import { Fragment } from "react/jsx-runtime"
import LayersDrawer from "./drawer/index"
import LayersButton from "./button/index"
import LayersResizeDragHandle from "./resize/index"

export default function Layers() {
	return (
		<Fragment>
			<LayersButton />
			<LayersDrawer />
			<LayersResizeDragHandle />
		</Fragment>
	)
}
