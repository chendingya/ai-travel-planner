<template>
  <div class="home-container">
    <!-- Hero Section - 更大气的设计 -->
    <div class="hero-section">
      <div class="hero-background">
        <div class="hero-gradient"></div>
        <div class="hero-pattern"></div>
      </div>
      <div class="hero-content">
        <div class="hero-badge">
          <span class="badge-icon">👑</span>
          <span>智能旅行规划专家</span>
        </div>
        <h1 class="hero-title">
          <span class="title-line">开启你的</span>
          <span class="title-highlight">智能旅行</span>
          <span class="title-line">新体验</span>
        </h1>
        <p class="hero-subtitle">
          不只是规划一次旅行<br/>
          更是为您自动生成一部专属的旅行纪录片
        </p>
        <div class="hero-actions">
          <t-button 
            theme="primary" 
            size="large" 
            @click="$emit('start-plan')"
            class="start-button"
          >
            <t-icon name="rocket" />
            立即开始规划
          </t-button>
          <GlassButton icon="play-circle" @click="gotoDemo" theme="dark">
            观看演示
          </GlassButton>
        </div>
        <div class="hero-stats">
          <div class="stat-item">
            <div class="stat-number">10K+</div>
            <div class="stat-label">生成方案</div>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <div class="stat-number">98%</div>
            <div class="stat-label">用户满意度</div>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <div class="stat-number">24/7</div>
            <div class="stat-label">随时可用</div>
          </div>
        </div>
      </div>
    </div>

    <div class="content-section">
      <!-- 产品特色 - 大卡片设计 -->
      <section class="feature-section">
        <div class="section-header">
          <span class="section-badge">核心优势</span>
          <h2 class="section-title">为什么选择我们</h2>
          <p class="section-subtitle">强大的 AI 技术，为您提供最优质的旅行规划服务</p>
        </div>
        
        <div class="feature-grid">
          <div class="feature-card feature-card-primary">
            <div class="card-glow"></div>
            <div class="feature-icon-wrapper">
              <div class="feature-icon">🧠</div>
            </div>
            <h3 class="feature-title">AI 智能规划</h3>
            <p class="feature-desc">
              基于先进的人工智能算法，深度分析您的需求和偏好，
              自动生成最优化的旅行方案，为您节省时间和精力。
            </p>
            <div class="feature-tags">
              <span class="feature-tag">智能分析</span>
              <span class="feature-tag">个性定制</span>
            </div>
          </div>

          <div class="feature-card feature-card-secondary">
            <div class="card-glow"></div>
            <div class="feature-icon-wrapper">
              <div class="feature-icon">💰</div>
            </div>
            <h3 class="feature-title">智能预算管理</h3>
            <p class="feature-desc">
              自动分解各项费用明细，包括交通、住宿、餐饮、景点等，
              帮助您合理分配预算，避免超支，让旅行更省心。
            </p>
            <div class="feature-tags">
              <span class="feature-tag">费用透明</span>
              <span class="feature-tag">预算优化</span>
            </div>
          </div>

          <div class="feature-card feature-card-accent">
            <div class="card-glow"></div>
            <div class="feature-icon-wrapper">
              <div class="feature-icon">🗺️</div>
            </div>
            <h3 class="feature-title">地图可视化</h3>
            <p class="feature-desc">
              在交互式地图上直观展示景点位置，点击活动即可查看具体位置，
              让您对行程一目了然，规划更加清晰。
            </p>
            <div class="feature-tags">
              <span class="feature-tag">实时定位</span>
              <span class="feature-tag">路线优化</span>
            </div>
          </div>

          <div class="feature-card feature-card-info">
            <div class="card-glow"></div>
            <div class="feature-icon-wrapper">
              <div class="feature-icon">💾</div>
            </div>
            <h3 class="feature-title">方案云存储</h3>
            <p class="feature-desc">
              支持保存多个旅行方案到云端，随时随地查看和比较历史规划，
              方便您做出最佳选择，永不丢失。
            </p>
            <div class="feature-tags">
              <span class="feature-tag">云端同步</span>
              <span class="feature-tag">多方案对比</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 使用教程 - 现代化设计 -->
      <section class="tutorial-section">
        <div class="section-header">
          <span class="section-badge">简单四步</span>
          <h2 class="section-title">如何开始使用</h2>
          <p class="section-subtitle">跟随指引，轻松创建您的专属旅行计划</p>
        </div>
        
        <div class="tutorial-grid">
          <div class="tutorial-card">
            <div class="tutorial-number">01</div>
            <div class="tutorial-icon">📝</div>
            <h3 class="tutorial-title">填写基本信息</h3>
            <p class="tutorial-desc">
              输入旅行目的地、旅行天数、预算和人数等基本信息，
              这些信息将帮助 AI 更好地理解您的需求。
            </p>
          </div>

          <div class="tutorial-card">
            <div class="tutorial-number">02</div>
            <div class="tutorial-icon">❤️</div>
            <h3 class="tutorial-title">描述您的偏好</h3>
            <p class="tutorial-desc">
              详细描述您的兴趣爱好、特殊需求和期望。
              描述越详细，AI 生成的方案就越精准和个性化。
            </p>
          </div>

          <div class="tutorial-card">
            <div class="tutorial-number">03</div>
            <div class="tutorial-icon">⚡</div>
            <h3 class="tutorial-title">AI 智能生成</h3>
            <p class="tutorial-desc">
              点击生成按钮，AI 将在几秒钟内为您规划详细的行程安排，
              包括每天的活动、时间和预算分配。
            </p>
          </div>

          <div class="tutorial-card">
            <div class="tutorial-number">04</div>
            <div class="tutorial-icon">✨</div>
            <h3 class="tutorial-title">查看和保存</h3>
            <p class="tutorial-desc">
              查看方案详情和地图定位，点击活动可查看具体位置。
              满意后保存方案，随时查看和调整。
            </p>
          </div>
        </div>
      </section>

      <!-- 使用技巧 - 精致卡片 -->
      <section class="tips-section">
        <div class="section-header">
          <span class="section-badge">实用技巧</span>
          <h2 class="section-title">让体验更加出色</h2>
          <p class="section-subtitle">掌握这些技巧，让 AI 更懂你的需求</p>
        </div>
        
        <div class="tips-grid">
          <div class="tip-card">
            <div class="tip-icon-wrapper">
              <div class="tip-icon">🎯</div>
            </div>
            <h4 class="tip-title">详细描述偏好</h4>
            <p class="tip-text">
              偏好描述越详细，AI 生成的方案就越精准和个性化。
              不妨说说您喜欢的景点类型、饮食习惯等。
            </p>
          </div>

          <div class="tip-card">
            <div class="tip-icon-wrapper">
              <div class="tip-icon">🗣️</div>
            </div>
            <h4 class="tip-title">语音快捷输入</h4>
            <p class="tip-text">
              支持语音输入目的地信息，让填写表单更加便捷高效。
              一键说话，省时省力。
            </p>
          </div>

          <div class="tip-card">
            <div class="tip-icon-wrapper">
              <div class="tip-icon">🗺️</div>
            </div>
            <h4 class="tip-title">地图交互查看</h4>
            <p class="tip-text">
              点击时间轴中的活动可在地图上查看具体位置。
              直观了解景点分布，优化行程路线。
            </p>
          </div>

          <div class="tip-card">
            <div class="tip-icon-wrapper">
              <div class="tip-icon">💾</div>
            </div>
            <h4 class="tip-title">云端安全存储</h4>
            <p class="tip-text">
              记得保存您喜欢的旅行方案到云端。
              多设备同步，方便后续查看和调整。
            </p>
          </div>

          <div class="tip-card">
            <div class="tip-icon-wrapper">
              <div class="tip-icon">�</div>
            </div>
            <h4 class="tip-title">预算智能分析</h4>
            <p class="tip-text">
              查看详细的预算分解和可视化图表。
              合理规划开支，让旅行更经济实惠。
            </p>
          </div>

          <div class="tip-card">
            <div class="tip-icon-wrapper">
              <div class="tip-icon">🔄</div>
            </div>
            <h4 class="tip-title">多方案对比</h4>
            <p class="tip-text">
              生成多个方案进行对比，选择最适合自己的。
              不满意？重新生成即可。
            </p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import GlassButton from './GlassButton.vue';

