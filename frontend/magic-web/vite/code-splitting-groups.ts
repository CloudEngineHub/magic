/** Rolldown manual chunk groups for production code splitting. */
function normalizeModuleId(id: string): string {
	return id.replace(/\\/g, "/")
}

function isLocaleJsonModule(id: string, locale: "zh_CN" | "en_US"): boolean {
	// Vite/Rolldown may append query parameters to transformed JSON module ids.
	const normalizedId = normalizeModuleId(id).split("?", 1)[0]

	// Matching /src/ keeps the rule valid for base, enterprise and customer overlays.
	return normalizedId.includes(`/src/assets/locales/${locale}/`) && normalizedId.endsWith(".json")
}

export function createCodeSplittingGroups() {
	return [
		{
			name: "locale-zh-cn",
			priority: 100,
			entriesAware: false,
			test: (id: string) => isLocaleJsonModule(id, "zh_CN"),
		},
		{
			name: "locale-en-us",
			priority: 100,
			entriesAware: false,
			test: (id: string) => isLocaleJsonModule(id, "en_US"),
		},
		{
			name: "antd-colors",
			priority: 40,
			test: (id: string) => normalizeModuleId(id).includes("node_modules/@ant-design/colors"),
		},
		{
			name: "lucide-icons",
			priority: 30,
			test: (id: string) =>
				normalizeModuleId(id).includes("node_modules/lucide-react/dist/esm/icons"),
		},
		{
			name: "ahooks",
			priority: 30,
			test: (id: string) => normalizeModuleId(id).includes("node_modules/ahooks"),
		},
		{
			name: "shadcn-ui",
			priority: 20,
			test: (id: string) => normalizeModuleId(id).includes("src/components/shadcn-ui"),
		},
		{
			name: "mermaid-loader",
			priority: 30,
			test: (id: string) => normalizeModuleId(id).includes("/src/library/mermaid/"),
		},
		{
			name: "monacoEditorReact",
			priority: 20,
			test: (id: string) =>
				normalizeModuleId(id).includes("node_modules/@monaco-editor/react"),
		},
		{
			name: "monacoEditor",
			priority: 10,
			test: (id: string) => {
				const normalizedId = normalizeModuleId(id)

				return (
					normalizedId.includes("node_modules/monaco-editor") &&
					!normalizedId.includes("node_modules/@monaco-editor/react")
				)
			},
		},
		{
			name: "simple-editor",
			priority: 20,
			test: (id: string) =>
				normalizeModuleId(id).includes("src/components/tiptap-templates/simple"),
		},
		{
			name: "message-editor",
			priority: 10,
			test: (id: string) =>
				normalizeModuleId(id).includes("src/pages/superMagic/components/MessageEditor"),
		},
		{
			name: "hooks",
			priority: 10,
			test: (id: string) => normalizeModuleId(id).includes("src/hooks"),
		},
		{
			name: "super-hooks",
			priority: 10,
			test: (id: string) => normalizeModuleId(id).includes("src/pages/superMagic/hooks"),
		},
		{
			name: "mention-panel-default-runtime",
			priority: 10,
			test: (id: string) =>
				normalizeModuleId(id).includes(
					"src/components/business/MentionPanel/runtime/default-runtime",
				),
		},
	]
}
