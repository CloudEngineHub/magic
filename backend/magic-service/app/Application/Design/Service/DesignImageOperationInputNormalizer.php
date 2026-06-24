<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Design\Service;

use Dtyq\CloudFile\Kernel\Struct\ImageProcessOptions;
use Hyperf\Contract\ConfigInterface;

readonly class DesignImageOperationInputNormalizer
{
    public function __construct(
        private ConfigInterface $config,
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
    public function appendImageProcessOptions(array $linkOptions, bool $mask = false): array
    {
        $linkOptions = $this->cloneLinkOptions($linkOptions);
        $imageOptions = $linkOptions['image'] ?? null;
        if (! $imageOptions instanceof ImageProcessOptions) {
            $imageOptions = new ImageProcessOptions();
        }

        $imageOptions->resize([
            'mode' => 'lfit',
            'limit' => $this->normalizedMaxEdge(),
        ]);
        $imageOptions->format($mask ? 'png' : 'jpg');

        $quality = $this->normalizedQuality();
        if (! $mask && $quality > 0) {
            $imageOptions->quality($quality);
        }

        $linkOptions['image'] = $imageOptions;

        return $linkOptions;
    }

    private function maxBytes(): int
    {
        return (int) $this->config->get('design_image_operation.input_max_bytes', 5 * 1024 * 1024);
    }

    private function normalizedMaxEdge(): int
    {
        return max(1, (int) $this->config->get('design_image_operation.normalized_max_edge', 2048));
    }

    private function normalizedQuality(): int
    {
        return max(0, (int) $this->config->get('design_image_operation.normalized_quality', 85));
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
}
