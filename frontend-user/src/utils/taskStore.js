/**
 * 任务中心存储管理
 * 统一管理预约、报名、订单等任务数据，使用 localStorage 持久化
 *
 * 规则收拢说明：
 * - statusConfig 是唯一的状态元表：文案/样式/分组（待处理/已完成）一处声明，
 *   视图筛选、计数、动作生成全部从这里派生，新增状态无需再改筛选分支
 * - actionPresets + 类型动作矩阵统一生成各状态下的动作
 * - transitionTo 是唯一的状态迁移入口，支付/取消/确认收货都走同一套规则
 * - 详情跳转的 query 拼装由 detailQueryKeys 配置驱动
 */

const STORAGE_KEY = 'billiard_user_tasks'
const logger = {
  info: (...args) => console.log('[taskStore]', ...args),
  warn: (...args) => console.warn('[taskStore]', ...args),
  error: (...args) => console.error('[taskStore]', ...args)
}

// ==================== 状态元表（唯一规则来源） ====================

// 终态分组：归入「已完成」页签的状态；其余所有状态统一归入「待处理」
const FINISHED_GROUPS = new Set(['completed', 'cancelled'])

/**
 * 每个状态的展示与分组规则
 * - text: 状态文案
 * - type: 样式类型（warning/info/primary/success）
 * - group: pending=待处理, completed=已完成
 */
const statusConfig = {
  pending_payment: { text: '待付款', type: 'warning', group: 'pending' },
  upcoming: { text: '待开始', type: 'info', group: 'pending' },
  ongoing: { text: '进行中', type: 'primary', group: 'pending' },
  pending_shipment: { text: '待发货', type: 'warning', group: 'pending' },
  shipped: { text: '已发货', type: 'info', group: 'pending' },
  completed: { text: '已完成', type: 'success', group: 'completed' },
  cancelled: { text: '已取消', type: 'success', group: 'completed' }
}

/**
 * 未知状态的兜底规则：不崩溃、可重新读取，默认按待处理展示
 */
const fallbackStatus = { text: '', type: 'info', group: 'pending' }

function getStatusMeta(status) {
  return statusConfig[status] || { ...fallbackStatus, text: status || '' }
}

function isFinishedStatus(status) {
  const meta = statusConfig[status]
  // 已知状态按元表分组；未知状态默认归入待处理（与历史的「非终态即待处理」一致）
  return meta ? meta.group === 'completed' : FINISHED_GROUPS.has(status)
}

// ==================== 动作生成（预设 + 类型矩阵） ====================

/**
 * 动作预设：key 为动作唯一标识，使用类型默认路由时标记 useTypeRoute
 * 类型矩阵中以字符串引用预设，仅在需要覆盖时传对象，避免重复声明整块动作
 */
const actionPresets = {
  pay: { key: 'pay', label: '继续付款', type: 'primary', useTypeRoute: true },
  cancel: { key: 'cancel', label: '取消', type: 'danger' },
  view: { key: 'view', label: '查看详情', type: 'primary' },
  viewResult: { key: 'view', label: '查看结果', type: 'default' },
  rebook: { key: 'rebook', label: '再次预约', type: 'primary', useTypeRoute: true },
  rebuy: { key: 'rebuy', label: '再次购买', type: 'default', useTypeRoute: true },
  remind: { key: 'remind', label: '提醒发货', type: 'default' },
  confirm: { key: 'confirm', label: '确认收货', type: 'primary' },
  review: { key: 'review', label: '评价', type: 'primary' }
}

/**
 * 动作矩阵：每个任务类型下按状态列出动作
 * 条目为字符串时直接引用预设；为对象时覆盖预设字段（如文案/路由）
 */
