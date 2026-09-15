<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Util\Http\Middleware;

use GuzzleHttp\Exception\RequestException;
use Hyperf\Context\ApplicationContext;
use Hyperf\Logger\LoggerFactory;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

class ResponseHeaderLogMiddleware
{
    private const SENSITIVE_HEADER_NAMES = [
        'authorization',
        'cookie',
        'set-cookie',
        'proxy-authorization',
    ];

    public static function create(): callable
    {
        return static function (callable $handler): callable {
            return static function (RequestInterface $request, array $options) use ($handler) {
                return $handler($request, $options)->then(
                    static function (ResponseInterface $response) use ($request): ResponseInterface {
                        self::logResponseHeaders($request, $response);

                        return $response;
                    },
                    static function (mixed $reason) use ($request): never {
                        self::logExceptionResponseHeaders($request, $reason);

                        throw $reason;
                    }
                );
            };
        };
    }

    private static function logResponseHeaders(RequestInterface $request, ResponseInterface $response): void
    {
        self::getLogger()->info('HTTP 响应头', [
            'url' => (string) $request->getUri(),
            'status_code' => $response->getStatusCode(),
            'headers' => self::sanitizeHeaders($response->getHeaders()),
        ]);
    }

    private static function logExceptionResponseHeaders(RequestInterface $request, mixed $reason): void
    {
        $response = $reason instanceof RequestException ? $reason->getResponse() : null;

        self::getLogger()->info('HTTP 异常响应头', [
            'url' => (string) $request->getUri(),
            'status_code' => $response?->getStatusCode(),
            'headers' => self::sanitizeHeaders($response?->getHeaders() ?? []),
        ]);
    }

    private static function sanitizeHeaders(array $headers): array
    {
        foreach ($headers as $name => $values) {
            if (in_array(strtolower($name), self::SENSITIVE_HEADER_NAMES, true)) {
                $headers[$name] = ['***'];
            }
        }

        return $headers;
    }

    private static function getLogger()
    {
        return ApplicationContext::getContainer()->get(LoggerFactory::class)->get(self::class);
    }
}
