<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\CloudFile\Kernel\Utils;

use Dtyq\CloudFile\Kernel\Exceptions\CloudFileException;
use Dtyq\CloudFile\Kernel\Struct\DownloadedRemoteFile;
use Throwable;

/**
 * 安全远程文件下载器，统一处理 SSRF 防护、重定向和下载大小限制。
 */
class SafeRemoteFileDownloader
{
    private RemoteDownloadSecurityConfig $securityConfig;

    private RemoteUrlSecurityValidator $urlSecurityValidator;

    public function __construct(?RemoteDownloadSecurityConfig $securityConfig = null, ?RemoteUrlSecurityValidator $urlSecurityValidator = null)
    {
        $this->securityConfig = $securityConfig ?? RemoteDownloadSecurityConfig::current();
        $this->urlSecurityValidator = $urlSecurityValidator ?? new RemoteUrlSecurityValidator($this->securityConfig);
    }

    /**
     * 下载远程 URL 或 base64 图片到受控临时文件。
     */
    public function download(string $source): DownloadedRemoteFile
    {
        if (EasyFileTools::isBase64Image($source)) {
            return $this->decodeBase64Image($source);
        }

        if (! $this->securityConfig->isEnabled()) {
            return $this->downloadUrlWithoutProtection($source);
        }

        return $this->downloadUrl($source);
    }

    /**
     * 使用历史方式下载远程文件，兼容未开启防护时的既有行为。
     */
    private function downloadUrlWithoutProtection(string $url): DownloadedRemoteFile
    {
        $tempFile = $this->createTempFile();

        try {
            $inputStream = fopen($url, 'r');
            if (! $inputStream) {
                throw new CloudFileException(sprintf('Download remote file failed: %s', $url));
            }

            $outputStream = fopen($tempFile, 'wb');
            if (! $outputStream) {
                fclose($inputStream);
                throw new CloudFileException('Open temporary file failed');
            }

            while ($data = fread($inputStream, 1024)) {
                fwrite($outputStream, $data);
            }

            fclose($inputStream);
            fclose($outputStream);

            return $this->buildDownloadedFile($tempFile, $url);
        } catch (Throwable $throwable) {
            if (is_file($tempFile)) {
                @unlink($tempFile);
            }
            throw $throwable;
        }
    }

    /**
     * 按受控方式下载 HTTPS URL，重定向后的每个目标都会重新校验。
     */
    private function downloadUrl(string $url): DownloadedRemoteFile
    {
        $currentUrl = $url;
        $tempFile = $this->createTempFile();

        try {
            for ($redirectCount = 0; $redirectCount <= $this->securityConfig->getMaxRedirects(); ++$redirectCount) {
                $safeUrl = $this->urlSecurityValidator->validate($currentUrl);
                $response = $this->requestToFile($safeUrl, $tempFile);

                if ($response['status'] >= 300 && $response['status'] < 400) {
                    if ($response['location'] === '') {
                        throw new CloudFileException(sprintf('Remote file redirect location is empty: %s', $currentUrl));
                    }
                    $currentUrl = $this->resolveRedirectUrl($currentUrl, $response['location']);
                    continue;
                }

                if ($response['status'] < 200 || $response['status'] >= 300) {
                    throw new CloudFileException(sprintf('Download remote file failed, status: %d', $response['status']));
                }

                return $this->buildDownloadedFile($tempFile, $currentUrl);
            }

            throw new CloudFileException('Remote file redirect count exceeded');
        } catch (Throwable $throwable) {
            if (is_file($tempFile)) {
                @unlink($tempFile);
            }
            throw $throwable;
        }
    }

