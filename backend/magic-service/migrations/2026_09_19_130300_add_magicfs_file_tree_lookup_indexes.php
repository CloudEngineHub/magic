<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

/**
 * Indexes for the two bounded metadata primitives used by MagicFS:
 *
 *  - exact parent/name lookup while resolving a path component;
 *
 * The cursor index added in the previous migration ends in (sort,file_id).
 * It is ideal for page walks but cannot seek efficiently when file_name is the
 * only child predicate, hence the separate parent/name key.
 */
return new class extends Migration {
    /** @var array<string, array<int, string>> */
    private array $indexes = [
        'idx_magicfs_file_tree_parent_name' => [
            'parent_id', 'file_name', 'deleted_at', 'file_id',
        ],
    ];

    public function up(): void
    {
        $tableName = 'magic_super_agent_task_files';
        Schema::table($tableName, function (Blueprint $table) use ($tableName): void {
            foreach ($this->indexes as $name => $columns) {
                if (! Schema::hasIndex($tableName, $name)) {
                    $table->index($columns, $name);
                }
            }
        });
    }

    public function down(): void
    {
        $tableName = 'magic_super_agent_task_files';
        Schema::table($tableName, function (Blueprint $table) use ($tableName): void {
            foreach (array_keys($this->indexes) as $name) {
                if (Schema::hasIndex($tableName, $name)) {
                    $table->dropIndex($name);
                }
            }
        });
    }
};
