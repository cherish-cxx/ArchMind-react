import { URL } from 'node:url'
import {
  state, findByAccess, findByRefresh, revoke,
  issueTokens, loginResponse, buildOverview, projectResponse
} from './data.js'

// ========== 通用 Result 包装（对齐后端）==========
const ok = (data) => ({ code: 0, message: 'success', data, timestamp: Date.now() })
const fail = (code, message) => ({ code, message, data: null, timestamp: Date.now() })

// ========== 请求体收集 ==========
function readBody(req, limit = 500 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve(Buffer.concat(chunks))
    }
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        done = true
        req.destroy()
        reject(new Error('请求体过大'))
        return
      }
      chunks.push(c)
    })
    req.on('end', finish)
    req.on('error', reject)
  })
}

// multipart 轻量解析：只取第一个 file 字段的 filename，内容忽略（mock 不需要真解析）
function extractMultipartMeta(buf) {
  const raw = buf.toString('latin1')
  const m = raw.match(/filename="([^"]*)"/)
  return {
    fileName: m && m[1] ? m[1] : 'project.zip',
    fileSize: buf.byteLength
  }
}

// mock 创建+上传：从 multipart 中取文本字段（name/description/gitUrl）
function extractMultipartFields(buf) {
  const raw = buf.toString('utf8')
  const fields = {}
  const re = /name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n--/g
  let m
  while ((m = re.exec(raw))) fields[m[1]] = m[2]
  return fields
}

// 异步任务 mock：与真实后端一样，/analyze 只投递，进度靠轮询读取
function taskStore() {
  if (!state.tasks) state.tasks = new Map()
  return state.tasks
}

function nextTaskId() {
  state.nextTaskId = (state.nextTaskId || 0) + 1
  return state.nextTaskId
}

// 代码探索 mock 数据（真实后端来自 Neo4j）
const MOCK_CLASSES = [
  ['com.example.demo.controller.OrderController', 'OrderController', 'CLASS', '订单入口'],
  ['com.example.demo.service.OrderService', 'OrderService', 'INTERFACE', '订单服务接口'],
  ['com.example.demo.service.impl.OrderServiceImpl', 'OrderServiceImpl', 'CLASS', '订单服务实现'],
  ['com.example.demo.repository.OrderRepository', 'OrderRepository', 'INTERFACE', '订单仓储'],
  ['com.example.demo.model.OrderDTO', 'OrderDTO', 'CLASS', '订单传输对象'],
  ['com.example.demo.repository.OrderMapper', 'OrderMapper', 'CLASS', '订单持久化'],
  ['com.example.demo.remote.CouponService', 'CouponService', 'CLASS', '优惠券外部服务'],
  ['com.example.demo.repository.CouponMapper', 'CouponMapper', 'CLASS', '优惠券持久化'],
  ['com.example.demo.controller.ItemController', 'ItemController', 'CLASS', '商品入口'],
  ['com.example.demo.service.ItemService', 'ItemService', 'CLASS', '商品服务'],
  ['com.example.demo.model.ItemDTO', 'ItemDTO', 'CLASS', '商品传输对象'],
  ['com.example.demo.repository.ItemMapper', 'ItemMapper', 'CLASS', '商品持久化'],
  ['com.example.demo.controller.CartController', 'CartController', 'CLASS', '购物车入口'],
  ['com.example.demo.service.CartService', 'CartService', 'CLASS', '购物车服务'],
  ['com.example.demo.model.CartDTO', 'CartDTO', 'CLASS', '购物车传输对象'],
  ['com.example.demo.repository.CartMapper', 'CartMapper', 'CLASS', '购物车持久化'],
  ['com.example.demo.controller.PaymentController', 'PaymentController', 'CLASS', '支付入口'],
  ['com.example.demo.service.PaymentService', 'PaymentService', 'CLASS', '支付服务'],
  ['com.example.demo.model.PaymentDTO', 'PaymentDTO', 'CLASS', '支付传输对象'],
  ['com.example.demo.repository.PaymentMapper', 'PaymentMapper', 'CLASS', '支付持久化'],
  ['com.example.demo.controller.UserController', 'UserController', 'CLASS', '用户入口'],
  ['com.example.demo.service.UserService', 'UserService', 'CLASS', '用户服务'],
  ['com.example.demo.model.UserDTO', 'UserDTO', 'CLASS', '用户传输对象'],
  ['com.example.demo.repository.UserMapper', 'UserMapper', 'CLASS', '用户持久化'],
  ['com.example.demo.job.OrderTimeoutJob', 'OrderTimeoutJob', 'CLASS', '超时订单扫描任务'],
  ['com.example.demo.listener.PaymentMessageListener', 'PaymentMessageListener', 'CLASS', '支付消息监听']
].map(([qualifiedName, simpleName, kind, description]) => ({
  qualifiedName,
  simpleName,
  packageName: qualifiedName.split('.').slice(0, -1).join('.'),
  kind,
  description,
  filePath: `src/main/java/${qualifiedName.split('.').join('/')}.java`,
  startLine: 1,
  endLine: 12
}))