const taskTypeConfig = {
  booking: {
    name: '球桌预约',
    icon: '🎱',
    route: '/tables',
    // 支付完成后进入的状态与副标题
    paidStatus: 'upcoming',
    paidSubtitle: '支付成功，等待使用',
    detailQueryKeys: ['tableId'],
    actions: {
      pending_payment: ['pay', 'cancel'],
      upcoming: [
        'view',
        { key: 'rebook', label: '再次预约', type: 'default' }
      ],
      ongoing: ['view'],
      completed: [
        'viewResult',
        { key: 'rebook', type: 'primary' }
      ]
    }
  },
  course: {
    name: '课程报名',
    icon: '📚',
    route: '/courses',
    paidStatus: 'upcoming',
    paidSubtitle: '支付成功，等待开课',
    detailQueryKeys: ['courseId'],
    actions: {
      pending_payment: ['pay', 'cancel'],
      upcoming: [{ key: 'view', route: '/courses' }],
      ongoing: [{ key: 'view', label: '继续学习', route: '/courses' }],
      completed: [
        'viewResult',
        'review'
      ]
    }
  },
  competition: {
    name: '赛事报名',
    icon: '🏆',
    route: '/competitions',
    paidStatus: 'upcoming',
    paidSubtitle: '支付成功',
    detailQueryKeys: ['competitionId'],
    actions: {
      pending_payment: ['pay', 'cancel'],
      upcoming: [{ key: 'view', label: '查看赛程', route: '/competitions' }],
      ongoing: [{ key: 'view', label: '观看直播', route: '/competitions' }],
      completed: [{ key: 'viewResult', route: '/competitions' }]
    }
  },
  order: {
    name: '商城订单',
    icon: '🛒',
    route: '/shop',
    paidStatus: 'pending_shipment',
    paidSubtitle: '支付成功，待发货',
    detailQueryKeys: ['orderNo'],
    actions: {
      pending_payment: ['pay', 'cancel'],
      pending_shipment: [
        { key: 'view', label: '查看订单', route: '/shop' },
        'remind'
      ],
      shipped: [
        { key: 'view', label: '查看物流', route: '/shop' },
        'confirm'
      ],
      completed: [
        { key: 'viewResult', route: '/shop' },
        'review',
        'rebuy'
      ]
    }
  }
}

/**
 * 根据类型/状态矩阵生成具体动作列表（带兜底，任何状态都不会抛错）
 */
function buildActions(type, status) {
  const matrix = taskTypeConfig[type]?.actions?.[status]
  if (!matrix) return []

  return matrix.map(entry => {
    const preset = actionPresets[entry]
    if (preset) {
      const { useTypeRoute, ...action } = preset
      if (useTypeRoute) action.route = taskTypeConfig[type].route
      return action
    }

    // 对象形式：在预设基础上覆盖，未命中预设时原样使用
    const base = actionPresets[entry.key] || {}
    const { useTypeRoute, ...overrides } = entry
    // 动作 key 以预设登记的为准（入口 key 可能只是预设名，如 viewResult -> view）
    const action = { ...base, ...overrides, key: base.key || entry.key }
    const shouldUseTypeRoute = base.useTypeRoute || useTypeRoute
    delete action.useTypeRoute
    if (shouldUseTypeRoute) {
      action.route = taskTypeConfig[type].route
    }
    return action
  })
}

// ==================== 存储读写（含异常恢复） ====================

function loadTasks() {
  let stored
  try {
    stored = localStorage.getItem(STORAGE_KEY)
  } catch (e) {
    logger.error('读取任务存储失败', e)
    return getDefaultTasks()
  }

  if (!stored) return getDefaultTasks()

  let parsed
  try {
    parsed = JSON.parse(stored)
  } catch (e) {
    // 整体数据损坏：回落到默认数据，保证页面可用
    logger.error('解析任务数据失败，已恢复默认数据', e)
    return getDefaultTasks()
  }

  if (!Array.isArray(parsed)) {
    logger.error('任务数据格式异常，已恢复默认数据')
    return getDefaultTasks()
  }

  // 单条脏数据恢复：跳过缺 id/type 的坏条目，其余正常读取
  const valid = parsed.filter(task => task && task.id != null && task.type)
  if (valid.length !== parsed.length) {
    logger.warn('已自动过滤损坏的任务条目', parsed.length - valid.length)
  }
  return valid
}

