/**
 * taskStore 单元测试
 *
 * 测试范围：
 * - 状态分组（待处理/已完成/已取消共用同一套规则）
 * - 动作生成（预设 + 类型矩阵，保证与改造前一致）
 * - 状态迁移（支付、取消、确认收货走统一入口）
 * - 详情跳转 query 配置化生成
 * - 异常恢复（损坏存储、单条脏数据、未知状态兜底）
 * - 重新读取（刷新后动作/分组重新派生）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { taskStore } from '../utils/taskStore'

function seedTasks(tasks) {
  localStorage.setItem('billiard_user_tasks', JSON.stringify(tasks))
}

function makeTask(overrides = {}) {
  return {
    id: 'T-TEST',
    type: 'booking',
    title: '测试任务',
    subtitle: '测试描述',
    amount: 100,
    status: 'pending_payment',
    createdAt: '2026-02-15 14:00',
    extra: { tableId: 3 },
    ...overrides
  }
}

describe('taskStore', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  // ---------- 读取与状态分组 ----------

  describe('getAll / 状态分组', () => {
    it('待处理、已完成、已取消共用状态元表派生分组', () => {
      seedTasks([
        makeTask({ id: 'T1', status: 'pending_payment' }),
        makeTask({ id: 'T2', status: 'ongoing' }),
        makeTask({ id: 'T3', type: 'order', status: 'completed' }),
        makeTask({ id: 'T4', type: 'course', status: 'cancelled' })
      ])

      const pending = taskStore.getByStatus('pending')
      const completed = taskStore.getByStatus('completed')

      expect(pending.map(t => t.id).sort()).toEqual(['T1', 'T2'])
      expect(completed.map(t => t.id).sort()).toEqual(['T3', 'T4'])
    })

    it('已取消任务保留在数据中并展示「已取消」文案', () => {
      seedTasks([makeTask({ id: 'T1', status: 'cancelled' })])

      const task = taskStore.getById('T1')
      expect(task.status).toBe('cancelled')
      expect(task.statusText).toBe('已取消')
      expect(task.statusGroup).toBe('completed')
      expect(task.amount).toBe(100)
    })

    it('未知状态默认归入待处理且不崩溃', () => {
      seedTasks([makeTask({ id: 'T1', status: 'some_new_status' })])

      const pending = taskStore.getByStatus('pending')
      expect(pending).toHaveLength(1)
      expect(pending[0].statusType).toBe('info')
      expect(pending[0].actions).toEqual([])
    })

    it('计数与分组规则保持一致', () => {
      seedTasks([
        makeTask({ id: 'T1', status: 'pending_payment' }),
        makeTask({ id: 'T2', type: 'order', status: 'pending_shipment' }),
        makeTask({ id: 'T3', type: 'order', status: 'completed' }),
        makeTask({ id: 'T4', type: 'course', status: 'cancelled' })
      ])

      expect(taskStore.getPendingCount()).toBe(2)
      expect(taskStore.getCompletedCount()).toBe(2)
    })

    it('无存储时返回默认任务数据', () => {
      const tasks = taskStore.getAll()
      expect(tasks).toHaveLength(4)
      expect(tasks.map(t => t.type).sort()).toEqual(['booking', 'competition', 'course', 'order'])
    })
  })

  // ---------- 动作生成 ----------

  describe('动作生成', () => {
    it('待付款动作在所有类型上一致：继续付款（带类型路由）+ 取消', () => {
      seedTasks([
        makeTask({ id: 'B', type: 'booking', status: 'pending_payment' }),
        makeTask({ id: 'C', type: 'course', status: 'pending_payment' }),
        makeTask({ id: 'M', type: 'competition', status: 'pending_payment' }),
        makeTask({ id: 'O', type: 'order', status: 'pending_payment' })
      ])

      const routeByType = {
        B: '/tables',
        C: '/courses',
        M: '/competitions',
        O: '/shop'
      }

      taskStore.getAll().forEach(task => {
        expect(task.actions).toHaveLength(2)
        expect(task.actions[0]).toMatchObject({
          key: 'pay',
          label: '继续付款',
          type: 'primary',
          route: routeByType[task.id]
        })
        expect(task.actions[1]).toEqual({ key: 'cancel', label: '取消', type: 'danger' })
      })
    })

    it('预约待开始：查看详情无路由 + 再次预约默认样式带路由', () => {
      seedTasks([makeTask({ id: 'T1', status: 'upcoming' })])

      const actions = taskStore.getById('T1').actions
      expect(actions).toEqual([
        { key: 'view', label: '查看详情', type: 'primary' },
        { key: 'rebook', label: '再次预约', type: 'default', route: '/tables' }
      ])
    })

    it('预约已完成：查看结果 + 主样式再次预约（覆盖预设样式与路由）', () => {
      seedTasks([makeTask({ id: 'T1', status: 'completed' })])

      const actions = taskStore.getById('T1').actions
      expect(actions).toEqual([
        { key: 'view', label: '查看结果', type: 'default' },
        { key: 'rebook', label: '再次预约', type: 'primary', route: '/tables' }
      ])
    })

    it('课程进行中：继续学习跳课程页', () => {
      seedTasks([
        makeTask({ id: 'T1', type: 'course', status: 'ongoing', extra: { courseId: 1 } })
      ])

      expect(taskStore.getById('T1').actions).toEqual([
        { key: 'view', label: '继续学习', type: 'primary', route: '/courses' }
      ])
    })

    it('订单已发货：查看物流 + 确认收货', () => {
      seedTasks([
        makeTask({
          id: 'T1',
          type: 'order',
          status: 'shipped',
          extra: { orderNo: 'SP123' }
        })
      ])

      expect(taskStore.getById('T1').actions).toEqual([
        { key: 'view', label: '查看物流', type: 'primary', route: '/shop' },
        { key: 'confirm', label: '确认收货', type: 'primary' }
      ])
    })

    it('订单已完成：查看结果 + 评价 + 再次购买（预设路由继承）', () => {
      seedTasks([
        makeTask({
          id: 'T1',
          type: 'order',
          status: 'completed',
          extra: { orderNo: 'SP123' }
        })
      ])

      expect(taskStore.getById('T1').actions).toEqual([
        { key: 'view', label: '查看结果', type: 'default', route: '/shop' },
        { key: 'review', label: '评价', type: 'primary' },
        { key: 'rebuy', label: '再次购买', type: 'default', route: '/shop' }
      ])
    })

    it('已取消任务不提供任何动作', () => {
      seedTasks([makeTask({ id: 'T1', status: 'cancelled' })])
      expect(taskStore.getById('T1').actions).toEqual([])
    })
  })

  // ---------- 状态迁移 ----------

  describe('统一状态迁移', () => {
    it('支付预约：迁移到待开始并更新副标题，金额不变', () => {
      seedTasks([makeTask({ id: 'T1', status: 'pending_payment' })])

      const result = taskStore.markAsPaid('T1')
      expect(result.status).toBe('upcoming')
      expect(result.subtitle).toBe('支付成功，等待使用')
      expect(result.amount).toBe(100)
    })

    it('支付订单：迁移到待发货', () => {
      seedTasks([
        makeTask({
          id: 'T1',
          type: 'order',
          status: 'pending_payment',
          amount: 2999,
          extra: { orderNo: 'SP1' }
        })
      ])

      const result = taskStore.markAsPaid('T1')
      expect(result.status).toBe('pending_shipment')
      expect(result.subtitle).toBe('支付成功，待发货')
      expect(result.amount).toBe(2999)
    })

    it('取消任务走状态迁移：保留数据并进入已完成页签', () => {
      seedTasks([makeTask({ id: 'T1', status: 'pending_payment' })])

      const result = taskStore.cancel('T1')
      expect(result.status).toBe('cancelled')
      expect(result.amount).toBe(100)

      const reread = taskStore.getById('T1')
      expect(reread.status).toBe('cancelled')
      expect(taskStore.getByStatus('completed').map(t => t.id)).toContain('T1')
      expect(taskStore.getByStatus('pending').map(t => t.id)).not.toContain('T1')
    })

    it('确认收货通过统一入口迁移到已完成', () => {
      seedTasks([
        makeTask({ id: 'T1', type: 'order', status: 'shipped', extra: { orderNo: 'SP1' } })
      ])

      const result = taskStore.updateStatus('T1', 'completed')
      expect(result.status).toBe('completed')
      expect(taskStore.getByStatus('completed').map(t => t.id)).toContain('T1')
    })

    it('迁移到未登记状态返回 null 且不改动数据', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      seedTasks([makeTask({ id: 'T1' })])

      const result = taskStore.transitionTo('T1', 'not_a_status')
      expect(result).toBeNull()
      expect(taskStore.getById('T1').status).toBe('pending_payment')
    })

    it('对不存在的任务迁移返回 null', () => {
      seedTasks([makeTask({ id: 'T1' })])
      expect(taskStore.transitionTo('MISSING', 'completed')).toBeNull()
      expect(taskStore.markAsPaid('MISSING')).toBeNull()
      expect(taskStore.cancel('MISSING')).toBeNull()
    })
  })

  // ---------- 详情跳转 ----------

  describe('详情跳转 query', () => {
    it('按任务类型配置统一拼装 query', () => {
      seedTasks([
        makeTask({ id: 'B', type: 'booking', extra: { tableId: 7, date: '2026-03-01' } }),
        makeTask({ id: 'C', type: 'course', extra: { courseId: 2, orderNo: 'X' } }),
        makeTask({ id: 'M', type: 'competition', extra: { competitionId: 5 } }),
        makeTask({ id: 'O', type: 'order', extra: { orderNo: 'SP888', items: [] } })
      ])

      const byId = Object.fromEntries(taskStore.getAll().map(t => [t.id, t]))
      expect(taskStore.getDetailQuery(byId.B)).toEqual({ tableId: 7 })
      expect(taskStore.getDetailQuery(byId.C)).toEqual({ courseId: 2 })
      expect(taskStore.getDetailQuery(byId.M)).toEqual({ competitionId: 5 })
      expect(taskStore.getDetailQuery(byId.O)).toEqual({ orderNo: 'SP888' })
    })

    it('extra 缺失或字段为空时安全返回空对象', () => {
      expect(taskStore.getDetailQuery(makeTask({ extra: undefined }))).toEqual({})
      expect(taskStore.getDetailQuery(makeTask({ extra: {} }))).toEqual({})
    })
  })

  // ---------- 异常恢复 ----------

  describe('异常恢复', () => {
    it('存储内容无法解析时回落到默认数据', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      localStorage.setItem('billiard_user_tasks', '{损坏的JSON')

      const tasks = taskStore.getAll()
      expect(tasks).toHaveLength(4)
    })

    it('存储结构不是数组时回落到默认数据', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      localStorage.setItem('billiard_user_tasks', JSON.stringify({ nope: true }))

      expect(taskStore.getAll()).toHaveLength(4)
    })

    it('单条脏数据被过滤，其余任务正常读取', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      seedTasks([
        makeTask({ id: 'GOOD' }),
        { id: 'NO_TYPE' },
        null,
        { type: 'booking' }
      ])

      const tasks = taskStore.getAll()
      expect(tasks).toHaveLength(1)
      expect(tasks[0].id).toBe('GOOD')
    })

    it('localStorage 读取抛错时回落到默认数据', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage unavailable')
      })

      expect(taskStore.getAll()).toHaveLength(4)
    })
  })

  // ---------- 重新读取 ----------

  describe('重新读取', () => {
    it('状态变更后重新读取会重新派生动作与分组', () => {
      seedTasks([makeTask({ id: 'T1', status: 'pending_payment' })])

      // 迁移前：待处理，带支付/取消动作
      let task = taskStore.getById('T1')
      expect(task.statusGroup).toBe('pending')
      expect(task.actions.map(a => a.key)).toEqual(['pay', 'cancel'])

      taskStore.cancel('T1')

      // 模拟页面刷新：重新读取同一存储
      task = taskStore.getById('T1')
      expect(task.statusGroup).toBe('completed')
      expect(task.statusText).toBe('已取消')
      expect(task.actions).toEqual([])
    })
  })
})
