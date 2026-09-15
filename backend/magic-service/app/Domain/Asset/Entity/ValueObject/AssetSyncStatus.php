<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Asset\Entity\ValueObject;

/**
 * 本地资产与第三方素材服务的同步状态。
 *
 * 与 {@see AssetStatus}（对用户是否启用）正交：`status` 表达业务上的显示/隐藏，
 * `sync_status` 表达本地记录是否已与第三方对齐。未同步完成的资产一律不对外展示。
 *
 * 只有素材（ASSET）会经过 PENDING → SYNCING → SYNCED/FAILED；
 * 素材组（GROUP）不同步第三方，落库后直接是 SYNCED。
 */
enum AssetSyncStatus: string
{
    case PENDING = 'PENDING';
    case SYNCING = 'SYNCING';
    case SYNCED = 'SYNCED';
    case FAILED = 'FAILED';

    /**
     * 容忍大小写差异，并兼容改造前用 tinyint 存储的历史取值（0待同步 1同步中 2已同步 3同步失败）。
     * 无法识别时按待同步处理：宁可不让它对外展示，也不让一行脏数据把列表查询打断。
     */
    public static function fromValue(mixed $value): self
    {
        if ($value instanceof self) {
            return $value;
        }
        $raw = strtoupper(trim((string) $value));
        return self::tryFrom($raw) ?? match ($raw) {
            '0' => self::PENDING,
            '1' => self::SYNCING,
            '2' => self::SYNCED,
            '3' => self::FAILED,
            default => self::PENDING,
        };
    }

    public function isSynced(): bool
    {
        return $this === self::SYNCED;
    }

    public function isFailed(): bool
    {
        return $this === self::FAILED;
    }

    /**
     * 尚无最终结论：既不能对外展示，也不能当作终态处理。
     */
    public function isInProgress(): bool
    {
        return $this === self::PENDING || $this === self::SYNCING;
    }
}
