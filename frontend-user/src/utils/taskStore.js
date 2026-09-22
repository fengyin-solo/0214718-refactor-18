/**
 * 任务中心存储管理
 * 统一管理预约、报名、订单等任务数据，使用 localStorage 持久化
 *
 * 设计说明（统一规则引擎）：
 * - STATUS_REGISTRY：所有状态的唯一事实来源（文案、配色、所属分组、迁移规则）
 * - TASK_TYPES：各任务类型的唯一事实来源（名称、图标、详情跳转、动作、支付后的状态）
 * 新增一种状态时，只需在 STATUS_REGISTRY 增加一项并按需配置动作，
 * 状态分组、迁移校验、动作生成、重新读取与异常恢复会自动复用同一套规则，
 * 无需在视图、存储、跳转等位置分别增加分支。
 */

const STORAGE_KEY = 'billiard_user_tasks'
const logger = {
  info: (...args) => console.log('[taskStore]', ...args),
  warn: (...args) => console.warn('[taskStore]', ...args),
  error: (...args) => console.error('[taskStore]', ...args)
}

// ==================== 状态规则 ====================

/**
 * 状态分组：所有状态都归入同一套分组规则
 * - pending   待处理（未结束）
 * - completed 已完成（终态）
 * - cancelled 已取消（终态，默认不在页面 Tab 中展示）
 */
const STATUS_GROUPS = {
  pending_payment: 'pending',
  upcoming: 'pending',
  ongoing: 'pending',
  pending_shipment: 'pending',
  shipped: 'pending',
  completed: 'completed',
  cancelled: 'cancelled'
}

// 支付动作的目标状态由任务类型决定，使用标记位在迁移表中占位
const PAID = '__PAID_STATUS__'

/**
 * 状态注册表：文案、配色、分组、可执行的状态迁移
 * transitions 以「动作 -> 目标状态」描述合法迁移，PAID 表示取类型的 paidStatus
 */
const STATUS_REGISTRY = {
  pending_payment: { text: '待付款', type: 'warning', group: 'pending', transitions: { pay: PAID, cancel: 'cancelled' } },
  upcoming: { text: '待开始', type: 'info', group: 'pending', transitions: { cancel: 'cancelled' } },
  ongoing: { text: '进行中', type: 'primary', group: 'pending', transitions: {} },
  pending_shipment: { text: '待发货', type: 'warning', group: 'pending', transitions: { cancel: 'cancelled' } },
  shipped: { text: '已发货', type: 'info', group: 'pending', transitions: { confirm: 'completed' } },
  completed: { text: '已完成', type: 'success', group: 'completed', transitions: {} },
  cancelled: { text: '已取消', type: 'success', group: 'cancelled', transitions: {} }
}

// 未知状态的兜底规则（异常恢复：不允许任何迁移）
const FALLBACK_STATUS = { text: '', type: 'info', group: 'other', transitions: {} }

// ==================== 动作生成（共享工厂，减少跨类型重复） ====================

const payAction = route => ({ key: 'pay', label: '继续付款', type: 'primary', route })
const cancelAction = () => ({ key: 'cancel', label: '取消', type: 'danger' })
const viewAction = (label = '查看详情', route) => {
  const action = { key: 'view', label, type: 'primary' }
  if (route) action.route = route
  return action
}
const resultAction = route => {
  const action = { key: 'view', label: '查看结果', type: 'default' }
  if (route) action.route = route
  return action
}
const rebookAction = () => ({ key: 'rebook', label: '再次预约', type: 'primary', route: '/tables' })
const rebuyAction = () => ({ key: 'rebuy', label: '再次购买', type: 'default', route: '/shop' })
const remindAction = () => ({ key: 'remind', label: '提醒发货', type: 'default' })
const confirmAction = () => ({ key: 'confirm', label: '确认收货', type: 'primary' })
const reviewAction = () => ({ key: 'review', label: '评价', type: 'primary' })

/**
 * 任务类型注册表：名称、图标、详情页路由、跳转携带的 query 字段、
 * 支付后的状态与文案、各状态下的动作
 */
