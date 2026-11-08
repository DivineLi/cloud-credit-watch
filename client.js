window.__ModuleLoader__.load({
  id: '@local/aliyun-balance',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback } = React

    function fmtAmt(v) {
      if (v == null || v === '') return '—'
      const n = Number(v)
      return Number.isNaN(n) ? v : `¥${n.toFixed(2)}`
    }

    function fmtTime(ts) {
      if (!ts) return '—'
      return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }

    const T = {
      bg: 'var(--dsw-alias-bg-layer-1)',
      bd: 'var(--dsw-alias-border-l1)',
      c1: 'var(--dsw-alias-label-primary)',
      c2: 'var(--dsw-alias-label-secondary)',
      ac: 'var(--dsw-alias-state-idle-primary)',
      er: 'var(--dsw-alias-state-error-primary)',
    }

    function row() {
      return { display: 'flex', flexDirection: 'column', gap: '4px' }
    }
    function inp() {
      return {
        padding: '8px 12px', borderRadius: '6px', border: `1px solid ${T.bd}`,
        background: 'transparent', color: T.c1, fontSize: '13px', outline: 'none',
        fontFamily: 'monospace',
      }
    }
    function btn() {
      return {
        padding: '8px 20px', borderRadius: '6px', border: 'none',
        background: 'var(--dsw-alias-state-business-primary)',
        color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
      }
    }

    // ── composer dock ──

    function barStyle() {
      return { padding: '5px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', color: T.c2, backgroundColor: T.bg, borderTop: `1px solid ${T.bd}`, userSelect: 'none' }
    }

    function BalanceDisplay() {
      const [d, setD] = useState(null)
      const [e, setE] = useState(null)

      const fetchBal = useCallback(async () => {
        try {
          const r = await fetch('/api/aliyun-balance')
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const j = await r.json()
          setD(j); setE(null)
        } catch (err) { setE(err.message) }
      }, [])

      useEffect(() => {
        let ok = true
        const fn = async () => {
          await fetchBal()
        }
        fn()
        const iv = setInterval(fn, 30000)

        // 监听设置页保存事件，立即刷新
        const onFlush = () => { if (ok) fn() }
        window.addEventListener('aliyun-balance-flush', onFlush)

        return () => { ok = false; clearInterval(iv); window.removeEventListener('aliyun-balance-flush', onFlush) }
      }, [fetchBal])

      if (!d && !e) return null

      if (d && !d.configured) {
        return h('div', { style: { ...barStyle(), fontSize: '12px' } },
          '☁️ 还没配 AccessKey，设置里填一下')
      }

      if (d && d.error && d.totalBalance == null) {
        return h('div', { style: { ...barStyle(), fontSize: '12px', color: T.er } },
          `☁️ 余额查不到：${d.error.slice(0, 60)}`)
      }

      if (e && !d) return null
      if (!d || d.totalBalance == null) return null

      const amt = fmtAmt(d.totalBalance)
      const ts = fmtTime(d.lastUpdated)

      return h('div', { style: barStyle() },
        h('span', null, '☁️'),
        h('span', { style: { fontWeight: 600, color: T.c1 } }, `${amt}`),
        d.couponTotal > 0 && h('span', { style: { fontSize: '11px', opacity: 0.7 } },
          `（现金${fmtAmt(d.cashBalance)} + 券${fmtAmt(d.couponTotal)}）`),
        h('span', { style: { fontSize: '11px', color: T.ac, marginLeft: 'auto' } }, ts))
    }

    // ── settings page ──

    function SettingsPage() {
      const [d, setD] = useState(null)
      const [e, setE] = useState(null)
      const [loading, setLoading] = useState(false)
      const [ak, setAk] = useState('')
      const [sk, setSk] = useState('')
      const [saving, setSaving] = useState(false)
      const [msg, setMsg] = useState(null)

      const fetchBal = useCallback(async () => {
        setE(null)
        try {
          const r = await fetch('/api/aliyun-balance')
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const j = await r.json()
          setD(j)
        } catch (err) {
          setE(err.message)
        }
      }, [])

      useEffect(() => { fetchBal() }, [fetchBal])

      const doSave = async () => {
        setSaving(true)
        setMsg(null)
        try {
          const p = new URLSearchParams()
          if (ak) p.set('ak', ak)
          if (sk) p.set('sk', sk)
          const r = await fetch('/api/aliyun-balance?' + p.toString())
          const j = await r.json()
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          setMsg({ kind: 'ok', text: '保存成功' })
          // 等 800ms 让服务端刷新完，再拉最新数据
          setTimeout(async () => {
            await fetchBal()
            // 通知 dock 面板也刷新
            window.dispatchEvent(new CustomEvent('aliyun-balance-flush'))
          }, 800)
        } catch (err) {
          setMsg({ kind: 'err', text: err.message })
        } finally {
          setSaving(false)
        }
      }

      const amt = d && d.totalBalance != null ? fmtAmt(d.totalBalance) : null
      const cash = d && d.cashBalance != null ? fmtAmt(d.cashBalance) : null
      const coupon = d && d.couponTotal != null ? fmtAmt(d.couponTotal) : null
      const cur = d?.currency || 'CNY'
      const ts = fmtTime(d?.lastUpdated)
      const ok = d?.configured

      return h('div', { style: { padding: '24px', maxWidth: '640px', color: T.c1 } },
        h('h2', { style: { fontSize: '18px', margin: '0 0 20px 0' } }, '阿里云余额'),

        h('div', {
          style: { background: T.bg, borderRadius: '12px', padding: '20px', border: `1px solid ${T.bd}`, marginBottom: '24px' }
        },
          h('div', { style: { fontSize: '13px', color: T.c2, marginBottom: '8px' } }, '当前余额'),

          ok && amt
            ? h('div', null,
                h('div', { style: { fontSize: '32px', fontWeight: 700 } }, amt),
                h('div', { style: { fontSize: '13px', color: T.c1, marginTop: '10px' } },
                  `现金 ${cash}  +  代金券 ${coupon}（${d.couponCount ?? 0}张）`),
                h('div', { style: { fontSize: '12px', color: T.c2, marginTop: '6px' } },
                  `${cur} · ${ts}`),
              )
            : h('div', { style: { fontSize: '14px', color: T.c2 } }, '还没配 AccessKey'),

          e && h('div', { style: { color: T.er, fontSize: '12px', marginTop: '8px' } }, `拉取失败: ${e}`),
        ),

        h('div', {
          style: { background: T.bg, borderRadius: '12px', padding: '20px', border: `1px solid ${T.bd}` }
        },
          h('h3', { style: { fontSize: '14px', margin: '0 0 16px 0' } }, 'AccessKey 配置'),
          h('div', { style: row() },
            h('label', { style: { fontSize: '13px', color: T.c2 } }, 'AccessKey ID'),
            h('input', {
              type: 'text', placeholder: 'LTAI5t...', value: ak,
              style: inp(),
              onChange: function(e) { setAk(e.target.value) },
            }),
          ),
          h('div', { style: { ...row(), marginTop: '12px' } },
            h('label', { style: { fontSize: '13px', color: T.c2 } }, 'AccessKey Secret'),
            h('input', {
              type: 'password', placeholder: '···', value: sk,
              style: inp(),
              onChange: function(e) { setSk(e.target.value) },
            }),
          ),

          h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' } },
            h('button', { onClick: doSave, disabled: saving, style: btn() },
              saving ? '保存中…' : '保存'),
            msg && h('span', {
              style: { fontSize: '12px', color: msg.kind === 'ok' ? T.ac : T.er }
            }, msg.text),
          ),
        ),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register({ name: 'conversation.composer.dock', id: 'aliyun-balance-display', order: 100 }, BalanceDisplay))

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register({ name: 'settings.section', id: 'aliyun-balance', order: 35, label: '阿里云余额' }, SettingsPage))
      },
    }
  },
})