/**
 * API 接口层
 * 
 * 功能说明：
 * - 封装所有后端API请求
 * - 支持模拟数据模式和真实API模式
 * - 提供统一的错误处理和日志记录
 * 
 * 使用方式：
 * import { api, logger } from '@/utils/api'
 * const result = await api.login('user', '123456')
 * 
 * 切换模式：
 * - 设置 VITE_USE_MOCK=true 使用模拟数据
 * - 设置 VITE_USE_MOCK=false 调用真实API
 */

// API基础地址，从环境变量读取
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

// 日志级别配置
const LOG_LEVEL = import.meta.env.VITE_LOG_LEVEL || 'info'
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }

// 任务存储（用于任务中心数据持久化）
import { taskStore as ts } from './taskStore'
const taskStore = ts

/**
 * 模拟网络延迟
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise} 延迟Promise
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * 日志记录器
 * 根据配置的日志级别输出不同级别的日志
 * 
 * 使用示例：
 * logger.info('用户登录', { userId: '123' })
 * logger.error('请求失败', error)
 */
export const logger = {
  /**
   * 检查是否应该输出该级别的日志
   * @param {string} level - 日志级别
   * @returns {boolean} 是否输出
   */
  shouldLog(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL]
  },

  /**
   * 格式化日志消息
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @returns {string} 格式化后的消息
   */
  format(level, message) {
    return `[${level.toUpperCase()}] ${new Date().toISOString()} - ${message}`
  },

  /**
   * 调试日志 - 详细的调试信息
   */
  debug(message, data) {
    if (this.shouldLog('debug')) {
      console.debug(this.format('debug', message), data || '')
    }
  },

  /**
   * 信息日志 - 常规操作记录
   */
  info(message, data) {
    if (this.shouldLog('info')) {
      console.log(this.format('info', message), data || '')
    }
  },

  /**
   * 警告日志 - 潜在问题提示
   */
  warn(message, data) {
    if (this.shouldLog('warn')) {
      console.warn(this.format('warn', message), data || '')
    }
  },

  /**
   * 错误日志 - 错误和异常
   */
  error(message, error) {
    if (this.shouldLog('error')) {
      console.error(this.format('error', message), error || '')
    }
  }
}

/**
 * 统一请求封装
 * 
 * @param {string} url - 请求路径（不含基础URL）
 * @param {Object} options - 请求配置
 * @param {string} options.method - 请求方法 GET/POST/PUT/DELETE
 * @param {Object} options.body - 请求体（会自动JSON序列化）
 * @param {Object} options.headers - 额外的请求头
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 * 
 * 使用示例：
 * const result = await request('/auth/login', {
 *   method: 'POST',
 *   body: JSON.stringify({ username, password })
 * })
 */