// ===== 领域地图 mock（真实后端来自 Neo4j 的 DOMAIN 阶段）=====
const PKG = 'com.example.demo'
const AREA_PREFIX = { order: 'Order', item: 'Item', cart: 'Cart', pay: 'Payment', user: 'User' }

const MOCK_AREAS = [
  {
    uid: 'order', name: '订单', kind: 'business', classCount: 33,
    description: '承接下单、查询与取消，是商品与支付之间的编排层。',
    capabilities: [
      { uid: 'POST /orders', name: 'POST /orders', memberCount: 6, entryUid: `${PKG}.controller.OrderController#createOrder()`, description: '创建订单：校验商品与库存、锁定优惠、生成待支付订单。' },
      { uid: 'GET /orders/{id}', name: 'GET /orders/{id}', memberCount: 4, entryUid: `${PKG}.controller.OrderController#getById()`, description: '查询订单详情，聚合商品、地址与支付状态。' },
      { uid: 'POST /orders/{id}/cancel', name: 'POST /orders/{id}/cancel', memberCount: 4, entryUid: `${PKG}.controller.OrderController#cancel()`, description: '取消未支付订单，回滚库存与优惠占用。' },
      { uid: 'GET /orders/page', name: 'GET /orders/page', memberCount: 4, entryUid: `${PKG}.controller.OrderController#page()`, description: '按状态与时间分页查询当前用户的订单列表。' },
      { uid: 'SCHEDULED com.example.demo.job.OrderTimeoutJob#run()', name: 'SCHEDULED com.example.demo.job.OrderTimeoutJob#run()', memberCount: 4, entryUid: `${PKG}.job.OrderTimeoutJob#run()`, description: '每分钟扫描超时订单并逐步取消，同时通知支付域。' },
      { uid: 'MQ com.example.demo.listener.PaymentMessageListener#onMessage()', name: 'MQ com.example.demo.listener.PaymentMessageListener#onMessage()', memberCount: 4, entryUid: `${PKG}.listener.PaymentMessageListener#onMessage()`, description: '消费支付完成消息，幂等推进订单状态并触发履约。' }
    ]
  },
  {
    uid: 'item', name: '商品', kind: 'business', classCount: 41,
    description: '商品的查询、上架与库存维护，库存写入供订单与购物车共同消费。',
    capabilities: [
      { uid: 'GET /items', name: 'GET /items', memberCount: 4, entryUid: `${PKG}.controller.ItemController#list()`, description: '按分类与关键词分页查询在售商品，返回商品卡与库存状态。' },
      { uid: 'POST /items', name: 'POST /items', memberCount: 4, entryUid: `${PKG}.controller.ItemController#create()`, description: '上架新商品，校验分类与价格后写入商品表。' },
      { uid: 'GET /items/{id}', name: 'GET /items/{id}', memberCount: 4, entryUid: `${PKG}.controller.ItemController#getById()`, description: '读取单个商品详情与可用库存。' },
      { uid: 'POST /items/{id}/stock', name: 'POST /items/{id}/stock', memberCount: 4, entryUid: `${PKG}.controller.ItemController#updateStock()`, description: '扣减或回补库存，下单与取消共用。' }
    ]
  },
  {
    uid: 'cart', name: '购物车', kind: 'business', classCount: 18,
    description: '登录用户的临时选购清单，结算时整体转为订单。',
    capabilities: [
      { uid: 'GET /carts', name: 'GET /carts', memberCount: 4, entryUid: `${PKG}.controller.CartController#list()`, description: '读取当前用户购物车，实时刷新商品价格与库存状态。' },
      { uid: 'POST /carts', name: 'POST /carts', memberCount: 4, entryUid: `${PKG}.controller.CartController#add()`, description: '把商品加入购物车，同一商品累加数量。' },
      { uid: 'PUT /carts/{id}/quantity', name: 'PUT /carts/{id}/quantity', memberCount: 4, entryUid: `${PKG}.controller.CartController#update()`, description: '修改购物车条目数量，超库存时给出提示。' }
    ]
  },
  {
    uid: 'pay', name: '支付', kind: 'business', classCount: 14,
    description: '发起支付、查询状态并处理回调，是订单履约的资金环节。',
    capabilities: [
      { uid: 'POST /payments', name: 'POST /payments', memberCount: 4, entryUid: `${PKG}.controller.PaymentController#create()`, description: '为待支付订单发起支付，生成支付单并返回支付凭证。' },
      { uid: 'GET /payments/{id}/status', name: 'GET /payments/{id}/status', memberCount: 4, entryUid: `${PKG}.controller.PaymentController#status()`, description: '查询支付单状态，供前端轮询。' },
      { uid: 'MQ com.example.demo.listener.PaymentMessageListener#onMessage()', name: 'MQ com.example.demo.listener.PaymentMessageListener#onMessage()', memberCount: 4, entryUid: `${PKG}.listener.PaymentMessageListener#onMessage()`, description: '接收第三方支付结果，幂等更新支付单并驱动订单状态。' }
    ]
  },
  {
    uid: 'user', name: '用户', kind: 'business', classCount: 12,
    description: '登录与个人资料，为下单、购物车与支付提供身份。',
    capabilities: [
      { uid: 'POST /users/login', name: 'POST /users/login', memberCount: 4, entryUid: `${PKG}.controller.UserController#login()`, description: '账号密码登录，签发令牌并记录登录信息。' },
      { uid: 'GET /users/me', name: 'GET /users/me', memberCount: 4, entryUid: `${PKG}.controller.UserController#me()`, description: '读取当前登录用户资料。' }
    ]
  },
  {
    uid: 'infrastructure', name: 'infrastructure', kind: 'infrastructure', classCount: 24,
    description: '数据访问、缓存、消息与通用工具，不产出能力。这里的类通过调用边被业务能力使用。',
    capabilities: []
  }
]

