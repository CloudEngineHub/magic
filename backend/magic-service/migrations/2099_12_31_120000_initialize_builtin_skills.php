<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use App\Application\SuperMagic\Skill\Initializer\BuiltinSkillInitializer;
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Schema;
use Hyperf\DbConnection\Db;

/*
 * 初始化系统内置技能（数据 migration，2099 段确保在 schema migration 之后执行）
 */
return new class extends Migration {
    public function up(): void
    {
        if ($this->hasAlreadyInitialized()) {
            return;
        }

        if (! Schema::hasTable('magic_skills')
            || ! Schema::hasTable('magic_skill_versions')
            || ! Schema::hasTable('magic_skill_market')) {
            return;
        }

        $result = BuiltinSkillInitializer::init();
        if (! $result['success']) {
            throw new RuntimeException($result['message']);
        }
    }

    public function down(): void
    {
    }

    /**
     * 兼容旧版 init migration 已在正式环境执行过的场景，避免重复同步内置技能。
     */
    private function hasAlreadyInitialized(): bool
    {
        if (! Schema::hasTable('migrations')) {
            return false;
        }

        return Db::table('migrations')
            ->where('migration', 'like', '%initialize_builtin_skills%')
            ->exists();
    }
};
