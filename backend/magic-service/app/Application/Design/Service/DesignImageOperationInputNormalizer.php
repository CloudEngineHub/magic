<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Design\Service;

use Closure;
use Dtyq\CloudFile\Kernel\Struct\ImageProcessOptions;
use Hyperf\Contract\ConfigInterface;
use Throwable;

readonly class DesignImageOperationInputNormalizer
{
    public function __construct(
        private ConfigInterface $config,
        private ?Closure $contentLengthResolver = null,
    ) {
    }

    /**
     * @param array<int, null|int> $fileSizes
     */
    public function shouldNormalizeBySizes(array $fileSizes): bool
    {
        foreach ($fileSizes as $fileSize) {
            if ($fileSize !== null && $fileSize > $this->maxBytes()) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param array<string, mixed> $linkOptions
     * @return array<string, mixed>
     */
    public function appendImageProcessOptions(array $linkOptions): array
    {
        return $this->buildNormalizedLinkOptionProfiles($linkOptions)[0] ?? $linkOptions;
    }

    /**
     * @param array<string, mixed> $linkOptions
     * @return list<array<string, mixed>>
     */
    public function buildNormalizedLinkOptionProfiles(array $linkOptions, bool $mask = false): array
    {
        $profiles = [];
        $edges = $this->normalizedMaxEdges();
        foreach ($edges as $index => $edge) {
            $profileLinkOptions = $this->cloneLinkOptions($linkOptions);
            $imageOptions = $profileLinkOptions['image'] ?? null;
            if (! $imageOptions instanceof ImageProcessOptions) {
                $imageOptions = new ImageProcessOptions();
            }

            $imageOptions->resize([
                'mode' => 'lfit',
                'limit' => $edge,
            ]);

            $imageOptions->format($mask ? 'png' : 'jpg');

            $quality = $mask ? 0 : $this->normalizedQualityAt($index);
            if ($quality > 0) {
                $imageOptions->quality($quality);
            }

            $profileLinkOptions['image'] = $imageOptions;
            $profiles[] = $profileLinkOptions;
        }

        return $profiles;
    }

    public function isUrlWithinMaxBytes(string $url): bool
    {
        $contentLength = $this->resolveRemoteContentLength($url);
        return $contentLength !== null && $contentLength <= $this->maxBytes();
    }

    private function maxBytes(): int
    {
        return (int) $this->config->get('design_image_operation.input_max_bytes', 5 * 1024 * 1024);
    }

    /**
     * @return list<int>
     */
    private function normalizedMaxEdges(): array
    {
        return $this->intListConfig(
            'design_image_operation.normalized_max_edges',
            [2048, 1536, 1024]
        );
    }

    private function normalizedQualityAt(int $index): int
    {
        $qualities = $this->intListConfig(
            'design_image_operation.normalized_qualities',
            [85, 75, 65]
        );

        return $qualities[$index] ?? $qualities[array_key_last($qualities)];
    }

    /**
     * @param array<string, mixed> $linkOptions
     * @return array<string, mixed>
     */
    private function cloneLinkOptions(array $linkOptions): array
    {
        if (($linkOptions['image'] ?? null) instanceof ImageProcessOptions) {
            $linkOptions['image'] = clone $linkOptions['image'];
        }

        return $linkOptions;
    }

    /**
     * @return list<int>
     */
    private function intListConfig(string $key, array $default): array
    {
        $value = $this->config->get($key, $default);
        if (is_string($value)) {
            $value = array_filter(array_map('trim', explode(',', $value)), static fn (string $item): bool => $item !== '');
        }
        if (! is_array($value)) {
            $value = $default;
        }

        $result = [];
        foreach ($value as $item) {
            $number = (int) $item;
            if ($number > 0) {
                $result[] = $number;
            }
        }

        return array_values(array_unique($result)) ?: $default;
    }

    private function resolveRemoteContentLength(string $url): ?int
    {
        if ($this->contentLengthResolver instanceof Closure) {
            $contentLength = ($this->contentLengthResolver)($url);
            return is_int($contentLength) && $contentLength >= 0 ? $contentLength : null;
        }

        try {
            $context = stream_context_create([
                'http' => [
                    'method' => 'GET',
                    'header' => "Range: bytes=0-0\r\n",
                    'timeout' => $this->remoteSizeProbeTimeoutSeconds(),
                    'ignore_errors' => true,
                ],
                'ssl' => [
                    'verify_peer' => false,
                    'verify_peer_name' => false,
                ],
            ]);
            $headers = @get_headers($url, true, $context);
            if ($headers === false) {
                return null;
            }

            return $this->parseContentLengthFromHeaders($headers);
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * @param array<string, mixed> $headers
     */
    private function parseContentLengthFromHeaders(array $headers): ?int
    {
        $contentRange = $headers['Content-Range'] ?? $headers['content-range'] ?? null;
        $contentRange = is_array($contentRange) ? end($contentRange) : $contentRange;
        if (is_string($contentRange) && preg_match('/\/(\d+)$/', $contentRange, $matches) === 1) {
            return (int) $matches[1];
        }

        $contentLength = $headers['Content-Length'] ?? $headers['content-length'] ?? null;
        $contentLength = is_array($contentLength) ? end($contentLength) : $contentLength;
        if (is_numeric($contentLength)) {
            return (int) $contentLength;
        }

        return null;
    }

    private function remoteSizeProbeTimeoutSeconds(): int
    {
        return max(1, (int) $this->config->get('design_image_operation.remote_size_probe_timeout_seconds', 3));
    }
}
