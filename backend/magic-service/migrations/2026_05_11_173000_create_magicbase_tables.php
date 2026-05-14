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
        if (! Schema::hasTable('magicbase_tables')) {
            Schema::create('magicbase_tables', static function (Blueprint $table) {
                $table->unsignedBigInteger('id')->primary()->comment('表ID');
                $table->string('organization_code', 64)->comment('组织编码');
                $table->unsignedBigInteger('project_id')->comment('项目ID');
                $table->string('table_key', 128)->comment('逻辑表标识');
                $table->string('table_name', 255)->comment('表名称');
                $table->string('description', 500)->default('')->comment('表说明');
                $table->string('status', 32)->default('enabled')->comment('状态');
                $table->json('dynamic_permissions')->nullable()->comment('动态权限配置');
                $table->string('created_by', 64)->comment('创建人');
                $table->dateTime('created_at')->comment('创建时间');
                $table->dateTime('updated_at')->comment('更新时间');
                $table->dateTime('deleted_at')->nullable()->comment('删除时间');
                $table->unique(['organization_code', 'project_id', 'table_key'], 'uk_magicbase_table_key');
                $table->index(['organization_code', 'project_id'], 'idx_magicbase_tables_app');
                $table->comment('MagicBase 逻辑表');
            });
        }

        if (! Schema::hasTable('magicbase_columns')) {
            Schema::create('magicbase_columns', static function (Blueprint $table) {
                $table->unsignedBigInteger('id')->primary()->comment('字段ID');
                $table->string('organization_code', 64)->comment('组织编码');
                $table->unsignedBigInteger('table_id')->comment('表ID');
                $table->string('column_key', 128)->comment('字段标识');
                $table->string('column_name', 255)->comment('字段名称');
                $table->string('data_type', 64)->comment('字段类型');
                $table->tinyInteger('is_required')->default(0)->comment('是否必填');
                $table->text('default_value')->nullable()->comment('默认值');
                $table->json('options')->nullable()->comment('字段扩展配置');
                $table->string('status', 32)->default('enabled')->comment('状态');
                $table->json('dynamic_permission')->nullable()->comment('字段动态权限');
                $table->dateTime('created_at')->comment('创建时间');
                $table->dateTime('updated_at')->comment('更新时间');
                $table->dateTime('deleted_at')->nullable()->comment('删除时间');
                $table->unique(['organization_code', 'table_id', 'column_key'], 'uk_magicbase_column_key');
                $table->index(['organization_code', 'table_id'], 'idx_magicbase_columns_table');
                $table->comment('MagicBase 字段表');
            });
        }

        if (! Schema::hasTable('magicbase_relations')) {
            Schema::create('magicbase_relations', static function (Blueprint $table) {
                $table->unsignedBigInteger('id')->primary()->comment('关系ID');
                $table->string('organization_code', 64)->comment('组织编码');
                $table->unsignedBigInteger('project_id')->comment('项目ID');
                $table->unsignedBigInteger('source_table_id')->comment('源表ID');
                $table->string('source_column_key', 128)->comment('源字段标识');
                $table->unsignedBigInteger('target_table_id')->comment('目标表ID');
                $table->string('target_column_key', 128)->comment('目标字段标识');
                $table->string('relation_type', 32)->comment('关系类型');
                $table->string('relation_name', 128)->comment('关系名称');
                $table->dateTime('created_at')->comment('创建时间');
                $table->dateTime('updated_at')->comment('更新时间');
                $table->unique(['organization_code', 'source_table_id', 'relation_name'], 'uk_magicbase_relation_name');
                $table->index(['organization_code', 'project_id'], 'idx_magicbase_relations_app');
                $table->comment('MagicBase 关系表');
            });
        }

        if (! Schema::hasTable('magicbase_project_admins')) {
            Schema::create('magicbase_project_admins', static function (Blueprint $table) {
                $table->unsignedBigInteger('id')->primary()->comment('管理员记录ID');
                $table->string('organization_code', 64)->comment('组织编码');
                $table->unsignedBigInteger('project_id')->comment('项目ID');
                $table->string('subject_type', 32)->comment('主体类型');
                $table->string('subject_id', 64)->comment('主体ID');
                $table->dateTime('created_at')->comment('创建时间');
                $table->dateTime('updated_at')->comment('更新时间');
                $table->unique(['organization_code', 'project_id', 'subject_type', 'subject_id'], 'uk_magicbase_project_admin');
                $table->comment('MagicBase 项目管理员');
            });
        }

        if (! Schema::hasTable('magicbase_table_admins')) {
            Schema::create('magicbase_table_admins', static function (Blueprint $table) {
                $table->unsignedBigInteger('id')->primary()->comment('管理员记录ID');
                $table->string('organization_code', 64)->comment('组织编码');
                $table->unsignedBigInteger('table_id')->comment('表ID');
                $table->string('subject_type', 32)->comment('主体类型');
                $table->string('subject_id', 64)->comment('主体ID');
                $table->dateTime('created_at')->comment('创建时间');
                $table->dateTime('updated_at')->comment('更新时间');
                $table->unique(['organization_code', 'table_id', 'subject_type', 'subject_id'], 'uk_magicbase_table_admin');
                $table->comment('MagicBase 表管理员');
            });
        }

        if (! Schema::hasTable('magicbase_table_permissions')) {
            Schema::create('magicbase_table_permissions', static function (Blueprint $table) {
                $table->unsignedBigInteger('id')->primary()->comment('权限ID');
                $table->string('organization_code', 64)->comment('组织编码');
                $table->unsignedBigInteger('table_id')->comment('表ID');
                $table->string('subject_type', 32)->comment('主体类型');
                $table->string('subject_id', 64)->comment('主体ID');
                $table->string('permission_level', 32)->comment('表级权限');
                $table->dateTime('created_at')->comment('创建时间');
                $table->dateTime('updated_at')->comment('更新时间');
                $table->index(['organization_code', 'table_id'], 'idx_magicbase_table_permissions_table');
                $table->comment('MagicBase 表静态权限');
            });
        }

        if (! Schema::hasTable('magicbase_column_permissions')) {
            Schema::create('magicbase_column_permissions', static function (Blueprint $table) {
                $table->unsignedBigInteger('id')->primary()->comment('权限ID');
                $table->string('organization_code', 64)->comment('组织编码');
                $table->unsignedBigInteger('table_id')->comment('表ID');
                $table->unsignedBigInteger('column_id')->comment('字段ID');
                $table->string('subject_type', 32)->comment('主体类型');
                $table->string('subject_id', 64)->comment('主体ID');
                $table->tinyInteger('can_read')->default(0)->comment('是否可读');
                $table->tinyInteger('can_edit')->default(0)->comment('是否可编辑');
                $table->dateTime('created_at')->comment('创建时间');
                $table->dateTime('updated_at')->comment('更新时间');
                $table->index(['organization_code', 'table_id'], 'idx_magicbase_column_permissions_table');
                $table->comment('MagicBase 字段静态权限');
            });
        }

        if (! Schema::hasTable('magicbase_row_permissions')) {
            Schema::create('magicbase_row_permissions', static function (Blueprint $table) {
                $table->unsignedBigInteger('id')->primary()->comment('权限ID');
                $table->string('organization_code', 64)->comment('组织编码');
                $table->unsignedBigInteger('table_id')->comment('表ID');
                $table->unsignedBigInteger('record_id')->comment('记录ID');
                $table->string('subject_type', 32)->comment('主体类型');
                $table->string('subject_id', 64)->comment('主体ID');
                $table->tinyInteger('can_read')->default(0)->comment('是否可读');
                $table->tinyInteger('can_edit')->default(0)->comment('是否可编辑');
                $table->tinyInteger('can_delete')->default(0)->comment('是否可删除');
                $table->dateTime('created_at')->comment('创建时间');
                $table->dateTime('updated_at')->comment('更新时间');
                $table->index(['organization_code', 'table_id', 'record_id'], 'idx_magicbase_row_permissions_record');
                $table->comment('MagicBase 行静态权限');
            });
        }

        if (! Schema::hasTable('magicbase_schema_migration_logs')) {
            Schema::create('magicbase_schema_migration_logs', static function (Blueprint $table) {
                $table->unsignedBigInteger('id')->primary()->comment('日志ID');
                $table->string('organization_code', 64)->comment('组织编码');
                $table->unsignedBigInteger('project_id')->nullable()->comment('项目ID');
                $table->unsignedBigInteger('table_id')->nullable()->comment('表ID');
                $table->string('change_type', 32)->comment('变更类型');
                $table->string('target_type', 32)->comment('目标类型');
                $table->unsignedBigInteger('target_id')->nullable()->comment('目标ID');
                $table->string('source_type', 32)->comment('来源类型');
                $table->string('source_ref', 255)->default('')->comment('来源引用');
                $table->json('before_json')->nullable()->comment('变更前');
                $table->json('after_json')->nullable()->comment('变更后');
                $table->string('operator_id', 64)->default('')->comment('操作人ID');
                $table->string('operator_name', 255)->default('')->comment('操作人名称');
                $table->string('request_id', 128)->default('')->comment('请求ID');
                $table->string('remark', 255)->nullable()->comment('备注');
                $table->dateTime('created_at')->comment('创建时间');
                $table->index(['organization_code', 'project_id', 'table_id'], 'idx_magicbase_logs_scope');
                $table->comment('MagicBase 迁移日志');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('magicbase_schema_migration_logs');
        Schema::dropIfExists('magicbase_row_permissions');
        Schema::dropIfExists('magicbase_column_permissions');
        Schema::dropIfExists('magicbase_table_permissions');
        Schema::dropIfExists('magicbase_table_admins');
        Schema::dropIfExists('magicbase_project_admins');
        Schema::dropIfExists('magicbase_relations');
        Schema::dropIfExists('magicbase_columns');
        Schema::dropIfExists('magicbase_tables');
    }
};
