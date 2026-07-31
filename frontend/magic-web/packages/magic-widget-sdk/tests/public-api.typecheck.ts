import type { MagicWidget } from "../src"

const validOptions: MagicWidget.MountOptions = {
	page: {
		type: "crew",
		crewId: "crew-001",
	},
	auth: {
		loginStrategy: "private_deployment",
		deploymentCode: "private-mock",
		organizationCode: "org-001",
	},
	modal: {
		title: "Support Center",
		classNames: {
			mask: "custom-mask",
			container: "custom-container",
			header: "custom-header",
		},
		styles: {
			mask: {
				backgroundColor: "rgba(0, 0, 0, 0.35)",
			},
			container: {
				backgroundColor: "#fff",
			},
			header: {
				borderBottomColor: "#eee",
			},
		},
	},
	config: {
		layout: "desktop",
		shell: { appSidebar: false },
		conversation: { projectFiles: false, topicHistory: true },
		responsive: { mobileDetection: "device-and-viewport" },
	},
}

void validOptions

// Keep SDK autocomplete aligned with the Magic Web login strategies used by Widget hosts.
const knownLoginStrategies: MagicWidget.LoginStrategy[] = [
	"private_deployment",
	"wechat_official_account",
]

void knownLoginStrategies

const unsubscribeReady = window.MagicWidget?.on("agent_ready", () => undefined)
void unsubscribeReady
void window.MagicWidget?.setInput("mock input")
void window.MagicWidget?.appendInput("mock suffix")
void window.MagicWidget?.clearInput()
void window.MagicWidget?.getInput()
void window.MagicWidget?.sendMessage("mock message")
void window.MagicWidget?.newConversation()
void window.MagicWidget?.updateConfig({
	layout: "mobile",
	conversation: { topicHistory: false },
	responsive: { mobileDetection: "viewport" },
})

void window.MagicWidget?.updateConfig({
	responsive: {
		// @ts-expect-error unsupported detection strategies are rejected by the public contract.
		mobileDetection: "device-only",
	},
})

void window.MagicWidget?.updateConfig({
	// @ts-expect-error unsupported layouts are rejected by the public configuration contract.
	layout: "tablet",
})

const invalidRouteOptions: MagicWidget.MountOptions = {
	page: {
		type: "crew",
		crewId: "crew-001",
	},
	// @ts-expect-error free-form route configuration is not part of the public widget API.
	route: "/default/super/assistant",
}

void invalidRouteOptions

const invalidTopLevelOrganizationCodeOptions: MagicWidget.MountOptions = {
	page: {
		type: "crew",
		crewId: "crew-001",
	},
	// @ts-expect-error organizationCode is configured through auth.organizationCode.
	organizationCode: "org-001",
}

void invalidTopLevelOrganizationCodeOptions

const invalidPageTypeOptions: MagicWidget.MountOptions = {
	page: {
		// @ts-expect-error only supported page types can be opened by the widget.
		type: "freeform",
		crewId: "crew-001",
	},
}

void invalidPageTypeOptions

const invalidAppOriginOptions: MagicWidget.MountOptions = {
	page: {
		type: "crew",
		crewId: "crew-001",
	},
	// @ts-expect-error appOrigin is inferred from the script URL, not user configuration.
	appOrigin: "https://www.letsmagic.cn",
}

void invalidAppOriginOptions

const invalidClusterCodeOptions: MagicWidget.MountOptions = {
	page: {
		type: "crew",
		crewId: "crew-001",
	},
	// @ts-expect-error clusterCode is controlled by the SDK page resolver.
	clusterCode: "default",
}

void invalidClusterCodeOptions

const invalidTriggerOptions: MagicWidget.MountOptions = {
	page: {
		type: "crew",
		crewId: "crew-001",
	},
	// @ts-expect-error trigger customization is not part of the public widget API.
	trigger: {
		text: "Ask Magic",
	},
}

void invalidTriggerOptions

const invalidZIndexOptions: MagicWidget.MountOptions = {
	page: {
		type: "crew",
		crewId: "crew-001",
	},
	// @ts-expect-error zIndex is managed by the SDK shell.
	zIndex: 10,
}

void invalidZIndexOptions

const invalidIframeTitleOptions: MagicWidget.MountOptions = {
	page: {
		type: "crew",
		crewId: "crew-001",
	},
	iframe: {
		// @ts-expect-error iframe title is configured through modal.title.
		title: "Support Center",
	},
}

void invalidIframeTitleOptions
