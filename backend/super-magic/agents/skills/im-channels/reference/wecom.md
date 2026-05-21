# WeCom AI Bot

Connects via WeCom AI Bot WebSocket protocol.

## Prerequisites

Create an AI bot in the WeCom admin console and obtain:
- **Bot ID**: The unique identifier of the AI bot
- **Secret**: The authentication key

## Credential Collection

Ask the user in sequence:
1. "Please provide the WeCom AI Bot's Bot ID"
2. "Please provide the corresponding Secret"

## Establish Connection

(Use run_sdk_snippet tool, python_code parameter:)

```
from sdk.tool import tool

result = tool.call("connect_wecom_bot", {
    "bot_id": "<Bot ID provided by user>",
    "secret": "<Secret provided by user>",
})
print(result.content)
```

## Result Handling

- Success: "WeCom bot connected successfully. You can now chat with me in WeCom."
- Failure: Report the error, suggest checking whether Bot ID and Secret are correct