defineEmits(['start-plan']);

const gotoDemo = () => {
  window.open('https://box.nju.edu.cn/d/5ccc891c28d24a378b8c/', '_blank');
};
</script>

<style scoped>
/* 全局容器 */
.home-container {
  max-width: 100%;
  margin: 0 auto;
  background: #fafbfc;
}

/* Hero Section - 大气的渐变背景 */
.hero-section {
  position: relative;
  padding: 120px 40px 100px;
  overflow: hidden;
  background: linear-gradient(135deg, var(--td-brand-color-8) 0%, var(--td-brand-color-6) 30%, var(--td-brand-color-4) 70%, var(--td-brand-color-2) 100%);
}

.hero-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
}

.hero-gradient {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
  animation: rotate 20s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.hero-pattern {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: 
    radial-gradient(circle at 20% 30%, rgba(255,255,255,0.1) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(255,255,255,0.1) 0%, transparent 50%);
}

.hero-content {
  position: relative;
  max-width: 900px;
  margin: 0 auto;
  text-align: center;
  color: white;
  z-index: 1;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  border-radius: 50px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 32px;
  animation: fadeInDown 0.8s ease-out;
}

.badge-icon {
  font-size: 18px;
  display: inline-flex;
  align-items: center;
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hero-title {
  font-size: 64px;
  font-weight: 800;
  margin: 0 0 32px 0;
  line-height: 1.2;
  animation: fadeInUp 0.8s ease-out 0.2s both;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.title-line {
  display: block;
  font-weight: 300;
  font-size: 48px;
}

.title-highlight {
  display: block;
  font-weight: 900;
  font-size: 72px;
  background: linear-gradient(90deg, #fff 0%, #a8edea 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  padding: 8px 32px;
  background-color: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  margin: 12px 0;
}

.hero-subtitle {
  font-size: 20px;
  margin: 0 0 48px 0;
  opacity: 0.95;
  font-weight: 300;
  line-height: 1.8;
  animation: fadeInUp 0.8s ease-out 0.4s both;
}

.hero-actions {
  display: flex;
  gap: 20px;
  justify-content: center;
  margin-bottom: 60px;
  animation: fadeInUp 0.8s ease-out 0.6s both;
}

.start-button {
  font-size: 18px;
  padding: 16px 48px;
  height: auto;
  border-radius: 50px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
}

.start-button:hover {
  transform: translateY(-3px);
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.3);
}

.hero-stats {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 48px;
  animation: fadeInUp 0.8s ease-out 0.8s both;
}

.stat-item {
  text-align: center;
}

.stat-number {
  font-size: 36px;
  font-weight: 700;
  margin-bottom: 8px;
}

.stat-label {
  font-size: 14px;
  opacity: 0.9;
  font-weight: 300;
}

.stat-divider {
  width: 1px;
  height: 40px;
  background: rgba(255, 255, 255, 0.3);
}

/* Content Section */
.content-section {
  max-width: 1280px;
  margin: 0 auto;
  padding: 80px 40px;
}

/* Section Header - 统一的区域标题样式 */
.section-header {
  text-align: center;
  margin-bottom: 64px;
}

.section-badge {
  display: inline-block;
  padding: 8px 20px;
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
  border-radius: var(--td-radius-round);
  font-size: var(--td-font-size-mark-small);
  font-weight: 600;
  margin-bottom: 16px;
  border: 1px solid var(--td-brand-color-focus);
}

.section-title {
  font-size: 40px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0 0 16px 0;
  letter-spacing: -0.5px;
}

.section-subtitle {
  font-size: 18px;
  color: #64748b;
  line-height: 1.8;
  max-width: 600px;
  margin: 0 auto;
  font-weight: 300;
}

/* Feature Section - 2x2 大卡片网格 */
.feature-section {
  margin-bottom: 100px;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 32px;
  margin-top: 48px;
}

.feature-card {
  position: relative;
  background: white;
  border-radius: 24px;
  padding: 48px 40px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.feature-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--td-brand-color-7), var(--td-brand-color-5));
  opacity: 0;
  transition: opacity 0.3s ease;
}

.feature-card:hover {
  transform: translateY(-12px);
  box-shadow: 0 20px 60px rgba(0, 82, 217, 0.15);
  border-color: var(--td-brand-color-focus);
}

.feature-card:hover::before {
  opacity: 1;
}

.feature-card:hover .card-glow {
  opacity: 1;
}

.card-glow {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(0, 82, 217, 0.08) 0%, transparent 70%);
  opacity: 0;
  pointer-events: none;
}

