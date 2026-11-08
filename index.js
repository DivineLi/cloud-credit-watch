import crypto from 'node:crypto'

function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21').replace(/'/g, '%27')
    .replace(/\(/g, '%28').replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
}

async function callAliyunApi({ accessKeyId, accessKeySecret, endpoint, apiVersion, action, params = {}, timeoutMs = 8000 }) {
  const publicParams = {
    AccessKeyId: accessKeyId,
    Action: action,
    Format: 'JSON',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: apiVersion,
  }

  const allParams = { ...publicParams, ...params }
  const sortedKeys = Object.keys(allParams).sort()
  const canonicalQuery = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join('&')

  const stringToSign = `GET&${percentEncode('/')}&${percentEncode(canonicalQuery)}`
  const signature = crypto.createHmac('sha1', `${accessKeySecret}&`).update(stringToSign).digest('base64')

  const url = `https://${endpoint}/?Signature=${percentEncode(signature)}&${canonicalQuery}`

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)

  try {
    const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`阿里云 API 返回错误 (HTTP ${res.status})${text ? ': ' + text.slice(0, 200) : ''}`)
    }
    return await res.json()
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('请求超时了，检查下网络')
    throw err
  } finally {
    clearTimeout(t)
  }
}

// 查现金余额
async function queryBalance(accessKeyId, accessKeySecret) {
  if (!accessKeyId || !accessKeySecret) throw new Error('还没配 AccessKey，去插件设置填一下')

  const body = await callAliyunApi({
    accessKeyId, accessKeySecret,
    endpoint: 'business.aliyuncs.com',
    apiVersion: '2017-12-14',
    action: 'QueryAccountBalance',
  })

  const d = body?.Data ?? {}
  return {
    availableAmount: Number(d.AvailableAmount ?? 0),
    currency: d.Currency ?? 'CNY',
    creditLimit: Number(d.CreditLimit ?? 0),
    mybankCredit: Number(d.MybankCreditAmount ?? 0),
  }
}

// 查代金券（学生300元用的就是这个）
async function queryCoupons(accessKeyId, accessKeySecret) {
  if (!accessKeyId || !accessKeySecret) throw new Error('还没配 AccessKey，去插件设置填一下')

  const body = await callAliyunApi({
    accessKeyId, accessKeySecret,
    endpoint: 'business.aliyuncs.com',
    apiVersion: '2017-12-14',
    action: 'QueryCashCoupons',
    params: { EffectiveOrNot: 'true' },
  })

  const list = body?.Data?.CashCoupon ?? []
  let total = 0
  let count = 0
  for (const c of list) {
    if (c.Status === 'Available' && c.Balance) {
      total += Number(c.Balance)
      count++
    }
  }
  return { couponTotal: total, couponCount: count, allCoupons: list }
}

// ── 状态 & 后台刷新 ──

let bal = {
  cashBalance: null, couponTotal: null, couponCount: 0,
  totalBalance: null, currency: 'CNY',
  availableAmount: null,
  lastUpdated: null, error: null, configured: false,
}

let refreshing = false
let currentAk = ''
let currentSk = ''
let stopTimer = () => {}

async function refreshBalance() {
  if (refreshing) return
  refreshing = true
  try {
    if (!currentAk || !currentSk) {
      bal = {
        cashBalance: null, couponTotal: null, couponCount: 0,
        totalBalance: null, currency: 'CNY',
        availableAmount: null,
        lastUpdated: null, error: '未配置 AccessKey', configured: false,
      }
      return
    }

    const [cash, coupon] = await Promise.all([
      queryBalance(currentAk, currentSk),
      queryCoupons(currentAk, currentSk),
    ])

    const cashBal = cash.availableAmount
    const couponBal = coupon.couponTotal
    const total = cashBal + couponBal

    bal = {
      cashBalance: cashBal,
      couponTotal: couponBal,
      couponCount: coupon.couponCount,
      totalBalance: total,
      currency: cash.currency,
      availableAmount: String(total), // 兼容旧字段：总额
      lastUpdated: Date.now(),
      error: null,
      configured: true,
    }
  } catch (err) {
    bal = { ...bal, lastUpdated: Date.now(), error: err.message }
  } finally {
    refreshing = false
  }
}

// ── 插件 ──

export const inject = ['tools', 'timer', 'webServer']

export function apply(ctx, config) {
  currentAk = config.accessKeyId ?? ''
  currentSk = config.accessKeySecret ?? ''
  const interval = Math.max(10, Number(config.pollingIntervalSeconds) || 30) * 1000

  refreshBalance()
  stopTimer = ctx.timer.interval(refreshBalance, interval)

  let unreg = () => {}
  const routeHandler = async (req) => {
    const sp = new URL(req.url, 'http://localhost').searchParams
    const a = sp.get('ak')
    const s = sp.get('sk')

    if (a) currentAk = a
    if (s) currentSk = s
    if (a || s) refreshBalance()

    return new Response(JSON.stringify({ ...bal, configured: !!(currentAk && currentSk) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  try {
    unreg = ctx.webServer.register({
      kind: 'exact',
      path: '/api/aliyun-balance',
      resource: routeHandler,
    })
  } catch (err) {
    if (err.message.includes('duplicate')) {
      // 旧路由还没释放，没关系，bal/currentAk 都是模块级的，新旧路由读同一份数据
      console.warn('[aliyun-balance] 路由已存在，复用旧路由（代码已更新不影响）')
    } else {
      throw err
    }
  }

  ctx.tools.register({
    name: 'aliyun_balance',
    description: '查一下阿里云账户还有多少钱，学生认证那 300 代金券也能看到。没配 AccessKey 的话先去插件设置填。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: {
        type: 'object',
        properties: {
          cashBalance: { type: 'number', description: '现金余额' },
          couponTotal: { type: 'number', description: '代金券总额（含学生300元）' },
          totalBalance: { type: 'number', description: '总额（现金+代金券）' },
          couponCount: { type: 'number', description: '有效代金券张数' },
          currency: { type: 'string', description: '货币单位' },
          availableAmount: { type: 'string', description: '可用余额（兼容字段，等于总额）' },
        },
      },
      render(r) {
        const fmt = (v) => (v != null ? `¥${Number(v).toFixed(2)}` : '—')
        const lines = ['💰 **阿里云账户余额**', '']
        if (r.totalBalance != null) {
          lines.push(`- **总额**：${fmt(r.totalBalance)} ${r.currency ?? 'CNY'}`)
          lines.push(`  - 现金余额：${fmt(r.cashBalance)}`)
          if (r.couponTotal > 0) {
            lines.push(`  - 代金券（${r.couponCount ?? 0}张）：${fmt(r.couponTotal)}`)
          }
        } else {
          lines.push(`- **可用余额**：${r.availableAmount ?? '—'} ${r.currency ?? 'CNY'}`)
        }
        return { content: [{ type: 'text', text: lines.join('\n') }] }
      },
    },
    async execute() {
      if (!currentAk || !currentSk) throw new Error('还没配 AccessKey，去插件设置填一下')
      const [cash, coupon] = await Promise.all([
        queryBalance(currentAk, currentSk),
        queryCoupons(currentAk, currentSk),
      ])
      return {
        cashBalance: cash.availableAmount,
        couponTotal: coupon.couponTotal,
        couponCount: coupon.couponCount,
        totalBalance: cash.availableAmount + coupon.couponTotal,
        currency: cash.currency,
        availableAmount: String(cash.availableAmount + coupon.couponTotal),
      }
    },
  })

  ctx.on('dispose', () => { unreg(); stopTimer() })
}