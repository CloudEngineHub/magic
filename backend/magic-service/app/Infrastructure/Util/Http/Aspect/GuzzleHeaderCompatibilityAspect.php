<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Util\Http\Aspect;

use GuzzleHttp\Client;
use Hyperf\Di\Aop\AbstractAspect;
use Hyperf\Di\Aop\ProceedingJoinPoint;

/**
 * Normalizes scalar Guzzle header values before PSR-7 constructs the request.
 *
 * Guzzle/PSR-7 requires header values to be strings (or arrays of strings),
 * while some third-party SDKs still provide integer header values.
 */
class GuzzleHeaderCompatibilityAspect extends AbstractAspect
{
    public array $classes = [
        Client::class . '::request',
        Client::class . '::requestAsync',
    ];

    public function process(ProceedingJoinPoint $proceedingJoinPoint): mixed
    {
        $options = $proceedingJoinPoint->arguments['keys']['options'] ?? null;

        if (is_array($options) && isset($options['headers']) && is_array($options['headers'])) {
            $options['headers'] = $this->normalizeHeaders($options['headers']);
            $proceedingJoinPoint->arguments['keys']['options'] = $options;
        }

        return $proceedingJoinPoint->process();
    }

    private function normalizeHeaders(array $headers): array
    {
        foreach ($headers as $name => $value) {
            if (is_array($value)) {
                $headers[$name] = array_map(
                    static fn (mixed $item): mixed => is_scalar($item) || $item === null
                        ? (string) $item
                        : $item,
                    $value
                );
                continue;
            }

            if (is_scalar($value) || $value === null) {
                $headers[$name] = (string) $value;
            }
        }

        return $headers;
    }
}