.feature-card-primary { border-top-color: var(--td-brand-color-2); }
.feature-card-secondary { border-top-color: var(--td-brand-color-3); }
.feature-card-accent { border-top-color: var(--td-brand-color-4); }
.feature-card-info { border-top-color: var(--td-success-color-light); }

.feature-icon-wrapper {
  margin-bottom: 24px;
}

.feature-icon {
  font-size: 72px;
  display: inline-block;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.feature-title {
  font-size: 24px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0 0 16px 0;
  letter-spacing: -0.3px;
}

.feature-desc {
  font-size: 15px;
  color: #64748b;
  line-height: 1.8;
  margin: 0 0 24px 0;
}

.feature-tags {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.feature-tag {
  padding: 6px 16px;
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
  border-radius: var(--td-radius-round);
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--td-brand-color-focus);
}

/* Tutorial Section - 4列网格 */
.tutorial-section {
  margin-bottom: 100px;
}

.tutorial-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 28px;
  margin-top: 48px;
}

.tutorial-card {
  position: relative;
  background: white;
  border-radius: 20px;
  padding: 36px 28px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
  border: 1px solid rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
}

.tutorial-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 32px rgba(0, 82, 217, 0.12);
  border-color: var(--td-brand-color-light);
}

.tutorial-number {
  position: absolute;
  top: -16px;
  right: 28px;
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, var(--td-brand-color-7), var(--td-brand-color-5));
  color: white;
  border-radius: var(--td-radius-circle);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
  box-shadow: var(--td-shadow-2);
}

