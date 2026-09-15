<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('magic_recycle_bin', function (Blueprint $table): void {
            if (! Schema::hasColumn('magic_recycle_bin', 'is_hidden')) {
                $table->boolean('is_hidden')->default(false)->comment('删除时的隐藏标记，仅控制用户可见性');
            }
        });

        // 隐藏条件位于等值前缀内，保持列表时间排序和两路计数的索引能力。
        // 保留现有恢复查找索引；先建立替代索引，再移除旧索引，避免中间阶段失去索引。
        Schema::table('magic_recycle_bin', function (Blueprint $table): void {
            if (! Schema::hasIndex('magic_recycle_bin', 'idx_recycle_owner_visible_deleted')) {
                $table->index(['owner_id', 'removed_at', 'is_hidden', 'deleted_at'], 'idx_recycle_owner_visible_deleted');
            }
            if (! Schema::hasIndex('magic_recycle_bin', 'idx_recycle_type_visible_owner')) {
                $table->index(['resource_type', 'removed_at', 'is_hidden', 'owner_id'], 'idx_recycle_type_visible_owner');
            }
            if (! Schema::hasIndex('magic_recycle_bin', 'idx_recycle_type_visible_parent_owner')) {
                $table->index(['resource_type', 'removed_at', 'is_hidden', 'parent_id', 'owner_id'], 'idx_recycle_type_visible_parent_owner');
            }
        });
        Schema::table('magic_recycle_bin', function (Blueprint $table): void {
            foreach (['idx_recycle_owner_removed_deleted', 'idx_recycle_type_removed_owner', 'idx_recycle_type_removed_parent_owner'] as $index) {
                if (Schema::hasIndex('magic_recycle_bin', $index)) {
                    $table->dropIndex($index);
                }
            }
        });
    }

    public function down(): void
    {
        Schema::table('magic_recycle_bin', function (Blueprint $table): void {
            if (! Schema::hasIndex('magic_recycle_bin', 'idx_recycle_owner_removed_deleted')) {
                $table->index(['owner_id', 'removed_at', 'deleted_at'], 'idx_recycle_owner_removed_deleted');
            }
            if (! Schema::hasIndex('magic_recycle_bin', 'idx_recycle_type_removed_owner')) {
                $table->index(['resource_type', 'removed_at', 'owner_id'], 'idx_recycle_type_removed_owner');
            }
            if (! Schema::hasIndex('magic_recycle_bin', 'idx_recycle_type_removed_parent_owner')) {
                $table->index(['resource_type', 'removed_at', 'parent_id', 'owner_id'], 'idx_recycle_type_removed_parent_owner');
            }
        });
        Schema::table('magic_recycle_bin', function (Blueprint $table): void {
            foreach (['idx_recycle_owner_visible_deleted', 'idx_recycle_type_visible_owner', 'idx_recycle_type_visible_parent_owner'] as $index) {
                if (Schema::hasIndex('magic_recycle_bin', $index)) {
                    $table->dropIndex($index);
                }
            }
            if (Schema::hasColumn('magic_recycle_bin', 'is_hidden')) {
                $table->dropColumn('is_hidden');
            }
        });
    }
};