    /**
     * 使用 cURL 固定已校验 IP 下载文件，避免 DNS 解析与最终连接目标不一致。
     *
     * @param array{url: string, host: string, port: int, ip: string} $safeUrl
     * @return array{status: int, location: string}
     */
    private function requestToFile(array $safeUrl, string $tempFile): array
    {
        $outputStream = fopen($tempFile, 'wb');
        if (! $outputStream) {
            throw new CloudFileException('Open temporary file failed');
        }

        $location = '';
        $downloadedSize = 0;
        $exceedSizeLimit = false;
        $ch = curl_init();
        try {
            curl_setopt($ch, CURLOPT_URL, $safeUrl['url']);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
            curl_setopt($ch, CURLOPT_TIMEOUT, 60);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
            curl_setopt($ch, CURLOPT_RESOLVE, [
                sprintf('%s:%d:%s', $safeUrl['host'], $safeUrl['port'], $safeUrl['ip']),
            ]);

            $protocolMask = $this->securityConfig->getCurlProtocolMask();
            if ($protocolMask > 0 && defined('CURLOPT_PROTOCOLS')) {
                curl_setopt($ch, CURLOPT_PROTOCOLS, $protocolMask);
            }
            if ($protocolMask > 0 && defined('CURLOPT_REDIR_PROTOCOLS')) {
                curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS, $protocolMask);
            }

            $maxDownloadSize = $this->securityConfig->getMaxDownloadSize();

            curl_setopt($ch, CURLOPT_HEADERFUNCTION, static function ($ch, string $headerLine) use (&$location, &$exceedSizeLimit, $maxDownloadSize): int {
                $length = strlen($headerLine);
                $headerLine = trim($headerLine);
                if ($headerLine === '' || ! str_contains($headerLine, ':')) {
                    return $length;
                }

                [$name, $value] = array_map('trim', explode(':', $headerLine, 2));
                $lowerName = strtolower($name);
                if ($lowerName === 'location') {
                    $location = $value;
                }
                if ($lowerName === 'content-length' && (int) $value > $maxDownloadSize) {
                    $exceedSizeLimit = true;
                    return 0;
                }

                return $length;
            });

            curl_setopt($ch, CURLOPT_WRITEFUNCTION, static function ($ch, string $data) use ($outputStream, &$downloadedSize, &$exceedSizeLimit, $maxDownloadSize): int {
                $dataLength = strlen($data);
                $downloadedSize += $dataLength;
                if ($downloadedSize > $maxDownloadSize) {
                    $exceedSizeLimit = true;
                    return 0;
                }

                $written = fwrite($outputStream, $data);
                if ($written === false) {
                    return 0;
                }

                return $written;
            });

            $result = curl_exec($ch);
            if ($result === false) {
                if ($exceedSizeLimit) {
                    throw new CloudFileException('Remote file size exceeds limit');
                }
                throw new CloudFileException(sprintf('Download remote file failed: %s', curl_error($ch)));
            }

            if ($exceedSizeLimit) {
                throw new CloudFileException('Remote file size exceeds limit');
            }

            return [
                'status' => (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE),
                'location' => $location,
            ];
        } finally {
            curl_close($ch);
            fclose($outputStream);
        }
    }

    /**
     * 解码 base64 图片到临时文件，保持历史 base64 上传能力。
     */
    private function decodeBase64Image(string $source): DownloadedRemoteFile
    {
        [$header, $imageData] = explode(',', $source, 2);
        $decodedData = base64_decode($imageData, true);
        if ($decodedData === false) {
            throw new CloudFileException('Invalid base64 image data');
        }
        if ($this->securityConfig->isEnabled() && strlen($decodedData) > $this->securityConfig->getMaxDownloadSize()) {
            throw new CloudFileException('Base64 image size exceeds limit');
        }

        $tempFile = $this->createTempFile();
        if (file_put_contents($tempFile, $decodedData) === false) {
            @unlink($tempFile);
            throw new CloudFileException('Write base64 image failed');
        }

        $mimeType = mime_content_type($tempFile) ?: $this->getMimeTypeFromBase64Header($header);
        $extension = MimeTypes::getExtension($mimeType);

        return new DownloadedRemoteFile(
            realPath: $tempFile,
            name: 'upload.' . $extension,
            mimeType: $mimeType,
            size: filesize($tempFile) ?: 0,
        );
    }

    /**
     * 构造下载结果并从 URL 路径推导文件名。
     */
    private function buildDownloadedFile(string $tempFile, string $url): DownloadedRemoteFile
    {
        $size = filesize($tempFile);
        if (! is_int($size) || $size <= 0) {
            throw new CloudFileException(sprintf('Download remote file is empty: %s', $url));
        }

        $mimeType = mime_content_type($tempFile) ?: 'application/octet-stream';
        $path = parse_url($url, PHP_URL_PATH);
        $name = is_string($path) ? pathinfo($path, PATHINFO_BASENAME) : '';
        if ($name === '') {
            $name = 'remote-file.' . MimeTypes::getExtension($mimeType);
        }
        if (pathinfo($name, PATHINFO_EXTENSION) === '') {
            $name .= '.' . MimeTypes::getExtension($mimeType);
        }

        return new DownloadedRemoteFile(
            realPath: $tempFile,
            name: $name,
            mimeType: $mimeType,
            size: $size,
        );
    }

    /**
     * 解析重定向地址，支持绝对 HTTPS URL 和同源相对路径。
     */
    private function resolveRedirectUrl(string $currentUrl, string $location): string
    {
        if (parse_url($location, PHP_URL_SCHEME) !== null) {
            return $location;
        }

        $parts = parse_url($currentUrl);
        if (! is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            throw new CloudFileException('Resolve redirect url failed');
        }

        $scheme = $parts['scheme'];
        $host = $parts['host'];
        $port = isset($parts['port']) ? ':' . $parts['port'] : '';
        if (str_starts_with($location, '/')) {
            return "{$scheme}://{$host}{$port}{$location}";
        }

        $basePath = isset($parts['path']) ? rtrim(dirname($parts['path']), '/') : '';
        return "{$scheme}://{$host}{$port}{$basePath}/{$location}";
    }

    /**
     * 创建下载用临时文件。
     */
    private function createTempFile(): string
    {
        $tempFile = tempnam(sys_get_temp_dir(), 'cloud-file-tmp-');
        if (! is_string($tempFile)) {
            throw new CloudFileException('Create temporary file failed');
        }

        return $tempFile;
    }

    /**
     * 从 base64 data-uri 头部读取 MIME 类型。
     */
    private function getMimeTypeFromBase64Header(string $header): string
    {
        if (preg_match('/^data:(image\/[a-zA-Z0-9.+-]+);base64$/', $header, $matches)) {
            return $matches[1];
        }

        return 'application/octet-stream';
    }
}