const MOCK_LAYERS = {
  classCount: 62,
  layers: [
    {
      key: 'entry', name: '用户入口层', classCount: 8, groups: [
        { key: 'order', name: '订单', detail: null, classCount: 3, truncated: false, classes: [
          { uid: `${PKG}.controller.OrderController`, name: 'OrderController' },
          { uid: `${PKG}.controller.CartController`, name: 'CartController' },
          { uid: `${PKG}.controller.PaymentController`, name: 'PaymentController' }
        ] },
        { key: 'user', name: '用户', detail: null, classCount: 1, truncated: false, classes: [
          { uid: `${PKG}.controller.UserController`, name: 'UserController' }
        ] }
      ]
    },
    {
      key: 'business', name: '业务层', classCount: 18, groups: [
        { key: 'order', name: '订单', detail: null, classCount: 3, truncated: false, classes: [
          { uid: `${PKG}.service.OrderService`, name: 'OrderService' },
          { uid: `${PKG}.service.CartService`, name: 'CartService' },
          { uid: `${PKG}.service.PaymentService`, name: 'PaymentService' }
        ] },
        { key: 'item', name: '商品', detail: null, classCount: 2, truncated: false, classes: [
          { uid: `${PKG}.service.ItemService`, name: 'ItemService' },
          { uid: `${PKG}.service.StockService`, name: 'StockService' }
        ] }
      ]
    },
    {
      key: 'domain-model', name: '领域模块层', classCount: 8, groups: [
        { key: 'order', name: '订单', detail: null, classCount: 2, truncated: false, classes: [
          { uid: `${PKG}.model.OrderDTO`, name: 'OrderDTO' },
          { uid: `${PKG}.model.OrderItemDTO`, name: 'OrderItemDTO' }
        ] }
      ]
    },
    {
      key: 'infrastructure', name: '基础设施', classCount: 20, groups: [
        { key: 'mapper', name: 'mapper', detail: `${PKG}.repository`, classCount: 5, truncated: false, classes: [
          { uid: `${PKG}.repository.OrderMapper`, name: 'OrderMapper' },
          { uid: `${PKG}.repository.ItemMapper`, name: 'ItemMapper' },
          { uid: `${PKG}.repository.CartMapper`, name: 'CartMapper' }
        ] }
      ]
    },
    {
      key: 'external', name: '外部依赖', classCount: 4, groups: [
        { key: 'remote', name: 'remote', detail: `${PKG}.remote`, classCount: 2, truncated: false, classes: [
          { uid: `${PKG}.remote.CouponClient`, name: 'CouponClient' },
          { uid: `${PKG}.remote.InventoryClient`, name: 'InventoryClient' }
        ] }
      ]
    },
    {
      key: 'other', name: '未归类', classCount: 2, groups: [
        { key: 'legacy', name: 'legacy', detail: `${PKG}.legacy`, classCount: 2, truncated: false, classes: [
          { uid: `${PKG}.legacy.LegacyHelper`, name: 'LegacyHelper' },
          { uid: `${PKG}.legacy.UnsortedThing`, name: 'UnsortedThing' }
        ] }
      ]
    }
  ],
  edges: [
    { fromLayer: 'entry', toLayer: 'business', count: 12, samples: [
      { fromUid: `${PKG}.controller.OrderController`, toUid: `${PKG}.service.OrderService`, count: 6 },
      { fromUid: `${PKG}.controller.UserController`, toUid: `${PKG}.service.UserService`, count: 2 }
    ] },
    { fromLayer: 'business', toLayer: 'infrastructure', count: 24, samples: [
      { fromUid: `${PKG}.service.OrderService`, toUid: `${PKG}.repository.OrderMapper`, count: 8 }
    ] },
    { fromLayer: 'business', toLayer: 'external', count: 6, samples: [
      { fromUid: `${PKG}.service.OrderService`, toUid: `${PKG}.remote.CouponClient`, count: 3 }
    ] },
    { fromLayer: 'domain-model', toLayer: 'business', count: 3, samples: [
      { fromUid: `${PKG}.model.OrderDTO`, toUid: `${PKG}.service.OrderService`, count: 2 }
    ] },
    { fromLayer: 'entry', toLayer: 'infrastructure', count: 1, samples: [
      { fromUid: `${PKG}.controller.CartController`, toUid: `${PKG}.repository.CartMapper`, count: 1 }
    ] }
  ]
}

