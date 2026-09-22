<template>
  <div class="tasks-page">
    <div class="container">
      <div class="page-header">
      <div class="header-content">
        <h1>会员任务中心</h1>
        <p class="subtitle">管理您的所有预约、报名和订单</p>
      </div>
      <div class="header-actions">
        <div class="stats-summary">
        <div class="stat-item pending">
          <span class="stat-icon">⏳</span>
          <div class="stat-text">
          <span class="stat-value">{{ pendingCount }}</span>
          <span class="stat-label">待处理</span>
          </div>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item completed">
          <span class="stat-icon">✅</span>
          <div class="stat-text">
          <span class="stat-value">{{ completedCount }}</span>
          <span class="stat-label">已完成</span>
          </div>
        </div>
        </div>
      </div>
      </div>

      <div class="filter-section">
      <div class="tab-group">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'pending' }"
          @click="switchTab('pending')"
        >
          <span class="tab-label">待处理</span>
          <span v-if="pendingCount > 0" class="tab-badge">{{ pendingCount }}</span>
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'completed' }"
          @click="switchTab('completed')"
        >
          <span class="tab-label">已完成</span>
          <span v-if="completedCount > 0" class="tab-badge">{{ completedCount }}</span>
        </button>
      </div>

      <div class="type-filters">
        <button
          class="filter-btn"
          :class="{ active: activeType === 'all' }"
          @click="activeType = 'all'"
        >全部</button>
        <button
          class="filter-btn"
          :class="{ active: activeType === 'booking' }"
          @click="activeType = 'booking'"
        >🎱 预约</button>
        <button
          class="filter-btn"
          :class="{ active: activeType === 'course' }"
          @click="activeType = 'course'"
        >📚 课程</button>
        <button
          class="filter-btn"
          :class="{ active: activeType === 'competition' }"
          @click="activeType = 'competition'"
        >🏆 赛事</button>
        <button
          class="filter-btn"
          :class="{ active: activeType === 'order' }"
          @click="activeType = 'order'"
        >🛒 订单</button>
      </div>
      </div>

      <div v-if="filteredTasks.length > 0" class="tasks-list">
      <div
        v-for="task in filteredTasks"
        :key="task.id"
        class="task-card"
        :class="[task.statusType, task.type]"
      >
        <div class="task-header">
          <div class="task-type">
            <span class="type-icon">{{ task.typeIcon }}</span>
            <span class="type-name">{{ task.typeName }}</span>
          </div>
          <div class="task-status" :class="task.statusType">
            {{ task.statusText }}
          </div>
        </div>

        <div class="task-body">
          <h3 class="task-title">{{ task.title }}</h3>
          <p class="task-subtitle">{{ task.subtitle }}</p>
          <div class="task-meta">
            <span v-if="task.amount > 0" class="task-amount">
              ¥{{ task.amount.toLocaleString() }}
            </span>
            <span class="task-date">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
              </svg>
              {{ task.createdAt }}
            </span>
          </div>
        </div>

        <div class="task-actions">
          <button
            v-for="action in task.actions"
            :key="action.key"
            class="action-btn"
            :class="action.type"
            @click="handleAction(task, action)"
          >
            {{ action.label }}
          </button>
        </div>
      </div>
      </div>

      <div v-else class="empty-state">
      <div class="empty-icon">📋</div>
      <h3>暂无{{ activeTab === 'pending' ? '待处理' : '已完成' }}任务</h3>
      <p>{{ activeType === 'all' ? '当前没有' : getTypeText }}记录</p>
      </div>
    </div>

    <Modal
      v-model="showPayModal"
      icon="💳"
      icon-type="info"
      title="确认付款"
      :subtitle="paySubtitle"
      size="small"
      confirm-text="确认支付"
      :loading="payLoading"
      @confirm="confirmPay"
    >
      <div class="pay-info">
        <div class="pay-item">
          <span class="pay-label">订单编号</span>
          <span class="pay-value">{{ selectedTask?.id }}</span>
        </div>
        <div class="pay-item">
          <span class="pay-label">项目名称</span>
          <span class="pay-value">{{ selectedTask?.title }}</span>
        </div>
        <div class="pay-item">
          <span class="pay-label">项目类型</span>
          <span class="pay-value">{{ selectedTask?.typeName }}</span>
        </div>
        <div class="pay-total">
          <span class="pay-label">应付金额</span>
          <span class="pay-amount">¥{{ selectedTask?.amount?.toLocaleString() }}</span>
        </div>
      </div>
    </Modal>

    <Modal
      v-model="showCancelModal"
      icon="warning"
      icon-type="warning"
      title="确认取消"
      subtitle="确定要取消此任务吗？"
      size="small"
      confirm-text="确认取消"
      confirm-type="danger"
      :loading="cancelLoading"
      @confirm="confirmCancel"
    />

    <Modal
      v-model="showDetailModal"
      :title="selectedTask?.typeName + '详情'"
      size="medium"
      :show-footer="false"
    >
      <div v-if="selectedTask" class="detail-content">
        <div class="detail-header">
          <div class="detail-icon">{{ selectedTask.typeIcon }}</div>
          <div class="detail-info">
            <h3>{{ selectedTask.title }}</h3>
            <div class="detail-status" :class="selectedTask.statusType">
              {{ selectedTask.statusText }}
            </div>
          </div>
        </div>
        <div class="detail-list">
          <div class="detail-row">
            <span class="detail-label">任务编号</span>
            <span class="detail-value">{{ selectedTask.id }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">任务类型</span>
            <span class="detail-value">{{ selectedTask.typeName }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">任务描述</span>
            <span class="detail-value">{{ selectedTask.subtitle }}</span>
          </div>
          <div v-if="selectedTask.amount > 0" class="detail-row">
            <span class="detail-label">交易金额</span>
            <span class="detail-value amount">¥{{ selectedTask.amount.toLocaleString() }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">创建时间</span>
            <span class="detail-value">{{ selectedTask.createdAt }}</span>
          </div>
        </div>
      </div>
    </Modal>

    <Modal
      v-model="showSuccessModal"
      icon="🎉"
      icon-type="success"
      :title="successTitle"
      :subtitle="successMessage"
      size="small"
      :show-cancel="false"
      confirm-text="我知道了"
      @confirm="showSuccessModal = false"
    />

    <Toast
      v-model="showToast"
      :type="toastType"
      :title="toastTitle"
      :message="toastMessage"
    />
  </div>
</template>

<script>
import Modal from '../components/Modal.vue'
import Toast from '../components/Toast.vue'
import { logger } from '../utils/api'
import { authState } from '../utils/auth'
import { taskStore } from '../utils/taskStore'

export default {
  name: 'Tasks',
  components: { Modal, Toast },
  data() {
    return {
      activeTab: 'pending',
      activeType: 'all',
      selectedTask: null,
      showPayModal: false,
      showCancelModal: false,
      showDetailModal: false,
      showSuccessModal: false,
      payLoading: false,
      cancelLoading: false,
      successTitle: '',
      successMessage: '',
      showToast: false,
      toastType: 'success',
      toastTitle: '',
      toastMessage: '',
      refreshKey: 0
    }
  },
  computed: {
    paySubtitle() {
      if (!this.selectedTask || this.selectedTask.amount == null) return ''
      return '确认支付 ¥' + this.selectedTask.amount.toLocaleString() + ' 元'
    },
    allTasks() {
      this.refreshKey
      return taskStore.getAll()
    },
    pendingTasks() {
      return this.allTasks.filter(task => task.statusGroup === 'pending')
    },
    completedTasks() {
      return this.allTasks.filter(task => task.statusGroup === 'completed')
    },
    pendingCount() {
      return this.pendingTasks.length
    },
    completedCount() {
      return this.completedTasks.length
    },
    currentTabTasks() {
      return this.activeTab === 'pending' ? this.pendingTasks : this.completedTasks
    },
    filteredTasks() {
      if (this.activeType === 'all') {
        return this.currentTabTasks
      }
      return this.currentTabTasks.filter(task => task.type === this.activeType)
    },
    isLoggedIn() {
      return authState.isLoggedIn
    }
  },
  mounted() {
    this.refreshTasks()
  },
  activated() {
    this.refreshTasks()
  },
  methods: {
    refreshTasks() {
      this.refreshKey++
    },
    getTypeText() {
      const typeMap = {
        booking: '预约',
        course: '课程',
        competition: '赛事',
        order: '订单'
      }
      return typeMap[this.activeType] || ''
    },
    switchTab(tab) {
      this.activeTab = tab
    },
    handleAction(task, action) {
      this.selectedTask = { ...task }

      // 带路由的动作统一跳转业务页面（支付、再次预约/购买、各类型的查看等）
      if (action.route) {
        this.navigateToRoute(action.route, action.key, task)
        return
      }

      // 无路由的动作走站内统一处理
      const actionMap = {
        cancel: () => this.openCancelModal(),
        view: () => this.openDetailModal(),
        remind: () => this.handleRemind(),
        confirm: () => this.handleConfirm(),
        review: () => this.handleReview()
      }
      const handler = actionMap[action.key]
      if (handler) handler()
    },
    navigateToRoute(route, actionKey, task) {
      logger.info('Navigate to business page', { route, actionKey, taskId: task.id, type: task.type })

      // query 参数由任务类型配置统一生成
      this.$router.push({ path: route, query: taskStore.getDetailQuery(task) })
    },
    openPayModal() {
      this.showPayModal = true
    },
    openCancelModal() {
      this.showCancelModal = true
    },
    openDetailModal() {
      this.showDetailModal = true
    },
    async confirmPay() {
      if (!this.selectedTask) return
      this.payLoading = true
      
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const updatedTask = taskStore.markAsPaid(this.selectedTask.id)
      
      this.payLoading = false
      this.showPayModal = false
      
      if (updatedTask) {
        this.refreshTasks()
        this.successTitle = '支付成功'
        this.successMessage = '您的订单已支付成功'
        this.showSuccessModal = true
        logger.info('Payment successful', { taskId: this.selectedTask.id, amount: this.selectedTask.amount })
      } else {
        this.showNotification('error', '支付失败', '请稍后重试')
      }
    },
    async confirmCancel() {
      if (!this.selectedTask) return
      this.cancelLoading = true

      await new Promise(resolve => setTimeout(resolve, 800))

      // 取消即状态迁移：任务数据与金额保留，状态统一迁移为「已取消」
      const result = taskStore.cancel(this.selectedTask.id)

      this.cancelLoading = false
      this.showCancelModal = false

      if (result) {
        this.refreshTasks()
        this.showNotification('success', '取消成功', '任务已取消')
        logger.info('Task cancelled', { taskId: this.selectedTask.id })
      } else {
        this.showNotification('error', '取消失败', '请稍后重试')
      }
    },
    async handleRemind() {
      if (!this.selectedTask) return
      this.showNotification('success', '已提醒', '已提醒卖家尽快发货')
      logger.info('Reminder sent', { taskId: this.selectedTask.id })
    },
    handleConfirm() {
      if (!this.selectedTask) return
      const result = taskStore.updateStatus(this.selectedTask.id, 'completed')
      if (result) {
        this.refreshTasks()
        this.showNotification('success', '确认收货成功', '感谢您的购买')
      }
    },
    handleReview() {
      if (!this.selectedTask) return
      this.showNotification('info', '评价功能', '评价功能开发中，敬请期待')
    },
    showNotification(type, title, message) {
      this.toastType = type
      this.toastTitle = title
      this.toastMessage = message
      this.showToast = true
    }
  }
}
</script>

<style scoped>
.tasks-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 3rem 4rem;
}

.container {
  max-width: 1000px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 2rem;
}

.header-content h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.header-actions {
  display: flex;
  align-items: center;
}

.stats-summary {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1rem 1.5rem;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.stat-icon {
  font-size: 1.5rem;
}

.stat-text {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1;
}

.stat-item.pending .stat-value {
  color: #ffc107;
}

.stat-item.completed .stat-value {
  color: var(--primary);
}

.stat-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.stat-divider {
  width: 1px;
  height: 40px;
  background: var(--border);
}

.filter-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  gap: 1rem;
  flex-wrap: wrap;
}

.tab-group {
  display: flex;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 4px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.25rem;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.active {
  background: var(--gradient-1);
  color: var(--bg-dark);
}

.tab-badge {
  background: rgba(0, 0, 0, 0.2);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 600;
}

.type-filters {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.filter-btn {
  padding: 0.5rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 20px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.3s;
}

.filter-btn:hover {
  border-color: var(--primary);
  color: var(--text-primary);
}

.filter-btn.active {
  background: rgba(0, 217, 165, 0.15);
  border-color: rgba(0, 217, 165, 0.3);
  color: var(--primary);
}

.tasks-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.task-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 1.5rem;
  transition: all 0.3s;
}

.task-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow);
}

.task-card.warning {
  border-left: 4px solid #ffc107;
}

.task-card.primary {
  border-left: 4px solid var(--primary);
}

.task-card.info {
  border-left: 4px solid #4facfe;
}

.task-card.success {
  border-left: 4px solid #6c757d;
  opacity: 0.9;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.task-type {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.type-icon {
  font-size: 1.25rem;
}

.type-name {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.task-status {
  padding: 0.35rem 0.8rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
}

.task-status.warning {
  background: rgba(255, 193, 7, 0.15);
  color: #ffc107;
}

.task-status.primary {
  background: rgba(0, 217, 165, 0.15);
  color: var(--primary);
}

.task-status.info {
  background: rgba(79, 172, 254, 0.15);
  color: #4facfe;
}

.task-status.success {
  background: rgba(108, 117, 125, 0.15);
  color: #6c757d;
}

.task-body {
  margin-bottom: 1rem;
}

.task-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.35rem;
}

.task-subtitle {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.task-meta {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.task-amount {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--primary);
}

.task-date {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.task-date svg {
  width: 14px;
  height: 14px;
}

.task-actions {
  display: flex;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.action-btn {
  padding: 0.6rem 1.25rem;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  border: none;
}

.action-btn.primary {
  background: var(--gradient-1);
  color: var(--bg-dark);
}

.action-btn.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px var(--primary-glow);
}

.action-btn.default {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.action-btn.default:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--text-muted);
}

.action-btn.danger {
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.3);
  color: #ff6b6b;
}

.action-btn.danger:hover {
  background: rgba(255, 107, 107, 0.2);
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state h3 {
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
}

.empty-state p {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.pay-info {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.pay-item,
.detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
}

.pay-label,
.detail-label {
  color: var(--text-secondary);
}

.pay-value,
.detail-value {
  font-weight: 500;
}

.pay-total {
  display: flex;
  justify-content: space-between;
  padding-top: 0.75rem;
  margin-top: 0.5rem;
  border-top: 1px solid var(--border);
}

.pay-amount {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--primary);
}

.detail-content {
  padding: 0.5rem;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-bottom: 1.5rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}

.detail-icon {
  font-size: 3rem;
}

.detail-info h3 {
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
}

.detail-status {
  display: inline-block;
  padding: 0.35rem 0.8rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
}

.detail-status.warning {
  background: rgba(255, 193, 7, 0.15);
  color: #ffc107;
}

.detail-status.primary {
  background: rgba(0, 217, 165, 0.15);
  color: var(--primary);
}

.detail-status.info {
  background: rgba(79, 172, 254, 0.15);
  color: #4facfe;
}

.detail-status.success {
  background: rgba(108, 117, 125, 0.15);
  color: #6c757d;
}

.detail-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-value.amount {
  color: var(--primary);
  font-weight: 600;
}

@media (max-width: 768px) {
  .tasks-page {
    padding: 1rem 1.5rem 3rem;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .filter-section {
    flex-direction: column;
    align-items: flex-start;
  }

  .tab-group {
    width: 100%;
  }

  .tab-btn {
    flex: 1;
    justify-content: center;
  }

  .task-actions {
    flex-wrap: wrap;
  }

  .action-btn {
    flex: 1;
    min-width: 120px;
  }
}
</style>
