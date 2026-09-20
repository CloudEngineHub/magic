<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;
use Hyperf\DbConnection\Db;

/**
 * Create the root-file revision heads used by the durable MagicFS feed.
 * The journal schema (including root_file_id/revision) is created in the
 * preceding migration; this table is the serialization point for allocating a
 * strictly monotonic cursor per logical root directory.
 */
return new class extends Migration {
    public function up(): void
    {
        $heads = 'magic_fs_file_tree_heads';
        Schema::create($heads, static function (Blueprint $table): void {
            $table->unsignedBigInteger('root_file_id')->primary()->comment('文件树根目录 ID');
            $table->unsignedBigInteger('revision')->default(0)->comment('文件树范围内单调递增 revision');
            $table->unsignedBigInteger('oldest_revision')->default(1)->comment('oldest retained revision');
            $table->dateTime('updated_at');
            $table->comment('MagicFS file-tree heads keyed by root_file_id');
        });

        // Existing installations may already contain task-file rows created
        // before the durable feed was introduced.  Seed one empty head per
        // physical root, not one row per descendant.  The first post-migration
        // mutation will then allocate revision 1 under the same root lock.
        $now = date('Y-m-d H:i:s');
        $roots = Db::table('magic_super_agent_task_files')
            ->select(['file_id'])
            ->where(static function ($query): void {
                $query->whereNull('parent_id')->orWhere('parent_id', 0);
            })
            ->where('is_directory', 1)
            ->whereNull('deleted_at')
            ->orderBy('file_id')
            ->get();
        foreach ($roots as $root) {
            Db::table($heads)->insertOrIgnore([
                'root_file_id' => (int) $root->file_id,
                'revision' => 0,
                'oldest_revision' => 1,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('magic_fs_file_tree_heads');
    }
};
