<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Asset\Entity\ValueObject;

/**
 * 素材合规校验状态：面向业务展示的三态，由 {@see AssetSyncStatus} 归并而来。
 *
 * 与同步状态的区别：同步状态是本地与第三方对齐的工程状态（含 PENDING/SYNCING 两个中间态），
 * 这里是给前端展示的结论——只要还没有结论，一律算「未校验」。
 */
enum AssetComplianceStatus: string
{
    /** 尚未有校验结论：从未提交，或第三方仍在审核中。 */
    case UNVERIFIED = 'UNVERIFIED';

    /** 校验通过，素材可用于后续推理。 */
    case PASSED = 'PASSED';

    /** 校验未通过，具体原因见 magic_assets.sync_failed_reason。 */
    case FAILED = 'FAILED';

    /**
     * 由资产类型与同步状态推导。
     *
     * 素材组只是本地层级、不参与第三方合规校验，恒为「未校验」——若按 PASSED 映射成「已通过」，
     * 会让前端误以为素材组也过了审。
     */
    public static function forAsset(AssetKind $assetKind, AssetSyncStatus $syncStatus): self
    {
        if ($assetKind->isGroup()) {
            return self::UNVERIFIED;
        }
        return match ($syncStatus) {
            AssetSyncStatus::PASSED => self::PASSED,
            AssetSyncStatus::FAILED => self::FAILED,
            default => self::UNVERIFIED,
        };
    }

    public function isFailed(): bool
    {
        return $this === self::FAILED;
    }
}