const ORDER_CREATE_DETAIL = {
  capability: {
    uid: 'POST /orders',
    name: 'POST /orders',
    description: '创建订单：校验商品与库存、锁定优惠、生成待支付订单。',
    entryUid: `${PKG}.controller.OrderController#createOrder()`,
    memberCount: 6
  },
  members: [
    { uid: `${PKG}.controller.OrderController`, name: 'OrderController', depth: 0, role: 'entry' },
    { uid: `${PKG}.service.OrderService`, name: 'OrderService', depth: 1, role: 'business' },
    { uid: `${PKG}.model.OrderDTO`, name: 'OrderDTO', depth: 1, role: 'domain-model' },
    { uid: `${PKG}.remote.CouponService`, name: 'CouponService', depth: 2, role: 'business' },
    { uid: `${PKG}.repository.OrderMapper`, name: 'OrderMapper', depth: 2, role: 'infrastructure' },
    { uid: `${PKG}.repository.CouponMapper`, name: 'CouponMapper', depth: 3, role: 'infrastructure' }
  ],
  edges: [
    { fromUid: `${PKG}.controller.OrderController`, toUid: `${PKG}.service.OrderService` },
    { fromUid: `${PKG}.service.OrderService`, toUid: `${PKG}.model.OrderDTO` },
    { fromUid: `${PKG}.service.OrderService`, toUid: `${PKG}.remote.CouponService` },
    { fromUid: `${PKG}.service.OrderService`, toUid: `${PKG}.repository.OrderMapper` },
    { fromUid: `${PKG}.remote.CouponService`, toUid: `${PKG}.repository.CouponMapper` }
  ],
  areaCalls: [
    { toAreaUid: 'item', toAreaName: '商品', count: 3, fromClassUids: [`${PKG}.service.OrderService`] },
    { toAreaUid: 'pay', toAreaName: '支付', count: 2, fromClassUids: [`${PKG}.service.OrderService`] }
  ]
}

