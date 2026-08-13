# Blocked Pages

Read [SKILL.md](../SKILL.md) first. This reference applies when a site detects browser automation itself. It does not authorize bypassing CAPTCHA, access controls, service terms, rate limits, or other protections.

## Classify the block first

| Symptom | Category | Action |
|---------|----------|--------|
| The page redirects itself, blanks out, or says developer tools are open | Automation-tool detection | Follow the sequence below |
| A CAPTCHA, slider, image challenge, or click challenge appears | Human verification | Stop and ask the user to complete it |
| The page requires sign-in or reports missing permission | Access control | Ask the user for an authorized path |
| The service terms explicitly prohibit the requested operation | Compliance boundary | Stop and explain the boundary |

## Handling sequence

1. Read the current URL and any redirect chain in the Browser result. Confirm what changed instead of guessing.
2. When a legitimate page setup must exist before site scripts run, register it with `browser_add_init_script`, then navigate or reload. The script does not affect the current document.
3. Use `browser_evaluate` after load only when pre-navigation setup is impossible. This path has a timing race; after two failures, stop repeating it and choose another legitimate approach.

Use these capabilities only to prevent false automation-tool detection during an authorized task. Never use them to bypass human verification, access controls, usage limits, or security protections.
