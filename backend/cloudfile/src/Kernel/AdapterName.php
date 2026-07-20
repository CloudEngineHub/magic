<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\CloudFile\Kernel;

use Dtyq\CloudFile\Kernel\Exceptions\CloudFileException;

class AdapterName
{
    /**
     * 阿里云oss.
     */
    public const ALIYUN = 'aliyun';

    /**
     * 火山云.
     */
    public const TOS = 'tos';

    /**
     * 华为云.
     */
    public const OBS = 'obs';

    /**
     * 文件服务.
     */
    public const FILE_SERVICE = 'file_service';

    /**
     * 本地文件系统.
     */
    public const LOCAL = 'local';

    /**
     * MinIO（底层复用 S3 协议实现）.
     */
    public const MINIO = 'minio';

    public static function form(string $adapterName): string
    {
        return match (strtolower($adapterName)) {
            'aliyun', 'oss' => self::ALIYUN,
            'tos' => self::TOS,
            'obs' => self::OBS,
            'file_service' => self::FILE_SERVICE,
            'local' => self::LOCAL,
            'minio' => self::MINIO,
            default => throw new CloudFileException("adapter not found | [{$adapterName}]"),
        };
    }

    public static function checkConfig(string $adapterName, array $config): array
    {
        // 检测必填参数
        switch (self::form($adapterName)) {
            case self::ALIYUN:
                if (empty($config['accessId']) || empty($config['accessSecret']) || empty($config['bucket']) || empty($config['endpoint'])) {
                    throw new CloudFileException('config error');
                }
                break;
            case self::OBS:
            case self::TOS:
                if (empty($config['ak']) || empty($config['sk']) || empty($config['bucket']) || empty($config['endpoint']) || empty($config['region'])) {
                    throw new CloudFileException("config error | [{$adapterName}]");
                }
                break;
            case self::FILE_SERVICE:
                if (empty($config['host']) || empty($config['platform']) || empty($config['key'])) {
                    throw new CloudFileException("config error | [{$adapterName}]");
                }
                break;
            case self::MINIO:
                if (empty($config['accessKey']) || empty($config['secretKey']) || empty($config['bucket']) || empty($config['endpoint']) || empty($config['region'])) {
                    throw new CloudFileException("config error | [{$adapterName}]");
                }
                break;
            case self::LOCAL:
                break;
            default:
                throw new CloudFileException("adapter not found | [{$adapterName}]");
        }
        return $config;
    }

    /**
     * 根据存储适配器和运行选项解析 endpoint 配置.
     */
    public static function applyEndpointOptions(string $adapterName, array $config, array $options = []): array
    {
        if (empty($config['endpoint']) || ! is_string($config['endpoint'])) {
            return $config;
        }

        $adapterName = self::form($adapterName);
        $specialConfig = array_merge($config, $options);
        $config['endpoint'] = self::smartReplaceEndpoint($adapterName, $config['endpoint'], $specialConfig);

        return $config;
    }

    /**
     * 根据运行选项智能替换云存储 endpoint.
     */
    public static function smartReplaceEndpoint(string $adapterName, string $endpoint, array $specialConfig = []): string
    {
        if (self::shouldUseInternalEndpoint($specialConfig)) {
            switch (self::form($adapterName)) {
                case self::ALIYUN:
                    // 阿里云 OSS 内网地址：oss-cn-shenzhen.aliyuncs.com -> oss-cn-shenzhen-internal.aliyuncs.com
                    if (! str_contains($endpoint, '-internal.aliyuncs.com')) {
                        $endpoint = str_replace('.aliyuncs.com', '-internal.aliyuncs.com', $endpoint);
                    }
                    break;
                case self::TOS:
                    // 火山 TOS 内网地址：tos-cn-beijing.volces.com -> tos-cn-beijing.ivolces.com
                    $endpoint = str_replace('.volces.com', '.ivolces.com', $endpoint);
                    break;
                default:
                    break;
            }
        }

        if (! empty($specialConfig['specify_endpoint']) && is_string($specialConfig['specify_endpoint'])) {
            $endpoint = $specialConfig['specify_endpoint'];
        }

        return $endpoint;
    }

    /**
     * 判断是否需要使用云存储内网 endpoint.
     */
    private static function shouldUseInternalEndpoint(array $specialConfig): bool
    {
        if (! isset($specialConfig['internal_endpoint'])) {
            return false;
        }

        if (is_bool($specialConfig['internal_endpoint'])) {
            return $specialConfig['internal_endpoint'];
        }

        return filter_var($specialConfig['internal_endpoint'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) === true;
    }
}