const TASK_TYPES = {
  booking: {
    name: '球桌预约',
    icon: '🎱',
    route: '/tables',
    queryKey: 'tableId',
    paidStatus: 'upcoming',
    paidSubtitle: '支付成功，等待使用',
    actions: {
      pending_payment: [payAction('/tables'), cancelAction()],
      upcoming: [viewAction(), rebookAction()],
      ongoing: [viewAction()],
      completed: [resultAction(), rebookAction()]
    }
  },
  course: {
    name: '课程报名',
    icon: '📚',
    route: '/courses',
    queryKey: 'courseId',
    paidStatus: 'upcoming',
    paidSubtitle: '支付成功，等待开课',
    actions: {
      pending_payment: [payAction('/courses'), cancelAction()],
      upcoming: [viewAction('查看详情', '/courses')],
      ongoing: [viewAction('继续学习', '/courses')],
      completed: [resultAction(), reviewAction()]
    }
  },
  competition: {
    name: '赛事报名',
    icon: '🏆',
    route: '/competitions',
    queryKey: 'competitionId',
    paidStatus: 'upcoming',
    paidSubtitle: '支付成功',
    actions: {
      pending_payment: [payAction('/competitions'), cancelAction()],
      upcoming: [viewAction('查看赛程', '/competitions')],
      ongoing: [viewAction('观看直播', '/competitions')],
      completed: [resultAction('/competitions')]
    }
  },
  order: {
    name: '商城订单',
    icon: '🛒',
    route: '/shop',
    queryKey: 'orderNo',
    paidStatus: 'pending_shipment',
    paidSubtitle: '支付成功，待发货',
    actions: {
      pending_payment: [payAction('/shop'), cancelAction()],
      pending_shipment: [viewAction('查看订单', '/shop'), remindAction()],
      shipped: [viewAction('查看物流', '/shop'), confirmAction()],
      completed: [resultAction('/shop'), reviewAction(), rebuyAction()]
    }
  }
}

const FALLBACK_TYPE = { name: '', icon: '📋', route: null, queryKey: null, paidStatus: 'upcoming', paidSubtitle: '支付成功', actions: {} }

// ==================== 规则查询（供视图与存储统一复用） ====================

function getStatusRule(status) {
  return STATUS_REGISTRY[status] || { ...FALLBACK_STATUS, text: status }
}

function getTypeRule(type) {
  return TASK_TYPES[type] || { ...FALLBACK_TYPE, name: type }
}

function getStatusGroup(status) {
  return getStatusRule(status).group
}

function isStatusInGroup(status, group) {
  return getStatusGroup(status) === group
}

/** 统一的动作生成：按类型 + 状态从注册表取动作，每次返回独立副本，避免共享引用 */
function getActions(type, status) {
  const list = getTypeRule(type).actions[status] || []
  return list.map(action => ({ ...action }))
}

/** 统一的详情跳转描述：路由 + 需要携带的业务 query */
function getNavigation(task) {
  const typeInfo = getTypeRule(task.type)
  if (!typeInfo.route) return null

  const query = {}
  if (task.extra && typeInfo.queryKey) {
    const value = task.extra[typeInfo.queryKey]
    if (value != null) {
      query[typeInfo.queryKey] = value
    }
  }
  return { path: typeInfo.route, query }
}

/**
 * 统一的状态迁移：校验当前状态与动作是否合法，返回目标状态
 * 非法迁移（未知状态/动作/自循环）返回 null，由调用方走异常提示
 */
function resolveTargetStatus(task, action) {
  const statusInfo = STATUS_REGISTRY[task.status]
  if (!statusInfo) return null

  const target = statusInfo.transitions[action]
  if (!target || target === task.status) return null

  if (target === PAID) {
    return getTypeRule(task.type).paidStatus
  }
  return target
}

// ==================== 持久化与异常恢复 ====================

// 内存兜底：localStorage 不可用（隐私模式/配额异常）时保证操作结果仍生效
let memoryTasks = null

/** 校验单条任务的最小结构，剔除脏数据，保证重新读取不会让整页崩溃 */
function isValidTask(task) {
  return (
    !!task &&
    typeof task === 'object' &&
    typeof task.id === 'string' &&
    typeof task.type === 'string' &&
    typeof task.status === 'string'
  )
}

function loadTasks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      const defaults = getDefaultTasks()
      memoryTasks = defaults
      return defaults
    }

    let parsed
    try {
      parsed = JSON.parse(stored)
    } catch (e) {
      logger.error('解析任务数据失败，已恢复默认数据', e)
      const defaults = getDefaultTasks()
      memoryTasks = defaults
      return defaults
    }

    if (!Array.isArray(parsed)) {
      logger.error('任务数据格式异常，已恢复默认数据')
      const defaults = getDefaultTasks()
      memoryTasks = defaults
      return defaults
    }

    // 过滤结构异常的单条记录，保留其余可用数据
    const valid = parsed.filter(isValidTask)
    if (valid.length < parsed.length) {
      logger.warn('已忽略部分异常任务记录', { ignored: parsed.length - valid.length })
    }
    memoryTasks = valid
    return valid
  } catch (e) {
    logger.error('加载任务失败，使用内存数据', e)
    if (memoryTasks) return memoryTasks
    const defaults = getDefaultTasks()
    memoryTasks = defaults
    return defaults
  }
}