function saveTasks(tasks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
    return true
  } catch (e) {
    logger.error('保存任务失败', e)
    return false
  }
}

function getDefaultTasks() {
  return [
    {
      id: 'T' + Date.now().toString() + '001',
      type: 'booking',
      title: '3号球桌 - 美式九球',
      subtitle: '2026-02-15 14:00 - 16:00',
      amount: 120,
      status: 'pending_payment',
      createdAt: formatDate(new Date(Date.now() - 86400000)),
      extra: { tableId: 3, date: '2026-02-15', time: '14:00 - 16:00' }
    },
    {
      id: 'T' + Date.now().toString() + '002',
      type: 'course',
      title: '台球入门基础课',
      subtitle: '报名成功，等待开课',
      amount: 599,
      status: 'upcoming',
      createdAt: formatDate(new Date(Date.now() - 259200000)),
      extra: { courseId: 1 }
    },
    {
      id: 'T' + Date.now().toString() + '003',
      type: 'competition',
      title: '周末九球挑战赛',
      subtitle: '比赛进行中',
      amount: 100,
      status: 'ongoing',
      createdAt: formatDate(new Date(Date.now() - 432000000)),
      extra: { competitionId: 2 }
    },
    {
      id: 'T' + Date.now().toString() + '004',
      type: 'order',
      title: 'LP专业斯诺克球杆',
      subtitle: '待发货',
      amount: 2999,
      status: 'pending_shipment',
      createdAt: formatDate(new Date(Date.now() - 172800000)),
      extra: { orderNo: 'SP' + Date.now().toString().slice(-8), productId: 1 }
    }
  ]
}