.tutorial-icon {
  font-size: 56px;
  margin-bottom: 20px;
  display: block;
}

.tutorial-title {
  font-size: 18px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0 0 12px 0;
}

.tutorial-desc {
  font-size: 14px;
  color: #64748b;
  line-height: 1.7;
  margin: 0;
}

/* Tips Section - 3x2 网格 */
.tips-section {
  margin-bottom: 60px;
}

.tips-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin-top: 48px;
}

.tip-card {
  background: white;
  border-radius: 16px;
  padding: 32px 28px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  transition: all 0.3s ease;
}

.tip-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 82, 217, 0.1);
  border-color: var(--td-brand-color-light);
}

.tip-icon-wrapper {
  margin-bottom: 20px;
}

.tip-icon {
  font-size: 52px;
  display: inline-block;
  filter: drop-shadow(0 4px 12px rgba(0, 82, 217, 0.15));
}

.tip-title {
  font-size: 17px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0 0 12px 0;
}

.tip-text {
  font-size: 14px;
  color: #64748b;
  line-height: 1.7;
  margin: 0;
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .feature-grid {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .tutorial-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
  }

  .tips-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .hero-section {
    padding: 80px 24px 60px;
  }

  .hero-title {
    font-size: 40px;
  }

  .title-line {
    font-size: 32px;
  }

  .title-highlight {
    font-size: 48px;
  }

  .hero-subtitle {
    font-size: 16px;
    margin-bottom: 32px;
  }

  .hero-actions {
    flex-direction: column;
    gap: 16px;
  }

  .start-button,
  .demo-button {
    width: 100%;
    padding: 14px 32px;
    font-size: 16px;
  }

  .hero-stats {
    gap: 24px;
    flex-wrap: wrap;
  }

  .stat-number {
    font-size: 28px;
  }

  .content-section {
    padding: 60px 24px;
  }

  .section-title {
    font-size: 32px;
  }

  .section-subtitle {
    font-size: 16px;
  }

  .tutorial-grid {
    grid-template-columns: 1fr;
  }

  .tips-grid {
    grid-template-columns: 1fr;
  }
}
</style>
