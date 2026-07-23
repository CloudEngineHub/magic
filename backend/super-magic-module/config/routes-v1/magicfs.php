<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use App\Interfaces\Middleware\Auth\SandboxUserAuthMiddleware;
use Dtyq\SuperMagic\Interfaces\MagicFS\Facade\MagicFSApi;
use Hyperf\HttpServer\Router\Router;

/*
 * MagicFS 文件系统 API 路由
 *
 * 这些 API 用于支持 AGFS magicfs 插件挂载 Magic 项目文件系统
 */
Router::addGroup(
    '/api/v1/open-api/magicfs',
    static function () {
        // 根据项目 ID 获取项目根目录 file_id（agfs-server 动态挂载 referenced-project 时调用）
        Router::get('/projects/{projectId}/root-file-id', [MagicFSApi::class, 'getProjectRootFileId']);

        Router::addGroup('/files', static function () {
            // 列出目录内容
            Router::post('/queries', [MagicFSApi::class, 'listFiles']);

            // 批量获取文件版本号（需要在 /{id}/queries 之前定义，避免路由冲突）
            Router::post('/versions', [MagicFSApi::class, 'getFileVersions']);

            // 写权限预检（无副作用）。与 updateFile 同套鉴权（EDITOR），
            // 供 magicfs 客户端在写 S3 / 本地缓存之前确认当前用户具备写权限，
            // 避免先写 S3 再被元数据服务拒绝导致数据不一致。
            Router::post('/{id}/check-access', [MagicFSApi::class, 'checkFileAccess']);

            // 获取文件信息
            Router::post('/{id}/queries', [MagicFSApi::class, 'getFileInfo']);

            // 创建文件或目录
            Router::post('', [MagicFSApi::class, 'createFile']);

            // 更新文件元数据
            Router::put('/{id}', [MagicFSApi::class, 'updateFile']);

            // 删除文件或目录
            Router::delete('/{id}', [MagicFSApi::class, 'deleteFile']);

            // 获取文件树
            Router::post('/{id}/tree', [MagicFSApi::class, 'getFileTree']);

            // 获取单个文件版本号
            Router::get('/{id}/version', [MagicFSApi::class, 'getFileVersion']);
        });
    },
    ['middleware' => [SandboxUserAuthMiddleware::class]]
);
