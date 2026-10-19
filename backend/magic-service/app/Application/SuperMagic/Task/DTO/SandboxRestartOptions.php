<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Task\DTO;

use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxRestartScope;

/**
 * 沙箱重启命令的输入参数.
 *
 * 集中一处默认值，命令层只负责解析 CLI、应用层只负责执行，避免默认值散落在
 * 两边、单测和线上行为不一致。
 */
readonly class SandboxRestartOptions
{
    /**
     * 释放前先挂起这些状态的任务/话题，避免"沙箱被重启"被下游误判成任务失败。
     *
     * waiting_for_user 必须包含：它代表 Agent 停下来等用户回答，
     * 此时 pod 仍被占用，重启后这条等待也不能被留成"沙箱不存在"的错误。
     *
     * @param string[] $statuses 传给网关的状态过滤（空数组=不过滤）
     */
    public function __construct(
        private bool $force = false,
        private SandboxRestartScope $scope = SandboxRestartScope::All,
        private string $clawCode = '',
        private int $limit = 0,
        private array $statuses = [],
        private bool $dryRun = false,
        private int $concurrency = 1,
    ) {
    }

    public function isForce(): bool
    {
        return $this->force;
    }

    public function getScope(): SandboxRestartScope
    {
        return $this->scope;
    }

    /**
     * 仅 Magic Claw 范围使用：只处理这只 Claw 的沙箱.
     */
    public function getClawCode(): string
    {
        return $this->clawCode;
    }

    /**
     * 最多重启多少个话题，0 表示不限.
     */
    public function getLimit(): int
    {
        return max(0, $this->limit);
    }

    /**
     * @return string[]
     */
    public function getStatuses(): array
    {
        return $this->statuses;
    }

    public function isDryRun(): bool
    {
        return $this->dryRun;
    }

    public function getConcurrency(): int
    {
        return max(1, $this->concurrency);
    }
}
