# 云额度观察（cloud-credit-watch）

DSH 插件，挂着自动查阿里云余额，适合天天盯着学生 300 券还剩多少的人。

## 干啥的

- 每 30 秒自动查一次余额，不用手动
- 现金 + 代金券分开算，总额直接显示在聊天框下方
- 学生认证送的 300 元走 `QueryCashCoupons`，能单独看到还剩多少
- 设置页里也能看余额、改 AccessKey
- 明暗主题都能用

## 怎么装

**方式一：npm（推荐）**

DSH 里点「添加插件」，输入：

```
cloud-credit-watch
```

**方式二：GitHub**

```
https://github.com/xiaoli4188/cloud-credit-watch
```

**方式三：clone 下来装**

```bash
git clone https://github.com/xiaoli4188/cloud-credit-watch.git
```

然后在「添加插件」里填你 clone 下来的那个目录。

## 怎么配

装好之后在设置页找到「阿里云余额」，填两项：

- `accessKeyId` — 阿里云 AccessKey ID
- `accessKeySecret` — 阿里云 AccessKey Secret

去 [RAM 控制台](https://ram.console.aliyun.com/manage/ak) 创建，建议用子账号只给 `AliyunBSSReadOnlyAccess` 权限。

`pollingIntervalSeconds` 默认 30 秒，嫌慢可以调。

## 长啥样

配好之后输入框下面会多一行：

```
☁️ ¥285.00（现金¥0.00 + 券¥285.00）    15:30
```

没配的时候会提示，查不到会标红。设置页里还有个卡片，分开显示现金和代金券。

## 用的什么接口

| 接口 | 干啥的 |
|---|---|
| `QueryAccountBalance` | 查现金余额 |
| `QueryCashCoupons` | 查代金券，学生 300 就在这 |

两个接口并行查，加起来就是总额。

## 咋实现的

Host 端调阿里云 BSS API → 开个 `/api/aliyun-balance` 接口 → Client 端定时 fetch 显示在 `conversation.composer.dock`，同时在 `settings.section` 挂了配置页。

MIT