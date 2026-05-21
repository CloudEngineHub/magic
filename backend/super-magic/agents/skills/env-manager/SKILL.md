---
name: env-manager
description: Manage persistent environment variables. Use when the user provides API keys or other configuration values that need to be saved and reused across sessions.

---

# Environment Variable Manager

## Set

```python
shell_exec(
    command="python scripts/env.py set KEY_NAME 'value'"
)
```

## List

```python
shell_exec(
    command="python scripts/env.py list"
)
```

## Unset

```python
shell_exec(
    command="python scripts/env.py unset KEY_NAME"
)
```
