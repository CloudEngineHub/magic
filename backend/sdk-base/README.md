# sdk-base


## Installing

```shell
$ composer require dtyq/sdk-base -vvv
```

## Usage

详见 \Dtyq\SdkBase\Tests\SdkBaseTest

### 日志脱敏

`LoggerProxy` 默认会过滤所有结构化日志中的常见敏感 Header、查询参数和 JSON 字段，包括 `Authorization`、`Cookie`、`password`、`token`、`ak`、`sk` 等，因此请求和响应日志都会被统一处理。

可以通过配置追加敏感字段、修改脱敏占位符，并传入自定义过滤回调：

```php
$sdkBase = new SdkBase($container, [
    'sdk_name' => 'example_sdk',
    'log_sanitizer' => [
        'enabled' => true,
        'mask' => '***',
        'mask_mode' => 'partial',
        'sensitive_headers' => ['x-business-secret'],
        'sensitive_fields' => ['mobile'],
        'filter' => static function (string $level, string $message, array $context): array {
            if ($message === 'client_request') {
                $context['options']['body'] = '[BUSINESS_REDACTED]';
                $context['content'] = '[RESPONSE_REDACTED]';
            }
            return $context;
        },
    ],
]);
```

部分脱敏是默认模式，默认保留前后各 3 个字符。可以按业务需要调整保留长度：

```php
[
    'log_sanitizer' => [
        'mask_mode' => 'partial',
        'mask' => '***',
        'visible_prefix_length' => 3,
        'visible_suffix_length' => 4,
    ],
]
```

例如 `AKLTMzc1OTM3YzUyNzE2` 会输出为 `AKL***zE2`。字符串长度不足以安全保留首尾时，仍会完整替换为 `***`。

如需完整替换敏感值，可以显式启用完整脱敏模式：

```php
[
    'log_sanitizer' => [
        'mask_mode' => 'full',
        'mask' => '[REDACTED]',
    ],
]
```

日志脱敏默认开启。如需输出未经脱敏的原始日志，可以显式关闭：

```php
[
    'log_sanitizer' => [
        'enabled' => false,
    ],
]
```


## License

MIT
