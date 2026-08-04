# Structured Error Contract

Use this reference when field behavior or destination-specific output matters.

## Business Input

```ts
interface StructuredErrorInput {
	eventKey: string
	errorKind: string
	error?: unknown
	message?: string
	context?: Record<string, unknown>
}
```

Only a single plain object with non-empty `eventKey` and `errorKind` enters the structured path. A single object containing either reserved field but not a complete pair is rejected rather than downgraded to legacy behavior.

The Logger adds:

```text
namespace      from createLogger(namespace)
eventId        generated once per logger.error call
release        MAGIC_APP_VERSION || MAGIC_APP_SHA || ""
captureSource  "manual"
```

The same `eventId` and `release` are used for the Provider and self-hosted paths.

## Destination Behavior

| Business field    | Volcengine JS probe                           | Self-hosted `/log-report`                    |
| ----------------- | --------------------------------------------- | -------------------------------------------- |
| `eventKey`        | String attribute                              | Top-level field                              |
| `errorKind`       | String attribute                              | Top-level field                              |
| `error: Error`    | Original Error passed to `captureException`   | `{ name, message, stack }`                   |
| non-Error `error` | Provider creates a synthetic Error            | Original value after sanitization/JSON rules |
| `message`         | Fallback for synthetic Error creation         | Independent top-level field                  |
| `context`         | Not currently included in Provider attributes | Independent top-level object                 |
| `release`         | Provider attribute and SDK release            | Top-level field                              |

For a real `Error`, the Volcengine-probe exception message is `error.message`; business `message` does not overwrite it. In `/log-report`, `message` and `error.message` remain separate.

## Provider Normalization

```text
Provider value = error ?? message
Provider fallback = message || eventKey
```

| Business value                | Probe message | Probe stack | `syntheticError` | Self-hosted `error`             |
| ----------------------------- | ------------- | ----------- | ---------------- | ------------------------------- |
| `Error("A")`, message `"B"`   | `A`           | Original    | `false`          | `{ name, message: "A", stack }` |
| string `"A"`, message `"B"`   | `A`           | Synthetic   | `true`           | `"A"`                           |
| object, message `"B"`         | `B`           | Synthetic   | `true`           | Object                          |
| number/boolean, message `"B"` | `B`           | Synthetic   | `true`           | Primitive                       |
| `null`, message `"B"`         | `B`           | Synthetic   | `true`           | `null`                          |
| no error, message `"B"`       | `B`           | Synthetic   | `true`           | Field omitted                   |
| object, no message            | `eventKey`    | Synthetic   | `true`           | Object                          |
| no error or message           | `eventKey`    | Synthetic   | `true`           | Field omitted                   |

Do not treat a synthetic stack as the original throw location.

## Self-Hosted Logical Record

ReporterPlugin flattens the ErrorReport with runtime fields:

```ts
{
	logType: "error",
	traceId,
	release,
	url,
	info: {
		uId,
		tOrgCode,
		mOrgCode,
		cluster,
	},
	timestamp,
	namespace,
	eventKey,
	errorKind,
	error,
	message,
	context,
	captureSource: "manual",
	eventId,
}
```

Structured records do not include legacy `data`, Logger `metadata`, or Provider-only `originalError`.

ReporterPlugin sends an array to the existing `POST /log-report` endpoint. Defaults are batch size 30, interval 5 seconds, two retries, and reporting disabled in development. Supported browsers normally send gzip bytes with `Content-Encoding: gzip`; the logical decompressed body is still the JSON array.

## Serialization Boundaries

`serializeError` explicitly converts only values satisfying `error instanceof Error`:

```ts
{
	name: error.name,
	message: error.message,
	stack: error.stack,
}
```

Custom Error properties such as `code`, `cause`, or response data are not automatically copied. Add a bounded, safe value to context only when it is diagnostically necessary.

Non-Error values follow sanitization and JSON behavior:

| Value                                      | Self-hosted result                      |
| ------------------------------------------ | --------------------------------------- |
| string/object/array/number/boolean/null    | Preserved after recursive sanitization  |
| `undefined` or `Symbol` property           | Omitted                                 |
| function                                   | `"[FUNCTION]"`                          |
| `NaN` or `Infinity`                        | `null`                                  |
| `Date`, `Map`, `Set`, many class instances | Often `{}` after enumerable-key copying |
| circular object                            | Sanitization or serialization can fail  |
| `BigInt`                                   | JSON serialization fails                |

Prefer real Error objects and bounded plain context objects.

## Sensitive Data Boundary

SensitiveMasker processes self-hosted `message`, serialized `error`, `context`, and page URL. Volcengine applies a separate `beforeSend` to the SDK event. This is a fallback, not permission to log secrets.

Never intentionally log:

- access tokens, refresh tokens, session tokens, API keys, passwords, authorization codes;
- temporary credentials, secret keys, policies, signatures, or complete auth objects;
- complete message/document/draft/business bodies;
- complete attachment/file collections;
- circular, unbounded, or high-volume runtime objects.

Do not apply speculative deletion to all URLs, filenames, raw data, or business values. Preserve necessary evidence and use a targeted bound or mask only when the actual value requires it.

## Provider Availability

- `MAGIC_APM.strategy = "Volcengine"`: structured manual errors call `captureException` after Provider initialization.
- `MAGIC_APM.strategy = "Aliyun"`: the SDK initializes, but the current manual `AliyunProvider.error()` remains a no-op.
- missing/unknown strategy: `MagicProvider` is a no-op.
- self-hosted reporting is independent of `MAGIC_APM` and is disabled in development by default.

Do not claim that Aliyun manual errors currently receive the same structure as Volcengine.
