<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Command;

use App\Domain\Contact\Entity\ValueObject\AccountStatus;
use App\Domain\Contact\Service\MagicAccountRevocationService;
use Hyperf\Command\Annotation\Command;
use Hyperf\Command\Command as HyperfCommand;
use Hyperf\DbConnection\Db;
use Symfony\Component\Console\Input\InputOption;
use Throwable;

#[Command]
class DisableMagicAccountCommand extends HyperfCommand
{
    public function __construct(
        private readonly MagicAccountRevocationService $revocationService,
    ) {
        parent::__construct('account:disable');
    }

    public function configure(): void
    {
        parent::configure();
        $this->setDescription('封禁 Magic 账号，禁止该账号继续登录使用');
        $this->addOption('magic-id', null, InputOption::VALUE_REQUIRED, '要封禁的 Magic ID');
        $this->addOption('phone', null, InputOption::VALUE_REQUIRED, '要封禁的手机号（必须唯一匹配账号）');
        $this->addOption('email', null, InputOption::VALUE_REQUIRED, '要封禁的邮箱域名（例如 example.com）');
        $this->addOption('execute', null, InputOption::VALUE_NONE, '确认执行禁用及凭证撤销');
    }

    public function handle(): int
    {
        $magicId = trim((string) ($this->input->getOption('magic-id') ?? ''));
        $phone = trim((string) ($this->input->getOption('phone') ?? ''));
        $emailDomain = trim((string) ($this->input->getOption('email') ?? ''), " \t\n\r\0\x0B@");

        if (count(array_filter([$magicId, $phone, $emailDomain], static fn (string $value): bool => $value !== '')) !== 1) {
            $this->error('必须且只能提供 --magic-id、--phone 或 --email 其中一个参数。');
            return self::FAILURE;
        }

        if ($emailDomain !== '' && preg_match('/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/', $emailDomain) !== 1) {
            $this->error('--email 必须是合法的邮箱域名，例如 example.com。');
            return self::FAILURE;
        }

        try {
            $accounts = Db::table('magic_contact_accounts')
                ->select(['magic_id', 'phone', 'email', 'status'])
                ->whereNull('deleted_at')
                ->when($magicId !== '', static fn ($query) => $query->where('magic_id', $magicId))
                ->when($phone !== '', static fn ($query) => $query->where('phone', $phone))
                ->when($emailDomain !== '', static fn ($query) => $query->where('email', 'like', '%@' . $emailDomain))
                ->get();
        } catch (Throwable $e) {
            $this->error('查询账号失败: ' . $e->getMessage());
            return self::FAILURE;
        }

        if ($accounts->isEmpty()) {
            $this->error('未找到可操作的账号（账号不存在或已删除）。');
            return self::FAILURE;
        }

        if ($phone !== '' && $accounts->count() > 1) {
            $magicIds = $accounts->pluck('magic_id')->implode(', ');
            $this->error("手机号匹配到多个账号（{$magicIds}），请改用 --magic-id 精确指定。");
            return self::FAILURE;
        }

        foreach ($accounts as $account) {
            $currentStatus = (int) $account->status;
            if ($currentStatus !== AccountStatus::Disable->value && $currentStatus !== AccountStatus::Normal->value) {
                $this->error("账号 {$account->magic_id} 的状态值 {$currentStatus} 不受支持，已停止操作。");
                return self::FAILURE;
            }
        }

        if ($emailDomain !== '') {
            $this->line("目标邮箱域名: {$emailDomain}");
            $this->line("匹配账号数: {$accounts->count()}");
        }
        $this->line('预检查账号信息:');
        foreach ($accounts as $account) {
            $status = (int) $account->status === AccountStatus::Normal->value ? '正常' : '已禁用';
            $this->line(sprintf(
                '  magic_id=%s, phone=%s, email=%s, status=%s',
                (string) $account->magic_id,
                (string) ($account->phone ?? ''),
                (string) ($account->email ?? ''),
                $status
            ));
        }

        if (! $this->input->getOption('execute')) {
            $this->info('预检查完成，未执行禁用。确认后请追加 --execute。');
            return self::SUCCESS;
        }

        $this->line('开始执行禁用及凭证撤销。');

        try {
            $summary = ['account_tokens' => 0, 'user_tokens' => 0, 'api_keys' => 0];
            foreach ($accounts as $account) {
                $result = $this->revocationService->revoke((string) $account->magic_id);
                $summary['account_tokens'] += $result['account_tokens'];
                $summary['user_tokens'] += $result['user_tokens'];
                $summary['api_keys'] += $result['api_keys'];
            }
        } catch (Throwable $e) {
            $this->error('封禁账号失败: ' . $e->getMessage());
            return self::FAILURE;
        }

        $this->info(sprintf(
            $emailDomain === ''
                ? '账号 %s 已封禁，撤销 Account Token %d 条、用户 Token %d 条、API Key %d 条。'
                : '邮箱域名 %s 下的 %d 个账号已封禁，撤销 Account Token %d 条、用户 Token %d 条、API Key %d 条。',
            ...($emailDomain === ''
                ? [(string) $accounts->first()->magic_id, $summary['account_tokens'], $summary['user_tokens'], $summary['api_keys']]
                : [$emailDomain, $accounts->count(), $summary['account_tokens'], $summary['user_tokens'], $summary['api_keys']])
        ));
        return self::SUCCESS;
    }
}
