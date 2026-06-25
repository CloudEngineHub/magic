<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
return [
    // 是否验证图片格式，默认 true；设为 false 时 isImage 跳过格式校验直接返回 true
    'check_image_format' => true,
    // 远程文件下载防护配置；默认关闭，避免影响历史远程 URL 上传行为
    'remote_download_security' => [
        // 是否启用远程下载防护；默认 false，关闭时走历史下载逻辑，不限制协议、端口、IP、大小和重定向
        'enabled' => false,
        // 防护等级；enabled=true 时生效。strict 仅允许 https:443；standard 允许 http/https 默认端口；compatible 允许 http/https 任意端口
        'level' => 'strict',
        // 单个远程文件最大下载字节数；enabled=true 时生效，用于降低超大文件导致的资源消耗风险
        'max_download_size' => 100 * 1024 * 1024,
        // 最大重定向次数；enabled=true 时生效，每次重定向后的目标地址都会重新执行安全校验
        'max_redirects' => 3,
        // 远程地址 IP 防护配置；enabled=true 时生效，可按地址类型单独开关
        'ip_protection' => [
            // 是否拒绝私网地址，例如 10.0.0.0/8、172.16.0.0/12、192.168.0.0/16、fc00::/7
            'block_private_ip' => true,
            // 是否拒绝回环地址，例如 127.0.0.0/8、::1/128
            'block_loopback_ip' => true,
            // 是否拒绝本地链路地址，例如 169.254.0.0/16、fe80::/10
            'block_link_local_ip' => true,
            // 是否拒绝保留地址，例如 0.0.0.0/8、100.64.0.0/10、文档网段和组播/保留网段
            'block_reserved_ip' => true,
            // 是否拒绝云厂商元数据地址，例如 169.254.169.254、100.100.100.200、100.96.0.96
            'block_cloud_metadata_ip' => true,
            // 额外拒绝的精确 IP 列表；用于按部署环境补充黑名单
            'extra_blocked_ips' => [],
            // 额外拒绝的 CIDR 列表；用于按部署环境补充网段黑名单
            'extra_blocked_cidrs' => [],
        ],
    ],
    'storages' => [
        'file_service' => [
            'adapter' => 'file_service',
            'config' => [
                'host' => '',
                'platform' => '',
                'key' => '',
            ],
        ],
        'aliyun' => [
            'adapter' => 'aliyun',
            'config' => [
                'accessId' => '',
                'accessSecret' => '',
                'bucket' => '',
                'endpoint' => '',
                'role_arn' => '',
            ],
        ],
        'tos' => [
            'adapter' => 'tos',
            'config' => [
                'region' => '',
                'endpoint' => '',
                'ak' => '',
                'sk' => '',
                'bucket' => '',
                'trn' => '',
            ],
        ],
        'minio' => [
            'adapter' => 'minio',
            'config' => [
                // MinIO 对外访问地址，返回给前端的直传/预签名 URL 使用此地址
                'endpoint' => '',
                // MinIO 集群内访问地址，仅供服务端 SDK 读写对象使用，不应返回给前端
                'internal_endpoint' => '',
                // 区域，默认 us-east-1
                'region' => '',
                // Access Key
                'accessKey' => '',
                // Secret Key
                'secretKey' => '',
                // 存储桶名称
                'bucket' => '',
                // MinIO 必须使用 path-style 访问
                'use_path_style_endpoint' => true,
                // SDK 版本
                'version' => 'latest',
                // 可选：STS 能力（分片上传、预签名 URL、对象管理等）依赖的 Role ARN
                'role_arn' => '',
                // 可选：STS 服务端点（如果与主服务不同）
                'sts_endpoint' => '',
            ],
            // 可选：是否公开读
            'public_read' => false,
            // 可选：默认选项
            'options' => [],
        ],
    ],
];
