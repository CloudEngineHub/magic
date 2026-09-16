<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use App\Infrastructure\Util\Middleware\RequestContextMiddleware;
use App\Interfaces\Asset\Facade\AssetApi;
use App\Interfaces\Middleware\Auth\UserAuthMiddleware;
use Hyperf\HttpServer\Router\Router;

Router::addGroup('/api/v1', static function (): void {
    Router::addGroup('/assets', static function (): void {
        // 创建合规素材。
        Router::post('', [AssetApi::class, 'create']);
        // 保存素材到个人库。
        Router::post('/library', [AssetApi::class, 'saveToLibrary']);
        // 查询资产列表。
        Router::post('/queries', [AssetApi::class, 'list']);
        // 查询标签树。
        Router::get('/tags', [AssetApi::class, 'tags']);
        // 创建标签。
        Router::post('/tags', [AssetApi::class, 'createTag']);
        // 修改标签。
        Router::put('/tags/{tagId:\d+}', [AssetApi::class, 'updateTag']);
        // 删除标签。
        Router::delete('/tags/{tagId:\d+}', [AssetApi::class, 'deleteTag']);
        // 更新素材标签关联。
        Router::put('/{assetId:\d+}/tags', [AssetApi::class, 'updateTags']);
        // 查询可转交归属人。
        Router::get('/owners', [AssetApi::class, 'owners']);
        // 批量转移素材归属人。
        Router::post('/transfer-owner', [AssetApi::class, 'transferOwner']);
        // 查询资产详情。
        Router::get('/{assetId:\d+}', [AssetApi::class, 'detail']);
        // 删除个人资产。
        Router::delete('/{assetId:\d+}', [AssetApi::class, 'delete']);
    });

    // 签署素材协议。
    Router::post('/asset-agreements', [AssetApi::class, 'signAgreement']);
    // 查询素材协议状态。
    Router::get('/asset-agreements', [AssetApi::class, 'agreementStatus']);
}, ['middleware' => [RequestContextMiddleware::class, UserAuthMiddleware::class]]);
