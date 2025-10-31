<template>
  <div class="content-wrapper">
    <t-row :gutter="24">
      <t-col :xs="12" :sm="12" :md="6" :lg="6" :xl="6">
        <div class="planner-section">
          <!-- 移除外层 t-card 包裹，避免左右边界/阴影贯穿头部与快捷输入之间的间隔 -->
          <div class="planner-card">
            <Planner 
              @locations-updated="(locations) => $emit('locations-updated', locations)" 
              @fly-to="(coords) => $emit('fly-to', coords)"
              @plan-generated="$emit('plan-generated')" 
            />
          </div>
        </div>
      </t-col>
      <t-col :xs="12" :sm="12" :md="6" :lg="6" :xl="6">
        <div class="intro-section">
          <t-card class="intro-card book-right" :bordered="false">
            <div class="intro-header">
              <h2 class="intro-title">
                <span class="intro-icon">💡</span>
                快速开始
              </h2>
            </div>

            <div class="intro-content">
              <!-- 快速指南 -->
              <section class="intro-block">
                <h3 class="block-title">
                  <t-icon name="chart-bubble" />
                  填写要求
                </h3>
                <div class="block-content">
                  <div class="step-list">
                    <div class="step-item-simple">
                      <div class="step-num">1</div>
                      <span>填写目的地、天数、预算和人数</span>
                    </div>
                    <div class="step-item-simple">
                      <div class="step-num">2</div>
                      <span>描述您的偏好和特殊需求</span>
                    </div>
                    <div class="step-item-simple">
                      <div class="step-num">3</div>
                      <span>点击生成，等待 AI 规划方案</span>
                    </div>
                    <div class="step-item-simple">
                      <div class="step-num">4</div>
                      <span>查看详情并保存喜欢的方案</span>
                    </div>
                  </div>
                </div>
              </section>

              <!-- 小提示 -->
              <section class="intro-block tips-block">
                <h3 class="block-title">
                  <t-icon name="tips" />
                  使用提示
                </h3>
                <div class="block-content">
                  <div class="tips-simple">
                    <div class="tip-item-simple">
                      <t-icon name="check-circle" class="tip-check" />
                      <span>详细描述偏好可获得更精准方案</span>
                    </div>
                    <div class="tip-item-simple">
                      <t-icon name="check-circle" class="tip-check" />
                      <span>支持语音输入目的地信息</span>
                    </div>
                    <div class="tip-item-simple">
                      <t-icon name="check-circle" class="tip-check" />
                      <span>点击活动可在地图上查看位置</span>
                    </div>
                    <div class="tip-item-simple">
                      <t-icon name="check-circle" class="tip-check" />
                      <span>保存方案后可随时查看</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </t-card>
        </div>
      </t-col>
    </t-row>
  </div>
</template>

<script setup>
import Planner from '../components/Planner.vue';

defineEmits(['locations-updated', 'fly-to', 'plan-generated']);
</script>

<style scoped>
.content-wrapper {
  padding: 24px;
  min-height: calc(100vh - var(--header-height));
  background: transparent;
}

.planner-section, .intro-section {
  min-height: 600px;
}

/* 仅右侧介绍卡片使用 t-card 的圆角与过渡，左侧已移除 t-card 包裹 */
.intro-section :deep(.t-card) {
  border-radius: 24px !important;
  box-shadow: none !important;
  transition: all 0.3s ease;
  overflow: visible !important;
}

/* 删除左侧书页装饰线，避免产生贯穿效果 */

/* 右页圆角 */
.book-right :deep(.t-card) {
  border-top-left-radius: 8px !important;
  border-bottom-left-radius: 8px !important;
  box-shadow: none !important;
  position: relative;
}

.book-right :deep(.t-card)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 5%;
  bottom: 5%;
  width: 2px;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(102, 126, 234, 0.1) 10%,
    rgba(102, 126, 234, 0.2) 50%,
    rgba(102, 126, 234, 0.1) 90%,
    transparent
  );
  z-index: 1;
  pointer-events: none;
}

.book-right:hover :deep(.t-card) {
  transform: translateX(4px);
  box-shadow: none !important;
}

/* 左侧 Planner 容器基础样式（不产生边框与阴影） */
.planner-card {
  padding: 0;
  background: transparent;
}

/* 右侧卡片保持 padding */
.intro-card :deep(.t-card__body) {
  padding: 32px !important;
  overflow: visible !important;
}

/* 右侧介绍容器 */
.intro-header {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 2px solid #f0f0f0;
}

.intro-title {
  font-size: 26px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  letter-spacing: -0.3px;
}

.intro-icon {
  font-size: 32px;
  filter: drop-shadow(0 2px 8px rgba(102, 126, 234, 0.2));
}

.intro-block {
  margin-bottom: 28px;
}

.intro-block:last-child {
  margin-bottom: 0;
}

.block-title {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.block-title :deep(.t-icon) {
  font-size: 20px;
  color: var(--primary-color);
}

.block-content {
  padding-left: 4px;
}

.step-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step-item-simple {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
  border-radius: 12px;
  border: 1px solid rgba(102, 126, 234, 0.1);
  transition: all 0.3s ease;
}

.step-item-simple:hover {
  background: linear-gradient(135deg, #e8f4ff 0%, #f0f8ff 100%);
  transform: translateX(4px);
  border-color: rgba(102, 126, 234, 0.3);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.1);
}

.step-num {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.step-item-simple span {
  color: #555;
  font-size: 14px;
  line-height: 1.5;
}

.tips-simple {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tip-item-simple {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: linear-gradient(135deg, #fffbf0 0%, #fff9e6 100%);
  border-radius: 12px;
  border: 1px solid rgba(255, 214, 102, 0.3);
  border-left: 3px solid #ffd666;
  transition: all 0.3s ease;
}

.tip-item-simple:hover {
  background: linear-gradient(135deg, #fff9e6 0%, #fff4cc 100%);
  transform: translateX(4px);
  box-shadow: 0 4px 12px rgba(255, 193, 7, 0.15);
  border-left-width: 4px;
}

.tip-check {
  color: #52c41a;
  font-size: 18px;
  flex-shrink: 0;
  margin-top: 2px;
  filter: drop-shadow(0 2px 4px rgba(82, 196, 26, 0.3));
}

.tip-item-simple span {
  color: #666;
  font-size: 13px;
  line-height: 1.5;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .planner-section, .intro-section {
    height: auto;
    min-height: 600px;
  }

  .book-right :deep(.t-card) {
    border-radius: 20px !important;
    margin-bottom: 24px;
  }

  .book-right :deep(.t-card)::before {
    display: none;
  }

  .book-right:hover :deep(.t-card) {
    transform: translateY(-4px);
  }

  .intro-title {
    font-size: 22px;
  }

  .intro-icon {
    font-size: 28px;
  }
}
</style>
