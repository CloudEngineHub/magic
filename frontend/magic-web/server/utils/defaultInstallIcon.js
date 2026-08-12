/**
 * Generic PWA install icon when app icon.svg and platform favicon are missing.
 * Keep this SVG free of scripts / event handlers so install icon safety checks pass.
 */
const DEFAULT_INSTALL_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#E5E7EB"/>
  <rect x="120" y="120" width="120" height="120" rx="28" fill="#9CA3AF"/>
  <rect x="272" y="120" width="120" height="120" rx="28" fill="#9CA3AF"/>
  <rect x="120" y="272" width="120" height="120" rx="28" fill="#9CA3AF"/>
  <rect x="272" y="272" width="120" height="120" rx="28" fill="#9CA3AF"/>
</svg>
`

const defaultInstallIcon = {
	body: Buffer.from(DEFAULT_INSTALL_ICON_SVG),
	contentType: "image/svg+xml",
}

module.exports = defaultInstallIcon
module.exports.DEFAULT_INSTALL_ICON_SVG = DEFAULT_INSTALL_ICON_SVG
