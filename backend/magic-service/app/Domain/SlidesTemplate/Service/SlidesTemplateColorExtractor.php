<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Service;

class SlidesTemplateColorExtractor
{
    private const SAMPLE_SIZE = 80;

    private const COLOR_LIMIT = 5;

    private const QUANTIZE_STEP = 32;

    /**
     * @return string[] HEX colors, the first color is the dominant color
     */
    public function extractColors(string $imageContent): array
    {
        if ($imageContent === '' || ! function_exists('imagecreatefromstring')) {
            return [];
        }

        $image = @imagecreatefromstring($imageContent);
        if ($image === false) {
            return [];
        }

        $sample = $this->createSampleImage($image);
        imagedestroy($image);
        if ($sample === null) {
            return [];
        }

        $colors = $this->extractFromSample($sample, true);
        if ($colors === []) {
            $colors = $this->extractFromSample($sample, false);
        }
        imagedestroy($sample);

        return $colors;
    }

    private function createSampleImage(mixed $image): mixed
    {
        $width = imagesx($image);
        $height = imagesy($image);

        $sample = imagecreatetruecolor(self::SAMPLE_SIZE, self::SAMPLE_SIZE);
        if ($sample === false) {
            return null;
        }

        imagealphablending($sample, false);
        imagesavealpha($sample, true);
        imagecopyresampled($sample, $image, 0, 0, 0, 0, self::SAMPLE_SIZE, self::SAMPLE_SIZE, $width, $height);

        return $sample;
    }

    /**
     * @return string[]
     */
    private function extractFromSample(mixed $sample, bool $skipBackgroundColors): array
    {
        $buckets = [];
        for ($x = 0; $x < self::SAMPLE_SIZE; ++$x) {
            for ($y = 0; $y < self::SAMPLE_SIZE; ++$y) {
                $rgba = imagecolorat($sample, $x, $y);
                $alpha = ($rgba & 0x7F000000) >> 24;
                if ($alpha >= 96) {
                    continue;
                }

                $r = ($rgba >> 16) & 0xFF;
                $g = ($rgba >> 8) & 0xFF;
                $b = $rgba & 0xFF;
                if ($skipBackgroundColors && $this->isBackgroundColor($r, $g, $b)) {
                    continue;
                }

                $key = $this->createBucketKey($r, $g, $b);
                $saturation = $this->getSaturation($r, $g, $b);
                $score = 1 + $saturation;
                $buckets[$key] ??= ['score' => 0.0, 'count' => 0, 'r' => 0, 'g' => 0, 'b' => 0];
                $buckets[$key]['score'] += $score;
                ++$buckets[$key]['count'];
                $buckets[$key]['r'] += $r;
                $buckets[$key]['g'] += $g;
                $buckets[$key]['b'] += $b;
            }
        }

        uasort($buckets, static fn (array $left, array $right): int => $right['score'] <=> $left['score']);

        $colors = [];
        foreach ($buckets as $bucket) {
            $colors[] = $this->toHex(
                (int) round($bucket['r'] / $bucket['count']),
                (int) round($bucket['g'] / $bucket['count']),
                (int) round($bucket['b'] / $bucket['count'])
            );
            if (count($colors) >= self::COLOR_LIMIT) {
                break;
            }
        }

        return $colors;
    }

    private function isBackgroundColor(int $r, int $g, int $b): bool
    {
        $max = max($r, $g, $b);
        $min = min($r, $g, $b);
        $saturation = $this->getSaturation($r, $g, $b);

        return $max >= 245 || $max <= 16 || ($saturation < 0.12 && ($max - $min) < 24);
    }

    private function getSaturation(int $r, int $g, int $b): float
    {
        $max = max($r, $g, $b);
        if ($max === 0) {
            return 0.0;
        }

        return ($max - min($r, $g, $b)) / $max;
    }

    private function createBucketKey(int $r, int $g, int $b): string
    {
        return implode(':', [
            $this->quantize($r),
            $this->quantize($g),
            $this->quantize($b),
        ]);
    }

    private function quantize(int $value): int
    {
        return min(255, intdiv($value, self::QUANTIZE_STEP) * self::QUANTIZE_STEP);
    }

    private function toHex(int $r, int $g, int $b): string
    {
        return sprintf('#%02X%02X%02X', $this->clamp($r), $this->clamp($g), $this->clamp($b));
    }

    private function clamp(int $value): int
    {
        return max(0, min(255, $value));
    }
}
