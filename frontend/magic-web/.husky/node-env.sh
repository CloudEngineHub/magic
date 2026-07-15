# Keep Git hooks working when Git runs them from a non-login shell.
if [ -d "$HOME/.volta/bin" ]; then
	PATH="$HOME/.volta/bin:$PATH"
fi

if [ -d "$HOME/Library/pnpm" ]; then
	PATH="$HOME/Library/pnpm:$PATH"
fi

if [ -d "/opt/homebrew/bin" ]; then
	PATH="/opt/homebrew/bin:$PATH"
fi

if [ -d "/usr/local/bin" ]; then
	PATH="/usr/local/bin:$PATH"
fi

if [ -n "$MAGIC_WEB_DIR" ] && [ -d "$MAGIC_WEB_DIR/node_modules/.bin" ]; then
	PATH="$MAGIC_WEB_DIR/node_modules/.bin:$PATH"
fi

export PATH

if ! command -v node >/dev/null 2>&1; then
	export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
	if [ -s "$NVM_DIR/nvm.sh" ]; then
		. "$NVM_DIR/nvm.sh"
		if [ -n "$MAGIC_WEB_DIR" ] && [ -f "$MAGIC_WEB_DIR/.nvmrc" ]; then
			nvm use --silent >/dev/null 2>&1 || true
		else
			nvm use --silent default >/dev/null 2>&1 || nvm use --silent node >/dev/null 2>&1 || true
		fi
	fi
fi

if ! command -v node >/dev/null 2>&1 && command -v fnm >/dev/null 2>&1; then
	eval "$(fnm env --shell sh)"
fi

if ! command -v node >/dev/null 2>&1; then
	echo "Node.js is required for magic-web Git hooks, but it was not found in PATH."
	exit 127
fi

if ! command -v pnpm >/dev/null 2>&1 && command -v corepack >/dev/null 2>&1; then
	pnpm() {
		corepack pnpm "$@"
	}
fi

if ! command -v pnpm >/dev/null 2>&1; then
	echo "pnpm is required for magic-web Git hooks, but it was not found in PATH."
	exit 127
fi