async function request(url, options = {}) {
  const fullUrl = `${API_BASE_URL}${url}`
  logger.info(`API Request: ${options.method || 'GET'} ${fullUrl}`)
  
  try {
    // 模拟模式：使用前端模拟数据
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      logger.debug('Using mock data mode')
      return await mockRequest(url, options)
    }
    
    // 真实API调用
    const response = await fetch(fullUrl, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('billiard_token') || ''}`,
        ...options.headers
      },
      ...options
    })
    
    // 检查HTTP状态码
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
    }
    
    const data = await response.json()
    logger.info(`API Response: ${url}`, { status: 'success' })
    return { success: true, data }
    
  } catch (error) {
    // 统一错误处理
    logger.error(`API Error: ${url}`, error)
    return { 
      success: false, 
      error: error.message || '网络请求失败，请稍后重试'
    }
  }
}

/**
 * 模拟请求处理器
 * 根据URL路由到对应的模拟数据处理函数
 * 
 * @param {string} url - 请求路径
 * @param {Object} options - 请求配置
 * @returns {Promise<{success: boolean, data: any}>}
 */
async function mockRequest(url, options) {
  // 模拟网络延迟 500-1000ms
  await delay(500 + Math.random() * 500)
  
  // URL到处理函数的映射
  const mockHandlers = {
    '/auth/login': handleLogin,
    '/auth/logout': handleLogout,
    '/tables': () => mockData.tables,
    '/courses': () => mockData.courses,
    '/competitions': () => mockData.competitions,
    '/products': () => mockData.products,
    '/user/profile': () => mockData.user,
    '/bookings': handleBookings,
    '/orders': handleOrders,
    '/user/tasks': handleUserTasks
  }
  
  const handler = mockHandlers[url]
  if (handler) {
    try {
      const result = await handler(options)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
  
  return { success: false, error: `API not found: ${url}` }
}

// ==================== 模拟数据处理函数 ====================

/**
 * 处理登录请求
 * 验证用户名密码，返回token和用户信息
 */
function handleLogin(options) {
  const body = JSON.parse(options.body || '{}')
  const { username, password } = body
  
  // 测试账号验证：user / 123456
  if (username === 'user' && password === '123456') {
    const token = 'mock_token_' + Date.now()
    logger.info('Mock login successful', { username })
    return {
      token,
      user: mockData.user
    }
  }
  
  logger.warn('Mock login failed', { username })
  throw new Error('用户名或密码错误')
}

/**
 * 处理退出登录请求
 */
function handleLogout() {
  logger.info('Mock logout')
  return { message: '退出成功' }
}

/**
 * 处理预约相关请求
 * GET: 返回预约列表
 * POST: 创建新预约
 */
function handleBookings(options) {
  if (options.method === 'POST') {
    const body = JSON.parse(options.body || '{}')
    const orderNo = 'BK' + Date.now().toString().slice(-8)
    logger.info('Mock booking created', { orderNo })
    return {
      orderNo,
      ...body,
      status: 'upcoming'
    }
  }
  return mockData.bookings
}

/**
 * 处理订单相关请求
 * POST: 创建新订单
 */
function handleOrders(options) {
  if (options.method === 'POST') {
    const body = JSON.parse(options.body || '{}')
    const orderNo = 'SP' + Date.now().toString().slice(-8)
    logger.info('Mock order created', { orderNo })
    return {
      orderNo,
      ...body,
      status: 'paid'
    }
  }
  return []
}

/**
 * 处理任务中心相关请求
 * GET: 返回用户所有任务（整合预约、报名、订单）
 * POST: 执行任务操作（支付、取消等）
 */
function handleUserTasks(options) {
  // 等待 taskStore 加载完成
  if (!taskStore) {
    return []
  }
  
  if (options.method === 'POST') {
    const body = JSON.parse(options.body || '{}')
    const { taskId, action } = body
    logger.info('Task action via API', { taskId, action })
    
    if (action === 'pay') {
      const result = taskStore.markAsPaid(taskId)
      return { success: !!result, message: result ? '支付成功' : '支付失败' }
    } else if (action === 'cancel') {
      const result = taskStore.cancel(taskId)
      return { success: !!result, message: result ? '取消成功' : '取消失败' }
    }
    
    return { success: true, message: '操作成功' }
  }
  
  // GET 请求，从 taskStore 获取真实数据
  const params = options.params || {}
  if (params.status) {
    return taskStore.getByStatus(params.status)
  }
  return taskStore.getAll()
}

// ==================== 模拟数据定义 ====================

/**
 * 模拟数据集合
 * 包含所有业务模块的测试数据
 */
const mockData = {
  // 用户信息
  user: {
    id: 'U20260001',
    name: '张三',
    level: '黄金',
    points: 2580,
    totalHours: 156,
    competitions: 12,
    wins: 8,
    courses: 3,
    phone: '138****8888',
    email: 'zhang***@email.com'
  },
  
  // 球桌列表
  tables: [
    { id: 1, name: '1号球桌', type: '斯诺克', typeId: 'snooker', price: 80, available: true, size: '12尺', brand: '星牌' },
    { id: 2, name: '2号球桌', type: '斯诺克', typeId: 'snooker', price: 80, available: false, size: '12尺', brand: '星牌' },
    { id: 3, name: '3号球桌', type: '美式九球', typeId: 'pool', price: 60, available: true, size: '9尺', brand: 'Brunswick' },
    { id: 4, name: '4号球桌', type: '美式九球', typeId: 'pool', price: 60, available: true, size: '9尺', brand: 'Brunswick' },
    { id: 5, name: '5号球桌', type: '中式八球', typeId: 'chinese', price: 50, available: false, size: '9尺', brand: '乔氏' },
    { id: 6, name: '6号球桌', type: '中式八球', typeId: 'chinese', price: 50, available: true, size: '9尺', brand: '乔氏' }
  ],
  
  // 课程列表
  courses: [
    { id: 1, name: '台球入门基础课', icon: '🎯', level: '入门', duration: '4周', lessons: '8课时', students: 156, price: 599, originalPrice: 799, description: '从零开始学习台球', coach: '张明', coachTitle: '高级教练', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    { id: 2, name: '斯诺克进阶训练', icon: '🎱', level: '进阶', duration: '6周', lessons: '12课时', students: 89, price: 1299, originalPrice: 1599, description: '深入学习斯诺克战术', coach: '李强', coachTitle: '国家级教练', gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }
  ],
  
  // 赛事列表
  competitions: [
    { id: 1, name: '2026春季斯诺克公开赛', type: '斯诺克', date: '2026-03-15', location: '主馆A区', prize: 50000, fee: 200, participants: 28, maxParticipants: 32, status: 'upcoming' },
    { id: 2, name: '周末九球挑战赛', type: '美式九球', date: '2026-02-14', location: '主馆B区', prize: 10000, fee: 100, participants: 16, maxParticipants: 16, status: 'ongoing' }
  ],
  
  // 商品列表
  products: [
    { id: 1, name: 'LP专业斯诺克球杆', brand: 'LP', price: 2999, originalPrice: 3599, category: 'cue', icon: '🏏', description: '进口白蜡木杆身', sales: 328, hot: true },
    { id: 2, name: '星牌比赛用球', brand: '星牌', price: 1299, originalPrice: 1499, category: 'ball', icon: '🎱', description: '国际比赛标准', sales: 892, hot: true }
  ],
  
  // 预约记录
  bookings: [
    { id: 1, orderNo: 'BK20260001', tableName: '3号球桌 - 美式九球', date: '2026-02-15', time: '14:00 - 16:00', status: 'upcoming' },
    { id: 2, orderNo: 'BK20260002', tableName: '1号球桌 - 斯诺克', date: '2026-02-10', time: '19:00 - 21:00', status: 'completed' }
  ]
}

// ==================== 导出API方法 ====================

/**
 * API接口集合
 * 按业务模块组织，提供统一的调用入口
 */
export const api = {
  // ========== 认证模块 ==========
  
  /**
   * 用户登录
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @returns {Promise<{success: boolean, data?: {token: string, user: Object}}>}
   */
  login: (username, password) => request('/auth/login', { 
    method: 'POST', 
    body: JSON.stringify({ username, password }) 
  }),
  
  /**
   * 用户退出登录
   */
  logout: () => request('/auth/logout', { method: 'POST' }),
  
  // ========== 球桌模块 ==========
  
  /**
   * 获取球桌列表
   * @param {Object} params - 查询参数
   * @param {string} params.type - 球桌类型
   * @param {string} params.date - 查询日期
   */
  getTables: (params) => request('/tables', { params }),
  
  /**
   * 创建球桌预约
   * @param {Object} data - 预约信息
   * @param {number} data.tableId - 球桌ID
   * @param {string} data.date - 预约日期
   * @param {string} data.timeSlot - 时段
   * @param {number} data.duration - 时长（小时）
   */
  bookTable: (data) => request('/bookings', { 
    method: 'POST', 
    body: JSON.stringify(data) 
  }),
  
  // ========== 课程模块 ==========
  
  /**
   * 获取课程列表
   */
  getCourses: () => request('/courses'),
  
  /**
   * 报名课程
   * @param {Object} data - 报名信息
   * @param {number} data.courseId - 课程ID
   */
  enrollCourse: (data) => request('/courses/enroll', { 
    method: 'POST', 
    body: JSON.stringify(data) 
  }),
  
  // ========== 赛事模块 ==========
  
  /**
   * 获取赛事列表
   * @param {Object} params - 查询参数
   * @param {string} params.status - 赛事状态
   */
  getCompetitions: (params) => request('/competitions', { params }),
  
  /**
   * 报名参赛
   * @param {Object} data - 报名信息
   * @param {number} data.competitionId - 赛事ID
   */
  joinCompetition: (data) => request('/competitions/join', { 
    method: 'POST', 
    body: JSON.stringify(data) 
  }),
  
  // ========== 商品模块 ==========
  
  /**
   * 获取商品列表
   * @param {Object} params - 查询参数
   * @param {string} params.category - 商品分类
   * @param {string} params.sort - 排序方式
   */
  getProducts: (params) => request('/products', { params }),
  
  /**
   * 创建商品订单
   * @param {Object} data - 订单信息
   * @param {Array} data.items - 商品列表
   */
  createOrder: (data) => request('/orders', { 
    method: 'POST', 
    body: JSON.stringify(data) 
  }),
  
  // ========== 用户模块 ==========
  
  /**
   * 获取用户信息
   */
  getProfile: () => request('/user/profile'),
  
  /**
   * 更新用户信息
   * @param {Object} data - 用户信息
   */
  updateProfile: (data) => request('/user/profile', { 
    method: 'PUT', 
    body: JSON.stringify(data) 
  }),
  
  /**
   * 获取用户预约记录
   */
  getBookings: () => request('/bookings'),

  // ========== 任务中心模块 ==========

  /**
   * 获取用户任务列表
   * @param {Object} params - 查询参数
   * @param {string} params.status - 任务状态 pending(待处理)/completed(已完成)
   * @param {string} params.type - 任务类型 booking/course/competition/order
   */
  getTasks: (params) => request('/user/tasks', { params }),

  /**
   * 执行任务操作
   * @param {Object} data - 操作数据
   * @param {string} data.taskId - 任务ID
   * @param {string} data.action - 操作类型 pay/cancel/view/remind/rebook/review
   */
  doTaskAction: (data) => request('/user/tasks', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export default api