function mockCapabilityDetail(uid) {
  if (uid === 'POST /orders') return ORDER_CREATE_DETAIL
  const area = MOCK_AREAS.find((a) => a.capabilities.some((c) => c.uid === uid))
  const cap = area?.capabilities.find((c) => c.uid === uid)
  if (!area || !cap) return null

  const prefix = AREA_PREFIX[area.uid]
  const isJob = cap.uid.startsWith('SCHEDULED')
  const isMessage = cap.uid.startsWith('MQ')
  const entryClass = isJob ? `${prefix}TimeoutJob` : isMessage ? 'PaymentMessageListener' : `${prefix}Controller`
  const entryPkg = isJob ? 'job' : isMessage ? 'listener' : 'controller'
  const service = `${PKG}.service.${prefix}Service`
  const members = [
    { uid: `${PKG}.${entryPkg}.${entryClass}`, name: entryClass, depth: 0, role: 'entry' },
    { uid: service, name: `${prefix}Service`, depth: 1, role: 'business' },
    { uid: `${PKG}.model.${prefix}DTO`, name: `${prefix}DTO`, depth: 1, role: 'domain-model' },
    { uid: `${PKG}.repository.${prefix}Mapper`, name: `${prefix}Mapper`, depth: 2, role: 'infrastructure' }
  ]
  const edges = [
    { fromUid: members[0].uid, toUid: service },
    { fromUid: service, toUid: members[2].uid },
    { fromUid: service, toUid: members[3].uid }
  ]
  const exitUid = area.uid === 'item' ? 'order' : area.uid === 'user' ? null : 'item'
  const exitArea = MOCK_AREAS.find((a) => a.uid === exitUid)
  const areaCalls = exitArea
    ? [{ toAreaUid: exitUid, toAreaName: exitArea.name, count: 2, fromClassUids: [service] }]
    : []

  return {
    capability: {
      uid: cap.uid,
      name: cap.name,
      description: cap.description,
      entryUid: cap.entryUid,
      memberCount: members.length
    },
    members,
    edges,
    areaCalls
  }
}

