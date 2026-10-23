// 后端已把 techStack.category 收敛到封闭枚举；这里仍做一次别名兼容，
// 以便旧数据/缓存和 mock 数据不会把"语言"漏进技术栈标签。
const ALIASES = {
  语言: '语言',
  language: '语言',
  languages: '语言',
  'programming language': '语言',
  programminglanguage: '语言',
  编程语言: '语言',
  开发语言: '语言',
  lang: '语言',

  框架: '框架',
  framework: '框架',
  frameworks: '框架',
  'web framework': '框架',
  开发框架: '框架',
  应用框架: '框架',
  orm: '框架',

  中间件: '中间件',
  middleware: '中间件',
  消息队列: '中间件',
  'message queue': '中间件',
  mq: '中间件',
  缓存: '中间件',
  cache: '中间件',

  数据库: '数据库',
  database: '数据库',
  databases: '数据库',
  db: '数据库',
  存储: '数据库',
  storage: '数据库',

  构建工具: '构建工具',
  构建: '构建工具',
  build: '构建工具',
  'build tool': '构建工具',
  buildtool: '构建工具',
  包管理: '构建工具',
  'package manager': '构建工具',
  依赖管理: '构建工具',
  'dependency management': '构建工具',

  测试: '测试',
  test: '测试',
  tests: '测试',
  testing: '测试',
  测试框架: '测试',
  'test framework': '测试',

  工具: '工具',
  tool: '工具',
  tools: '工具',
  utility: '工具',
  开发工具: '工具',

  其他: '其他',
  other: '其他',
  others: '其他',
  misc: '其他',
  miscellaneous: '其他'
}

export function normalizeCategory(raw) {
  if (!raw) return '其他'
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, ' ')
  return ALIASES[key] || '其他'
}

/**
 * 从概况里拆出「开发语言」与「技术栈标签」。
 * 语言优先取 techStack 中 category=语言 的项；没有则用 file.language 聚合兜底。
 */
export function splitTechStack(techStack, languages = []) {
  const items = Array.isArray(techStack) ? techStack : []
  const langItem = items.find((t) => t && normalizeCategory(t.category) === '语言')
  const language = langItem?.name || (Array.isArray(languages) ? languages[0] : '') || '—'
  const stack = items
    .filter((t) => t && normalizeCategory(t.category) !== '语言')
    .slice(0, 4)
  return { language, stack }
}
