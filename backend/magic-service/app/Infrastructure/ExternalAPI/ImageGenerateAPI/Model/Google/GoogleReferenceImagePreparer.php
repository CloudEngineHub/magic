<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\ImageGenerateAPI\Model\Google;

use App\Infrastructure\Util\File\ImageBase64DataUriParser;
use Dtyq\CloudFile\Kernel\Utils\RemoteDownloadSecurityConfig;
use Dtyq\CloudFile\Kernel\Utils\SafeRemoteFileDownloader;
use Exception;
use Hyperf\Logger\LoggerFactory;

use function Hyperf\Translation\__;

/**
 * Google 生图参考图 Base64 准备器。
 */
class GoogleReferenceImagePreparer
{
    /** Google 生图参考图传输：单张参考图最大字节数（60 MiB）。 */
    private const MAX_IMAGE_BYTES = 60 * 1024 * 1024;

    /** Google 生图参考图传输：全部参考图最大累计字节数（60 MiB）。 */
    private const MAX_IMAGES_BYTES = 60 * 1024 * 1024;

    /** Google 生图参考图安全下载器。 */
    private SafeRemoteFileDownloader $downloader;

    public function __construct(?SafeRemoteFileDownloader $downloader = null)
    {
        $this->downloader = $downloader ?? new SafeRemoteFileDownloader(new RemoteDownloadSecurityConfig(
            enabled: true,
            level: RemoteDownloadSecurityConfig::LEVEL_STANDARD,
            maxDownloadSize: self::MAX_IMAGE_BYTES,
        ));
    }

    /**
     * 将 URL 或 Data URI 转为 Google inlineData 所需的 Base64 结构。
     *
     * @param array<int, string> $images
     * @return array<int, array{type: 'base64', mimeType: string, data: string}>
     */
    public function prepare(array $images): array
    {
        $startTime = microtime(true);
        $startMemoryBytes = memory_get_usage(true);
        $preparedImages = [];
        $totalBytes = 0;
        $totalBase64Bytes = 0;

        foreach (array_slice($images, 0, 14) as $image) {
            $dataUri = ImageBase64DataUriParser::parseDecoded($image);
            $preparedImage = $dataUri !== null
                ? $this->prepareDataUri($dataUri, $totalBytes)
                : $this->prepareRemoteImage($image, $totalBytes);

            $preparedImages[] = $preparedImage;
            $totalBase64Bytes += strlen($preparedImage['data']);
        }

        $this->logPreparationMetrics(
            count($preparedImages),
            $totalBytes,
            $totalBase64Bytes,
            $startTime,
            $startMemoryBytes,
        );

        return $preparedImages;
    }

    /**
     * 将已解析的 Data URI 转为 inlineData。
     *
     * @param array{mime_type: string, base64_data: string, binary_data: string} $dataUri
     * @return array{type: 'base64', mimeType: string, data: string}
     */
    private function prepareDataUri(array $dataUri, int &$totalBytes): array
    {
        $this->assertImageSize(strlen($dataUri['binary_data']), $totalBytes);

        return [
            'type' => 'base64',
            'mimeType' => $dataUri['mime_type'],
            'data' => $dataUri['base64_data'],
        ];
    }

    /**
     * 下载远程参考图并转为 inlineData，始终清理临时文件。
     *
     * @return array{type: 'base64', mimeType: string, data: string}
     */
    private function prepareRemoteImage(string $image, int &$totalBytes): array
    {
        $downloadedFile = $this->downloader->download($image);
        $path = $downloadedFile->getRealPath();
        try {
            $this->assertImageSize($downloadedFile->getSize(), $totalBytes);
            $mimeType = strtolower(trim($downloadedFile->getMimeType()));
            if (! str_starts_with($mimeType, 'image/')) {
                throw new Exception(__('image_generate.reference_image_mime_type_unsupported'));
            }

            return [
                'type' => 'base64',
                'mimeType' => $mimeType,
                'data' => $this->encodeFile($path),
            ];
        } finally {
            if (is_file($path)) {
                @unlink($path);
            }
        }
    }

    /** 记录图片大小、Base64 体积和本次处理资源消耗。 */
    private function logPreparationMetrics(
        int $imageCount,
        int $originalTotalBytes,
        int $base64TotalBytes,
        float $startTime,
        int $startMemoryBytes
    ): void {
        $endMemoryBytes = memory_get_usage(true);
        di(LoggerFactory::class)->get(self::class)->info('Google 生图参考图 Base64 准备完成', [
            'image_count' => $imageCount,
            'original_total_bytes' => $originalTotalBytes,
            'original_total_mib' => round($originalTotalBytes / 1024 / 1024, 2),
            'base64_total_bytes' => $base64TotalBytes,
            'base64_total_mib' => round($base64TotalBytes / 1024 / 1024, 2),
            'memory_before_mib' => round($startMemoryBytes / 1024 / 1024, 2),
            'memory_after_mib' => round($endMemoryBytes / 1024 / 1024, 2),
            'memory_increase_mib' => round(max(0, $endMemoryBytes - $startMemoryBytes) / 1024 / 1024, 2),
            'process_peak_memory_mib' => round(memory_get_peak_usage(true) / 1024 / 1024, 2),
            'elapsed_ms' => round((microtime(true) - $startTime) * 1000, 2),
        ]);
    }

    private function assertImageSize(int $size, int &$totalBytes): void
    {
        if ($size <= 0 || $size > self::MAX_IMAGE_BYTES) {
            throw new Exception(__('image_generate.reference_image_single_size_exceeded'));
        }

        $totalBytes += $size;
        if ($totalBytes > self::MAX_IMAGES_BYTES) {
            throw new Exception(__('image_generate.reference_image_total_size_exceeded'));
        }
    }

    /**
     * 分块编码，避免同时在内存中保留完整二进制文件和 Base64 副本。
     */
    private function encodeFile(string $path): string
    {
        $handle = fopen($path, 'rb');
        if ($handle === false) {
            throw new Exception(__('image_generate.reference_image_file_open_failed'));
        }

        $encoded = '';
        $remainder = '';
        try {
            while (! feof($handle)) {
                $chunk = fread($handle, 1024 * 1024);
                if ($chunk === false) {
                    throw new Exception(__('image_generate.reference_image_file_read_failed'));
                }

                $chunk = $remainder . $chunk;
                $completeLength = strlen($chunk) - (strlen($chunk) % 3);
                if ($completeLength > 0) {
                    $encoded .= base64_encode(substr($chunk, 0, $completeLength));
                }
                $remainder = substr($chunk, $completeLength);
            }

            if ($remainder !== '') {
                $encoded .= base64_encode($remainder);
            }
        } finally {
            fclose($handle);
        }

        return $encoded;
    }
}
