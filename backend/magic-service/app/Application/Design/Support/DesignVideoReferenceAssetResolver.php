<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Design\Support;

use App\Application\Asset\Service\AssetAppService;
use App\Domain\Design\Entity\DesignDataIsolation;
use App\Domain\Design\Entity\DesignGenerationTaskEntity;
use App\Domain\File\Service\FileDomainService;
use App\Domain\SuperMagic\File\Entity\TaskFileEntity;
use App\Domain\SuperMagic\File\Service\TaskFileDomainService;
use App\Infrastructure\Core\ValueObject\StorageBucketType;
use App\Infrastructure\Util\File\ProviderAssetUri;
use App\Interfaces\Asset\DTO\Request\CreateAssetRequestDTO;
use Dtyq\CloudFile\Kernel\Struct\UploadFile;
use Dtyq\CloudFile\Kernel\Utils\RemoteDownloadSecurityConfig;
use Dtyq\CloudFile\Kernel\Utils\SafeRemoteFileDownloader;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * 把生成视频请求里的 workspace 引用素材材质化为当前用户的个人资产。
 *
 * 仅对火山方舟（seedance/seedace）服务商生效：命中时遍历 reference_images/videos/audios/frames，
 * 将 workspace 相对路径解析后下载、算 hash，命中本人已有素材则复用，否则复制进私有桶并登记为个人资产，
 * 最后把 uri 改写为 asset://<assetId>，由网关透传。
 * 同一份文件（按 uri）在本请求内只解析一次：下载/算 hash/查重/上传都只发生一次，命中已有素材或直接复用均不再重复下载。
 *
 * 任意单条素材处理失败都退回原始 uri，不中断整个请求；asset:// 与无法解析的引用直接保留原样。
 */
final class DesignVideoReferenceAssetResolver
{
    /** 材质化覆盖的引用字段；mask 为单一遮罩，不在本次范围内。 */
    private const array MATERIALIZED_KEYS = [
        'reference_images',
        'reference_videos',
        'reference_audios',
        'frames',
    ];

    private readonly SafeRemoteFileDownloader $remoteFileDownloader;

    /** 本请求内按 uri 缓存解析结果：同一份文件只下载/算 hash/查重/上传一次，后续引用直接复用 asset://id。 */
    private array $resolvedCache = [];

    public function __construct(
        private readonly TaskFileDomainService $taskFileDomainService,
        private readonly FileDomainService $fileDomainService,
        private readonly AssetAppService $assetAppService,
        ?SafeRemoteFileDownloader $remoteFileDownloader = null,
    ) {
        // 下载器默认走显式安全配置；测试可注入 mock 以跳过真实网络下载。
        $this->remoteFileDownloader = $remoteFileDownloader ?? new SafeRemoteFileDownloader(new RemoteDownloadSecurityConfig(
            enabled: true,
            level: RemoteDownloadSecurityConfig::LEVEL_STANDARD,
            maxDownloadSize: 100 * 1024 * 1024,
            maxRedirects: 3,
        ));
    }

    public function resolve(DesignDataIsolation $dataIsolation, DesignGenerationTaskEntity $entity): void
    {
        $this->resolvedCache = [];

        $organizationCode = $dataIsolation->getCurrentOrganizationCode();
        $userId = $dataIsolation->getCurrentUserId();
        $projectId = $entity->getProjectId();

        $inputs = $entity->getInputPayload();
        $requestInputs = $entity->getRequestPayload()['inputs'] ?? [];

        foreach (self::MATERIALIZED_KEYS as $key) {
            if (array_key_exists($key, $inputs)) {
                $inputs[$key] = $this->materializeList($dataIsolation, $projectId, $organizationCode, $userId, $inputs[$key]);
            }
            if (array_key_exists($key, $requestInputs)) {
                $requestInputs[$key] = $this->materializeList($dataIsolation, $projectId, $organizationCode, $userId, $requestInputs[$key]);
            }
        }

        $entity->setInputPayload($inputs);
        $entity->setRequestPayload(array_merge($entity->getRequestPayload(), ['inputs' => $requestInputs]));
    }

