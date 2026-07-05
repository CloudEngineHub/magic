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
        if (Schema::hasTable('magic_slides_templates')) {
            return;
        }

        Schema::create('magic_slides_templates', static function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键 ID');
            $table->string('organization_code', 64)->comment('模板所属组织编码；一期仅官方组织可创建和管理');
            $table->string('code', 64)->comment('模板唯一编码，全局唯一；创建时由后端自动生成，格式 PPT-uniqid');
            $table->string('source_type', 32)->default('CUSTOM')->comment('模板来源类型：CUSTOM=自定义，SYSTEM=系统内置');
            $table->json('label')->comment('模板名称，多语言，zh_CN/en_US 必填');
            $table->json('description')->comment('模板描述，多语言，zh_CN/en_US 必填');
            $table->string('thumbnail_file_key', 512)->comment('封面缩略图文件 key，接口返回 thumbnail_url');
            $table->string('collage_file_key', 512)->nullable()->comment('预览拼图文件 key，接口返回 collage_url');
            $table->string('template_file_key', 512)->comment('模板 ZIP 包文件 key，接口返回 template_file_url');
            $table->string('preview_url', 1024)->nullable()->comment('预览链接，可为空');
            $table->tinyInteger('status')->default(1)->comment('状态：0=不可用，1=可用');
            $table->integer('sort')->default(0)->comment('排序值，越大越靠前');
            $table->string('created_uid', 64)->nullable()->comment('创建人用户 ID');
            $table->string('updated_uid', 64)->nullable()->comment('最后更新人用户 ID');
            $table->timestamps();
            $table->softDeletes();

            $table->unique('code', 'uk_code');
            $table->index(['organization_code', 'status', 'sort', 'id'], 'idx_org_status_sort');
            $table->index(['status', 'sort', 'id'], 'idx_status_sort');
            $table->index('deleted_at', 'idx_deleted_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('magic_slides_templates');
    }
};
