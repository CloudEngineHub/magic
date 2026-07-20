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
        if (Schema::hasTable('magic_slides_template_tags')) {
            return;
        }

        Schema::create('magic_slides_template_tags', static function (Blueprint $table): void {
            $table->bigIncrements('id')->comment('主键 ID');
            $table->string('organization_code', 64)->comment('标签所属组织编码');
            $table->string('code', 64)->comment('标签唯一编码，如 hot/free');
            $table->json('name_i18n')->comment('标签名称，多语言，zh_CN/en_US 必填');
            $table->tinyInteger('status')->default(1)->comment('状态：0=不可用，1=可用');
            $table->integer('sort')->default(0)->comment('排序值，越大越靠前');
            $table->string('created_uid', 64)->nullable()->comment('创建人用户 ID');
            $table->string('updated_uid', 64)->nullable()->comment('最后更新人用户 ID');
            $table->timestamps();
            $table->softDeletes();

            $table->unique('code', 'uk_code');
            $table->index(['organization_code', 'status', 'sort', 'id'], 'idx_org_status_sort');
            $table->index('deleted_at', 'idx_deleted_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('magic_slides_template_tags');
    }
};
