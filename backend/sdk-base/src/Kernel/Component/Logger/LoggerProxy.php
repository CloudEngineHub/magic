<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SdkBase\Kernel\Component\Logger;

use Dtyq\SdkBase\Kernel\Component\Config\LogSanitizerConfig;
use Psr\Log\LoggerInterface;

/**
 * 因为psr/log 1.0和2.0、3.0有差异，就不继承使用了，不直接注入，这里做一个转发.
 * @method void emergency(string $message, array $context = [])
 * @method void alert(string $message, array $context = [])
 * @method void critical(string $message, array $context = [])
 * @method void error(string $message, array $context = [])
 * @method void warning(string $message, array $context = [])
 * @method void notice(string $message, array $context = [])
 * @method void info(string $message, array $context = [])
 * @method void debug(string $message, array $context = [])
 * @method void collect(string $message, array $context = [])
 */
class LoggerProxy
{
    private readonly LogSanitizer $sanitizer;

    /**
     * 初始化日志代理和专用日志脱敏器。
     */
    public function __construct(
        private readonly string $sdkName,
        private readonly ?LoggerInterface $logger = null,
        LogSanitizerConfig $config = new LogSanitizerConfig()
    ) {
        $this->sanitizer = new LogSanitizer($config);
    }

    /**
     * 脱敏结构化日志上下文并转发给底层日志实现。
     *
     * @param array<int, mixed> $arguments
     * @param mixed $name
     */
    public function __call($name, $arguments)
    {
        $arguments = array_values($arguments);
        $message = (string) ($arguments[0] ?? '');
        $context = is_array($arguments[1] ?? null) ? $arguments[1] : [];
        $arguments[1] = $this->sanitizer->sanitize((string) $name, $message, $context);
        $arguments[0] = "[{$this->sdkName}] " . $message;
        if ($this->logger && method_exists($this->logger, $name)) {
            $this->logger->{$name}(...$arguments);
        }
    }
}
