<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Common\RecycleBin\Command;

use App\Domain\SuperMagic\Common\RecycleBin\Enum\RecycleBinResourceType;
use App\Domain\SuperMagic\File\Repository\Facade\TaskFileRepositoryInterface;
use Hyperf\Command\Annotation\Command;
use Hyperf\Command\Command as HyperfCommand;
use Hyperf\DbConnection\Db;
use InvalidArgumentException;
use Symfony\Component\Console\Input\InputOption;

/**
 * 一次性补齐旧回收站的隐藏快照。默认只读，确认范围后使用 --apply。
 * 按输出的 after-id / through-id 续跑；不修改文件、删除时间或清理状态。
 */
#[Command]
class BackfillRecycleBinHiddenFilesCommand extends HyperfCommand
{
    private const BATCH_SIZE = 500;

    public function __construct(private readonly TaskFileRepositoryInterface $taskFileRepository)
    {
        parent::__construct('recycle-bin:backfill-hidden-files');
    }

    public function configure(): void
    {
        parent::configure();
        $this->setDescription('根据文件已有 is_hidden 标记补齐回收站可见性，默认只读预览');
        $this->addOption('project-id', null, InputOption::VALUE_REQUIRED, '仅处理指定项目');
        $this->addOption('after-id', null, InputOption::VALUE_REQUIRED, '从此回收站 ID 之后开始', '0');
        $this->addOption('through-id', null, InputOption::VALUE_REQUIRED, '处理到此回收站 ID 为止；默认固定启动时上界');
        $this->addOption('apply', null, InputOption::VALUE_NONE, '执行隐藏标记回填');
    }

    public function handle(): void
    {
        $projectId = $this->readIdOption('project-id');
        $afterId = $this->readIdOption('after-id', true) ?? 0;
        $throughId = $this->readIdOption('through-id', true);
        $apply = (bool) $this->input->getOption('apply');
        $baseQuery = Db::table('magic_recycle_bin')
            ->where('resource_type', RecycleBinResourceType::File->value)
            ->whereNull('removed_at')
            ->where('is_hidden', false);
        if ($projectId !== null) {
            $baseQuery->where('parent_id', $projectId);
        }
        $throughId ??= (int) (clone $baseQuery)->max('id');
        $scanned = 0;
        $hidden = 0;
        $missing = 0;
        $updated = 0;
        $this->info(sprintf('mode=%s project_id=%s after_id=%d through_id=%d', $apply ? 'apply' : 'preview', $projectId ?? 'all', $afterId, $throughId));

        while ($afterId < $throughId) {
            $rows = (clone $baseQuery)->where('id', '>', $afterId)->where('id', '<=', $throughId)
                ->orderBy('id')->limit(self::BATCH_SIZE)->get(['id', 'resource_id']);
            if ($rows->isEmpty()) {
                break;
            }

            $fileIds = [];
            foreach ($rows as $row) {
                $fileIds[] = (int) $row->resource_id;
            }
            $files = [];
            foreach ($this->taskFileRepository->getFilesByIdsWithTrash($fileIds, $projectId ?? 0) as $file) {
                $files[$file->getFileId()] = $file;
            }
            $hiddenIds = [];
            foreach ($rows as $row) {
                ++$scanned;
                $file = $files[(int) $row->resource_id] ?? null;
                if ($file === null) {
                    // 缺失实体不能凭目录名或空间推断隐藏，保留原记录并报告未处理数量。
                    ++$missing;
                } elseif ($file->getIsHidden()) {
                    $hiddenIds[] = (int) $row->id;
                }
            }
            $hidden += count($hiddenIds);
            if ($apply && $hiddenIds !== []) {
                $updated += (clone $baseQuery)->whereIn('id', $hiddenIds)->update(['is_hidden' => true]);
            }
            $afterId = (int) $rows->last()->id;
            $this->line(sprintf('after_id=%d through_id=%d scanned=%d hidden=%d missing=%d updated=%d', $afterId, $throughId, $scanned, $hidden, $missing, $updated));
        }
        $this->info(sprintf('完成：检查 %d 条，隐藏候选 %d 条，已更新 %d 条，缺失文件实体 %d 条。', $scanned, $hidden, $updated, $missing));
    }

    private function readIdOption(string $name, bool $allowZero = false): ?int
    {
        $value = $this->input->getOption($name);
        if ($value === null) {
            return null;
        }
        $id = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => $allowZero ? 0 : 1]]);
        if ($id === false) {
            throw new InvalidArgumentException(sprintf('--%s 必须为有效整数 ID', $name));
        }
        return $id;
    }
}