    /**
     * @param array<int, array<string, mixed>> $items
     * @return array<int, array<string, mixed>>
     */
    private function materializeList(
        DesignDataIsolation $dataIsolation,
        int $projectId,
        string $organizationCode,
        string $userId,
        array $items,
    ): array {
        foreach ($items as &$item) {
            if (! is_array($item)) {
                continue;
            }
            $item['uri'] = $this->resolveUri(
                $dataIsolation,
                $projectId,
                $organizationCode,
                $userId,
                (string) ($item['uri'] ?? ''),
            );
        }
        unset($item);
        return $items;
    }

    private function resolveUri(
        DesignDataIsolation $dataIsolation,
        int $projectId,
        string $organizationCode,
        string $userId,
        string $uri,
    ): string {
        if (isset($this->resolvedCache[$uri])) {
            return $this->resolvedCache[$uri];
        }
        $resolved = $this->doResolveUri($dataIsolation, $projectId, $organizationCode, $userId, $uri);
        $this->resolvedCache[$uri] = $resolved;
        return $resolved;
    }

    private function doResolveUri(
        DesignDataIsolation $dataIsolation,
        int $projectId,
        string $organizationCode,
        string $userId,
        string $uri,
    ): string {
        if ($uri === '' || ProviderAssetUri::isValid($uri)) {
            return $uri;
        }
        $fileEntity = $this->taskFileDomainService->findEntityByRelativePath($projectId, $uri);
        if (! $fileEntity instanceof TaskFileEntity) {
            return $uri;
        }

        $url = $this->fileDomainService
            ->getLink($organizationCode, $fileEntity->getFileKey(), StorageBucketType::SandBox)
            ?->getUrl();
        if ($url === null || $url === '') {
            return $uri;
        }

        try {
            $downloaded = $this->remoteFileDownloader->download($url);
            $hash = hash_file('sha256', $downloaded->getRealPath());
        } catch (Throwable) {
            return $uri;
        }
        try {
            // 命中本人已有素材：直接复用其第三方素材 ID（provider_asset_id），不重复上传。
            // asset:// 会被网关原样透传给火山，火山只认它自己颁发的素材 ID，故必须用 provider_asset_id。
            $providerAssetId = $this->assetAppService->findPersonalProviderAssetId($dataIsolation, $userId, $hash);
            if ($providerAssetId !== null && $providerAssetId !== '') {
                return 'asset://' . $providerAssetId;
            }

            // 必须带上带扩展名的文件名：临时文件路径无后缀，会让私有桶 key 丢后缀，
            // 进而使 asset_media_type 推断失败、火山把视频/音频当图片处理（FormatUnsupported）。
            $uploadFile = new UploadFile($downloaded->getRealPath(), '', $downloaded->getName());
            $this->fileDomainService->uploadByCredential($organizationCode, $uploadFile);

            $asset = $this->assetAppService->createPersonalAsset($dataIsolation, $this->buildCreateDto($uploadFile->getKey(), $fileEntity->getFileName()));
            // 新建素材同步完成后才能拿到第三方素材 ID；取不到则退回原始 uri，保障本次请求可用。
            $providerAssetId = $this->assetAppService->findProviderAssetId($dataIsolation, $asset->getId());
            if ($providerAssetId === null || $providerAssetId === '') {
                return $uri;
            }
            return 'asset://' . $providerAssetId;
        } catch (Throwable $throwable) {
            di(LoggerInterface::class)->error(__METHOD__ . ':' . $throwable->getMessage());
            // 任何登记失败（如未签素材协议、上传异常）都退回原始 uri，不影响本次生成请求。
            return $uri;
        } finally {
            @unlink($downloaded->getRealPath());
        }
    }

    private function buildCreateDto(string $fileKey, string $name): CreateAssetRequestDTO
    {
        $dto = new CreateAssetRequestDTO();
        $dto->setAssetKind('ASSET');
        $dto->setAssetBusinessType('GENERAL');
        $dto->setNameI18n(['default' => $name]);
        $dto->setFileKey($fileKey);
        return $dto;
    }
}