function formatDate(date) {
  const d = new Date(date)
  const pad = n => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function generateTaskId() {
  return 'T' + Date.now().toString() + Math.floor(Math.random() * 1000).toString().padStart(3, '0')
}

function enrichTask(task) {
  const typeInfo = taskTypeConfig[task.type]
  const statusInfo = getStatusMeta(task.status)

  return {
    ...task,
    typeName: typeInfo?.name || task.type,
    typeIcon: typeInfo?.icon || '📋',
    statusText: statusInfo.text,
    statusType: statusInfo.type,
    statusGroup: statusInfo.group,
    actions: buildActions(task.type, task.status)
  }
}

/**
 * 统一的详情跳转 query 拼装：按类型配置的字段从 extra 中提取
 */
function buildDetailQuery(task) {
  const query = {}
  if (!task.extra) return query

  const keys = taskTypeConfig[task.type]?.detailQueryKeys || []
  keys.forEach(key => {
    if (task.extra[key] != null) {
      query[key] = task.extra[key]
    }
  })
  return query
}

// ==================== 状态迁移（单一入口） ====================

const CANCELLED_STATUS = 'cancelled'

export const taskStore = {
  getAll() {
    const tasks = loadTasks()
    return tasks.map(enrichTask).sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    )
  },

  getByStatus(group) {
    const tasks = this.getAll()
    if (group === 'pending') {
      return tasks.filter(t => !isFinishedStatus(t.status))
    }
    if (group === 'completed') {
      return tasks.filter(t => isFinishedStatus(t.status))
    }
    return tasks
  },

  getById(taskId) {
    const tasks = loadTasks()
    const task = tasks.find(t => t.id === taskId)
    return task ? enrichTask(task) : null
  },

  add(taskData) {
    const tasks = loadTasks()
    const newTask = {
      id: generateTaskId(),
      createdAt: formatDate(new Date()),
      ...taskData
    }
    tasks.unshift(newTask)
    saveTasks(tasks)
    logger.info('任务已添加', newTask)
    return enrichTask(newTask)
  },

  update(taskId, updates) {
    const tasks = loadTasks()
    const index = tasks.findIndex(t => t.id === taskId)
    if (index === -1) {
      logger.warn('任务不存在', taskId)
      return null
    }
    tasks[index] = { ...tasks[index], ...updates }
    saveTasks(tasks)
    logger.info('任务已更新', taskId, updates)
    return enrichTask(tasks[index])
  },

  /**
   * 唯一的状态迁移入口：支付、取消、确认收货等所有状态变更共用
   * @param {string} taskId
   * @param {string} newStatus - 目标状态（必须在状态元表中登记）
   * @param {Object} extraUpdates - 同时更新的其他字段（如 subtitle）
   * @returns 迁移后的任务；任务不存在或状态未登记时返回 null
   */
  transitionTo(taskId, newStatus, extraUpdates = {}) {
    if (!statusConfig[newStatus]) {
      logger.error('无效的状态，迁移已中止', newStatus)
      return null
    }
    return this.update(taskId, { status: newStatus, ...extraUpdates })
  },

  updateStatus(taskId, newStatus) {
    return this.transitionTo(taskId, newStatus)
  },

  /**
   * 取消任务：统一走状态迁移（保留任务数据与金额，仅状态变为已取消）
   */
  cancel(taskId) {
    return this.transitionTo(taskId, CANCELLED_STATUS)
  },

  remove(taskId) {
    const tasks = loadTasks()
    const filtered = tasks.filter(t => t.id !== taskId)
    if (filtered.length === tasks.length) {
      logger.warn('任务不存在，无法删除', taskId)
      return false
    }
    saveTasks(filtered)
    logger.info('任务已删除', taskId)
    return true
  },

  addBookingTask(table, bookingInfo) {
    return this.add({
      type: 'booking',
      title: `${table.name} - ${table.type}`,
      subtitle: `${bookingInfo.date} ${bookingInfo.time}`,
      amount: table.price * bookingInfo.duration,
      status: 'pending_payment',
      extra: {
        tableId: table.id,
        date: bookingInfo.date,
        time: bookingInfo.time,
        duration: bookingInfo.duration,
        orderNo: bookingInfo.orderNo
      }
    })
  },

  addCourseTask(course, enrollInfo) {
    return this.add({
      type: 'course',
      title: course.name,
      subtitle: '报名成功，等待开课',
      amount: course.price,
      status: 'upcoming',
      extra: {
        courseId: course.id,
        orderNo: enrollInfo.orderNo,
        coach: course.coach,
        lessons: course.lessons
      }
    })
  },

  addCompetitionTask(competition, regInfo) {
    return this.add({
      type: 'competition',
      title: competition.name,
      subtitle: competition.status === 'upcoming' ? '等待比赛开始' : '比赛进行中',
      amount: competition.fee,
      status: competition.status === 'upcoming' ? 'upcoming' : 'ongoing',
      extra: {
        competitionId: competition.id,
        regNo: regInfo.regNo,
        playerNo: regInfo.playerNo,
        date: competition.date
      }
    })
  },

  addOrderTask(order) {
    return this.add({
      type: 'order',
      title: order.items.map(i => i.name).join('、'),
      subtitle: '已下单，待发货',
      amount: order.amount,
      status: 'pending_shipment',
      extra: {
        orderNo: order.orderNo,
        items: order.items,
        createTime: order.createTime
      }
    })
  },

  /**
   * 支付完成：目标状态/副标题从类型配置读取，仍走统一迁移入口
   */
  markAsPaid(taskId) {
    const task = this.getById(taskId)
    if (!task) return null

    const typeInfo = taskTypeConfig[task.type]
    const newStatus = typeInfo?.paidStatus || 'upcoming'
    const newSubtitle = typeInfo?.paidSubtitle || '支付成功'

    return this.transitionTo(taskId, newStatus, { subtitle: newSubtitle })
  },

  getPendingCount() {
    return this.getByStatus('pending').length
  },

  getCompletedCount() {
    return this.getByStatus('completed').length
  },

  /**
   * 供视图层复用的统一规则
   */
  isFinished: task => isFinishedStatus(task.status || task),
  getDetailQuery: task => buildDetailQuery(task),

  clearAll() {
    saveTasks([])
    logger.info('所有任务已清除')
  }
}

export default taskStore
