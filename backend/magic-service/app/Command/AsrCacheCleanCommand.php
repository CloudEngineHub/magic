<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Command;

use App\Domain\Asr\Constants\AsrRedisKeys;
use Hyperf\Command\Annotation\Command;
use Hyperf\Command\Command as HyperfCommand;
use Hyperf\Redis\Redis;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputOption;
use Throwable;

#[Command]
class AsrCacheCleanCommand extends HyperfCommand
{
    protected ?string $name = 'asr:cache:clean';

    public function __construct(
        private readonly Redis $redis,
    ) {
        parent::__construct();
    }

    public function configure(): void
    {
        parent::configure();
        $this->setDescription('Clean all ASR Redis caches associated with a task_key');
        $this->addArgument('task_key', InputArgument::REQUIRED, 'ASR task_key');
        $this->addOption('user-id', 'u', InputOption::VALUE_REQUIRED, 'User ID (required: Redis key is md5(user_id:task_key))');
        $this->addOption('dry-run', null, InputOption::VALUE_NONE, 'Only show which keys would be deleted, without actually deleting');
        $this->addOption('yes', 'y', InputOption::VALUE_NONE, 'Skip confirmation');
    }

    public function handle(): void
    {
        $taskKey = (string) $this->input->getArgument('task_key');
        $userId = $this->getStringOption('user-id');

        if ($taskKey === '') {
            $this->error('task_key is required.');
            return;
        }

        if ($userId === null) {
            $this->error('Missing --user-id. Redis key is built from md5(user_id:task_key), so user_id is required.');
            $this->line('Usage: php bin/hyperf.php asr:cache:clean <task_key> --user-id=<user_id>');
            return;
        }

        try {
            $this->clean($taskKey, $userId);
        } catch (Throwable $e) {
            $this->error($e->getMessage());
        }
    }

    private function clean(string $taskKey, string $userId): void
    {
        $isDryRun = (bool) $this->input->getOption('dry-run');
        $hash = md5(sprintf('%s:%s', $userId, $taskKey));

        $this->line(sprintf('task_key=%s  user_id=%s  hash=%s', $taskKey, $userId, $hash));

        $keys = [
            'task_hash' => sprintf(AsrRedisKeys::TASK_HASH, $hash),
            'heartbeat' => sprintf(AsrRedisKeys::HEARTBEAT, $hash),
            'summary_lock' => sprintf(AsrRedisKeys::SUMMARY_LOCK, $hash),
            'summary_mq_retry' => sprintf(AsrRedisKeys::SUMMARY_MQ_RETRY, $hash),
            'summary_mq_retry_lock' => sprintf(AsrRedisKeys::SUMMARY_MQ_RETRY_LOCK, $hash),
            'summary_chat_dedup' => sprintf(AsrRedisKeys::SUMMARY_CHAT_DEDUP, $hash),
            'finish_recording_lock' => sprintf(AsrRedisKeys::FINISH_RECORDING_LOCK, $hash),
            'merging_recovery_retry' => sprintf(AsrRedisKeys::MERGING_RECOVERY_RETRY_COUNT, $hash),
        ];

        $rows = [];
        $toDelete = [];
        foreach ($keys as $label => $redisKey) {
            $exists = $this->redis->exists($redisKey);
            $exists = is_int($exists) && $exists > 0;
            $ttl = $exists ? (int) $this->redis->ttl($redisKey) : -2;
            $rows[] = [$label, $redisKey, $exists ? 'yes' : 'no', (string) $ttl];
            if ($exists) {
                $toDelete[$label] = $redisKey;
            }
        }

        $this->table(['key_type', 'redis_key', 'exists', 'ttl'], $rows);

        $existing = count($toDelete);
        if ($existing === 0) {
            $this->warn('No existing keys found. Nothing to clean.');
            return;
        }

        if ($isDryRun) {
            $this->info(sprintf('[dry-run] Would delete %d key(s).', $existing));
            return;
        }

        if (! $this->shouldContinue(sprintf('Confirm delete %d key(s)?', $existing))) {
            $this->info('Canceled.');
            return;
        }

        $deleted = 0;
        foreach ($toDelete as $label => $redisKey) {
            $result = (int) $this->redis->del($redisKey);
            if ($result > 0) {
                $this->info(sprintf('  Deleted: %s (%s)', $label, $redisKey));
                ++$deleted;
            } else {
                $this->error(sprintf('  Failed:  %s (%s)', $label, $redisKey));
            }
        }

        $this->line('');
        $this->line(sprintf('Done: %d/%d key(s) deleted.', $deleted, $existing));
    }

    private function shouldContinue(string $question): bool
    {
        if ((bool) $this->input->getOption('yes')) {
            return true;
        }

        return $this->confirm($question, false);
    }

    private function getStringOption(string $name): ?string
    {
        $value = $this->input->getOption($name);
        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);
        return $value === '' ? null : $value;
    }
}