function mockSource(uid) {
  const clazz = MOCK_CLASSES.find((c) => c.qualifiedName === uid) || MOCK_CLASSES[0]
  const pkg = clazz.packageName
  const content = [
    `package ${pkg};`,
    '',
    `public ${clazz.kind === 'INTERFACE' ? 'interface' : 'class'} ${clazz.simpleName} {`,
    '    public void run() {',
    '        // mock 源码：用于验证代码抽屉、行号与高亮',
    '    }',
    '}'
  ].join('\n')
  return {
    uid: clazz.qualifiedName,
    simpleName: clazz.simpleName,
    packageName: pkg,
    filePath: clazz.filePath,
    startLine: 1,
    endLine: content.split('\n').length,
    fileLineCount: content.split('\n').length,
    content,
    truncated: false
  }
}

const bearer = (req) => {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null
}

// 从 Authorization 头识别 access 或 refresh token 并校验
function authSession(req, mode) {
  const token = bearer(req)
  if (mode === 'refresh') {
    return token && findByRefresh(token)
  }
  return token && findByAccess(token)
}

function userById(id) {
  return state.user.id === id ? state.user : null
}

// ========== 路由分发 ==========
async function dispatch(req) {
  const url = new URL(req.url, 'http://mock.local')
  const path = url.pathname
  const method = req.method.toUpperCase()

  // --- 认证 ---
  if (method === 'POST' && path === '/api/auth/login') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
    const { username, password } = body || {}
    const u = state.user
    if (!username || !password || username !== u.username || password !== u.password) {
      return { status: 401, json: fail(401, '用户名或密码错误') }
    }
    return { status: 200, json: ok(loginResponse(u, issueTokens(u))) }
  }

  if (method === 'POST' && path === '/api/auth/register') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
    const { username, password } = body || {}
    if (!username || !password) return { status: 400, json: fail(400, '用户名与密码不能为空') }
    if (username === state.user.username) return { status: 400, json: fail(400, '用户名已存在') }
    return {
      status: 200,
      json: ok({ id: state.user.id, username, email: body.email || '', phone: body.phone || '', createTime: state.user.createTime })
    }
  }

  if (method === 'POST' && path === '/api/auth/logout') {
    revoke(bearer(req), null)
    return { status: 200, json: ok(null) }
  }

  if (method === 'POST' && path === '/api/auth/refresh') {
    const session = authSession(req, 'refresh')
    if (!session) return { status: 401, json: fail(401, '刷新令牌无效或已过期') }
    const user = userById(session.userId)
    if (!user) return { status: 401, json: fail(401, '用户不存在') }
    revoke(session.accessToken, session.refreshToken)
    return { status: 200, json: ok(loginResponse(user, issueTokens(user))) }
  }

  // --- 项目:新建 / 列表 / 上传 / 分析（均需登录）---
  if (method === 'POST' && path === '/api/project') {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或Token已过期') }
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
    const name = (body.name ?? '').trim()
    const description = (body.description ?? '').trim()
    if (!name) return { status: 200, json: fail(3001, '项目名称不能为空') }
    if (name.length > 50) return { status: 200, json: fail(3001, '项目名称长度需在 1-50 之间') }
    if (description.length > 200) return { status: 200, json: fail(3001, '项目描述不能超过 200 字') }
    const p = {
      id: state.nextProjectId++,
      name,
      description,
      gitUrl: body.gitUrl ?? null,
      status: 'CREATED',
      analysisStatus: 'NO_SOURCE',
      createTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
      sourceId: null,
      fileName: null,
      fileSize: null,
      uploadedAt: null,
      analyzedAt: null,
      overview: null
    }
    state.projects.unshift(p)
    return { status: 200, json: ok(projectResponse(p)) }
  }

  if (method === 'GET' && path === '/api/project') {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或Token已过期') }
    return { status: 200, json: ok(state.projects.map(projectResponse)) }
  }

  // 创建 + 上传一体（mock 版）：失败不回滚，仅用于无后端时的 UI 联调
  if (method === 'POST' && path === '/api/project/with-source') {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    const body = await readBody(req)
    const fields = extractMultipartFields(body)
    const meta = extractMultipartMeta(body)
    const name = (fields.name ?? '').trim()
    if (!name) return { status: 200, json: fail(3001, '项目名称不能为空') }
    const p = {
      id: state.nextProjectId++,
      name,
      description: (fields.description ?? '').trim(),
      gitUrl: fields.gitUrl || null,
      status: 'PENDING',
      analysisStatus: 'PENDING',
      createTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
      sourceId: Date.now() % 100000,
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      uploadedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      analyzedAt: null,
      overview: null
    }
    state.projects.unshift(p)
    return {
      status: 200,
      json: ok({
        project: projectResponse(p),
        upload: {
          sourceId: p.sourceId,
          projectId: p.id,
          fileName: p.fileName,
          fileSize: p.fileSize,
          status: 'PENDING',
          taskId: null
        }
      })
    }
  }

  const uploadMatch = path.match(/^\/api\/project\/(\d+)\/upload$/)
  if (method === 'POST' && uploadMatch) {

    const session = authSession(req)
    
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    
    const projectId = Number(uploadMatch[1])
    const p = state.projects.find((x) => x.id === projectId)
    
    if (!p) return { status: 200, json: fail(4000, `项目不存在: ${projectId}`) }
    
    const meta = extractMultipartMeta(await readBody(req))
    
    p.sourceId = p.sourceId ?? Date.now() % 100000
    p.fileName = meta.fileName
    p.fileSize = meta.fileSize
    p.uploadedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
    p.status = 'PENDING'
    p.analysisStatus = 'PENDING'
    p.overview = null // 上传了新源码：旧概况作废

    return {
      status: 200,
      json: ok({
        sourceId: p.sourceId,
        projectId,
        fileName: meta.fileName,
        fileSize: meta.fileSize,
        status: 'PENDING',
        taskId: null
      })
    }
  }

  const delMatch = path.match(/^\/api\/project\/(\d+)$/)
  if (method === 'DELETE' && delMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    const id = Number(delMatch[1])
    const idx = state.projects.findIndex((x) => x.id === id)
    if (idx < 0) return { status: 200, json: fail(4000, '项目不存在') }
    state.projects.splice(idx, 1)
    return { status: 200, json: ok(null) }
  }

  const classesMatch = path.match(/^\/api\/project\/(\d+)\/classes$/)
  if (method === 'GET' && classesMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    return { status: 200, json: ok(MOCK_CLASSES) }
  }

  const domainMapMatch = path.match(/^\/api\/project\/(\d+)\/domain-map$/)
  if (method === 'GET' && domainMapMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    return { status: 200, json: ok({ areas: MOCK_AREAS }) }
  }

  const layersMatch = path.match(/^\/api\/project\/(\d+)\/architecture-layers$/)
  if (method === 'GET' && layersMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    return { status: 200, json: ok(MOCK_LAYERS) }
  }

  const capabilityMatch = path.match(/^\/api\/project\/(\d+)\/capability$/)
  if (method === 'GET' && capabilityMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    const detail = mockCapabilityDetail(url.searchParams.get('uid'))
    if (!detail) return { status: 200, json: fail(4000, '能力不存在') }
    return { status: 200, json: ok(detail) }
  }

  const relationsMatch = path.match(/^\/api\/project\/(\d+)\/class\/relations$/)
  if (method === 'GET' && relationsMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    const uid = url.searchParams.get('uid')
    const center = MOCK_CLASSES.find((c) => c.qualifiedName === uid) || MOCK_CLASSES[0]
    return {
      status: 200,
      json: ok({
        center,
        upstream: { callers: [], dependents: [], subclasses: [] },
        downstream: { callees: [], dependencies: [], parents: [] }
      })
    }
  }

  const sourceMatch = path.match(/^\/api\/project\/(\d+)\/class\/source$/)
  if (method === 'GET' && sourceMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    return { status: 200, json: ok(mockSource(url.searchParams.get('uid'))) }
  }

  const overviewMatch = path.match(/^\/api\/project\/(\d+)\/overview$/)
  if (method === 'GET' && overviewMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    const p = state.projects.find((x) => x.id === Number(overviewMatch[1]))
    if (!p) return { status: 200, json: fail(4000, '项目不存在') }
    if (!p.overview) return { status: 200, json: fail(4000, '该项目尚未分析，请先点击分析生成概况') }
    return { status: 200, json: ok(p.overview) }
  }

  // 最近一次分析任务：刷新/换页后恢复进度
  const latestTaskMatch = path.match(/^\/api\/project\/(\d+)\/tasks\/latest$/)
  if (method === 'GET' && latestTaskMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    const projectId = Number(latestTaskMatch[1])
    let latest = null
    for (const t of taskStore().values()) {
      if (t.projectId === projectId && (!latest || t.taskId > latest.taskId)) latest = t
    }
    return { status: 200, json: ok(latest) }
  }

  const taskMatch = path.match(/^\/api\/task\/(\d+)$/)
  if (method === 'GET' && taskMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    const t = taskStore().get(Number(taskMatch[1]))
    if (!t) return { status: 200, json: fail(4000, '任务不存在') }
    return { status: 200, json: ok(t) }
  }

  const analyzeMatch = path.match(/^\/api\/project\/(\d+)\/analyze$/)
  if (method === 'POST' && analyzeMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    const projectId = Number(analyzeMatch[1])
    const p = state.projects.find((x) => x.id === projectId)
    if (!p) return { status: 200, json: fail(4000, `项目不存在: ${projectId}`) }
    if (!p.sourceId) return { status: 200, json: fail(4000, '该项目尚未上传源码或未完成扫描') }
    const force = url.searchParams.get('force') === 'true'

    // 快路径：非强刷且已有概况 → 合成 SUCCESS（与真实后端一致，不再直接返回 overview）
    if (!force && p.analysisStatus === 'COMPLETED' && p.overview) {
      return {
        status: 200,
        json: ok({
          taskId: null, projectId, type: 'ANALYSIS', status: 'SUCCESS',
          progress: 100, currentStage: null, detail: p.overview, error: null
        })
      }
    }

    const task = {
      taskId: nextTaskId(), projectId, type: 'ANALYSIS',
      status: 'RUNNING', progress: 0, currentStage: 'SCAN', error: null
    }
    taskStore().set(task.taskId, task)
    p.analysisStatus = 'PENDING'
    setTimeout(() => { task.progress = 40; task.currentStage = 'AST' }, 500)
    setTimeout(() => { task.progress = 75; task.currentStage = 'OVERVIEW' }, 1000)
    setTimeout(() => {
      p.overview = buildOverview(p)
      p.analysisStatus = 'COMPLETED'
      p.analyzedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
      task.status = 'SUCCESS'
      task.progress = 100
      task.currentStage = null
    }, 1600)
    return { status: 200, json: ok({ ...task }) }
  }

  return { status: 404, json: fail(404, `mock 未实现的接口: ${method} ${path}`) }
}

function send(res, { status, json }) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(json))
}

// connect 风格中间件，vite dev server 与 express server.js 共用
export function apiMiddleware(req, res, next) {
  if (!req.url.startsWith('/api')) return next()
  dispatch(req)
    .then((r) => send(res, r))
    .catch((err) => {
      if (res.headersSent) return
      send(res, { status: 500, json: fail(500, `mock 处理出错: ${err.message}`) })
    })
}