function saveTasks(tasks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  } catch (e) {
    // 保存失败不中断业务：写入内存兜底，本次会话内重新读取仍能拿到最新结果
    logger.error('保存任务失败，已临时保存在内存中', e)
  }
  memoryTasks = tasks
  return true
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
  const typeInfo = getTypeRule(task.type)
  const statusInfo = getStatusRule(task.status)

  return {
    ...task,
    typeName: typeInfo.name,
    typeIcon: typeInfo.icon,
    statusText: statusInfo.text,
    statusType: statusInfo.type,
    actions: getActions(task.type, task.status)
  }
}

export const taskStore = {
  // 暴露规则常量，供视图复用同一套分组/跳转规则，避免再写分支
  STATUS_GROUPS,

  /** 重新读取：每次都从持久层（或内存兜底）拉取并按规则装配，按创建时间倒序 */
  getAll() {
    const tasks = loadTasks()
    return tasks.map(enrichTask).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  },

  /** 按分组读取：pending / completed / cancelled，所有状态共用同一套分组规则 */
  getByGroup(group) {
    return this.getAll().filter(t => isStatusInGroup(t.status, group))
  },

  /**
   * 兼容既有调用：
   * - 'pending' / 'completed' 按分组过滤
   * - 具体状态名（如 'shipped'）按精确状态过滤
   * - 未知值返回全部
   */
  getByStatus(status) {
    // 分组名统一按注册表归类；其余已注册状态按精确状态过滤；未知值返回全部
    const groups = new Set(Object.values(STATUS_GROUPS))
    if (groups.has(status)) {
      return this.getByGroup(status)
    }
    if (STATUS_REGISTRY[status]) {
      return this.getAll().filter(t => t.status === status)
    }
    return this.getAll()
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
   * 统一的状态迁移入口：基于 STATUS_REGISTRY 的迁移表校验并执行
   * @param {string} taskId 任务 ID
   * @param {string} action 动作（pay / cancel / confirm ...）
   * @param {Object} [patch] 同时更新的字段（如支付后的 subtitle）
   * @returns 迁移后的任务；任务不存在或迁移非法时返回 null
   */
  transition(taskId, action, patch = {}) {
    const tasks = loadTasks()
    const index = tasks.findIndex(t => t.id === taskId)
    if (index === -1) {
      logger.warn('任务不存在，无法执行操作', { taskId, action })
      return null
    }

    const targetStatus = resolveTargetStatus(tasks[index], action)
    if (!targetStatus) {
      logger.warn('当前状态不允许该操作', { taskId, status: tasks[index].status, action })
      return null
    }

    tasks[index] = { ...tasks[index], ...patch, status: targetStatus }
    saveTasks(tasks)
    logger.info('任务状态已迁移', { taskId, action, to: targetStatus })
    return enrichTask(tasks[index])
  },

  updateStatus(taskId, newStatus) {
    if (!STATUS_REGISTRY[newStatus]) {
      logger.error('无效的状态', newStatus)
      return null
    }
    return this.update(taskId, { status: newStatus })
  },

  /** 取消：走统一迁移规则（pending 类状态 -> cancelled） */
  cancel(taskId) {
    return this.transition(taskId, 'cancel', { subtitle: '任务已取消' })
  },

  /** 物理删除（保留以兼容既有调用；取消操作请使用 cancel 走状态迁移） */
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

  /** 支付：走统一迁移规则，目标状态与文案由类型注册表决定，结果与原有逻辑一致 */
  markAsPaid(taskId) {
    const current = this.getById(taskId)
    if (!current) return null
    const typeInfo = getTypeRule(current.type)
    return this.transition(taskId, 'pay', { subtitle: typeInfo.paidSubtitle })
  },

  /** 构造任务详情跳转（路由 + query），供视图统一调用 */
  getNavigationFor(task) {
    return getNavigation(task)
  },

  getPendingCount() {
    return this.getByGroup('pending').length
  },

  getCompletedCount() {
    return this.getByGroup('completed').length
  },

  clearAll() {
    saveTasks([])
    logger.info('所有任务已清除')
  }
}

export default taskStore
