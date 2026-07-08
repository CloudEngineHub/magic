export function renderAgreementTemplate(
	content: string,
	{
		platformName,
		domain,
	}: {
		platformName: string
		domain: string
	},
) {
	return content
		.replaceAll("{{platformName}}", platformName)
		.replaceAll("{{domain}}", domain)
}