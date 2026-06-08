import magicPluginKitStyles from "./shared/magic-plugin-kit/styles.css?raw"
import magicPluginKitRuntimeCode from "./shared/magic-plugin-kit/index.js?raw"
import magicPromptLocaleRuntimeCode from "./shared/prompt-locale/index.js?raw"
import { BUILTIN_PLUGIN_SLUGS } from "./builtin-plugin-slugs"
import { createBuiltinPlugins } from "./create-builtin-plugin"

const sharedPluginRuntimeCode = `${magicPluginKitRuntimeCode}\n\n${magicPromptLocaleRuntimeCode}`

export const designBuiltinPlugins = createBuiltinPlugins(
	BUILTIN_PLUGIN_SLUGS,
	sharedPluginRuntimeCode,
	magicPluginKitStyles,
)
