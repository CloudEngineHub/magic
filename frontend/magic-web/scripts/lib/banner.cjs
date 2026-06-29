#!/usr/bin/env node

/**
 * Shared utilities for Magic Web build/dev scripts.
 * Provides ANSI colors, structured logging, and an ASCII art banner.
 */

const COLORS = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	brightGreen: "\x1b[92m",
	brightBlue: "\x1b[94m",
	brightMagenta: "\x1b[95m",
	brightCyan: "\x1b[96m",
}

const BANNER_LINES = [
	"  __  __   _   ___ ___ ___  __      _____ ___ ",
	" |  \\/  | /_\\ / __|_ _/ __| \\ \\    / / __| _ )",
	" | |\\/| |/ _ \\ (_ || | (__   \\ \\/\\/ /| _|| _ \\",
	" |_|  |_/_/ \\_\\___|___\\___|   \\_/\\_/ |___|___/",
]

const BANNER_GRADIENT = [
	COLORS.brightCyan,
	COLORS.cyan,
	COLORS.brightMagenta,
	COLORS.magenta,
]

function printBanner(subtitle = "") {
	console.log("")
	for (let i = 0; i < BANNER_LINES.length; i++) {
		console.log(`${BANNER_GRADIENT[i]}${BANNER_LINES[i]}${COLORS.reset}`)
	}
	if (subtitle) {
		console.log(`  ${COLORS.brightGreen}${subtitle}${COLORS.reset}`)
	}
	console.log("")
}

function log(message, color = "reset") {
	console.log(`${COLORS[color] || COLORS.reset}${message}${COLORS.reset}`)
}

function writeStep(message) {
	process.stdout.write(`  ${COLORS.cyan}${message}${COLORS.reset}`)
}

function writeStepResult(success) {
	console.log(success ? ` ${COLORS.green}✓${COLORS.reset}` : ` ${COLORS.red}✗${COLORS.reset}`)
}

module.exports = { COLORS, log, printBanner, writeStep, writeStepResult }
