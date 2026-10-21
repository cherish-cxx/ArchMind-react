/**
 * Agent 接口的共享类型与枚举。
 *
 * 只做三件事：
 *  1. 用 JSDoc 描述后端字段，给编辑器和后续代码一个可查的契约；
 *  2. 把散落在各处的字符串枚举收拢到一处，避免前端口径漂移；
 *  3. 不在这里做任何转换 —— 字段归一化在 api/agent.js，图状态在 graph/model.js。
 *
 * 字段来源：Java AgentResponse / Python app/models/response.py。
 */

/** @typedef {'CLASS'|'METHOD'} NodeRefType */

/**
 * 指向图里一个实体的引用。
 * @typedef {Object} NodeRef
 * @property {NodeRefType} type
 * @property {string} uid 类=全限定名；方法=owner#signature
 */

/** @typedef {'CLASS'|'INTERFACE'|'ENUM'} NodeKind */
/** @typedef {'CALLS'|'EXTENDS'|'IMPLEMENTS'|'DEPENDS'} RelationType */
/** @typedef {'FOCUS_NODE'|'EXPAND_NODE'|'SHOW_PATH'|'CLEAR_VIEW'} UiOp */
/** @typedef {'INTENT'|'TOOL'|'LLM'} StepType */

/**
 * 前端可直接渲染的类节点。x/y 由前端布局写入，后端不返回。
 * @typedef {Object} GraphNode
 * @property {string} uid
 * @property {string} [name]
 * @property {NodeKind} [kind]
 * @property {string} [packageName]
 * @property {string} [module]
 * @property {number} [depth] 仅 call-chain 有，用来做分层布局
 * @property {boolean} [viaFanout] 接口 → 实现类的扇出边/节点
 * @property {number} [edgeCount]
 * @property {string} [description] 来自类清单，Agent 的 graph patch 不带
 * @property {number} [x]
 * @property {number} [y]
 */

/**
 * 一条可渲染的边。JSON 字段是 `from`，不是 `from_`。
 * @typedef {Object} GraphEdge
 * @property {string} from
 * @property {string} to
 * @property {RelationType} rel
 * @property {number} [callCount]
 * @property {boolean} [viaFanout]
 */

/**
 * 链路断点。必须画成「未解析」，不能当成这条关系不存在。
 * @typedef {Object} GraphGap
 * @property {string} at
 * @property {string} reason
 */

/**
 * 一轮回答对应的证据子图。null 表示「这轮没有图数据」，不是「图是空的」。
 * @typedef {Object} GraphPatch
 * @property {GraphNode[]} nodes
 * @property {GraphEdge[]} edges
 * @property {GraphGap[]} gaps
 * @property {boolean} truncated
 */

/**
 * @typedef {Object} Citation
 * @property {string} uid
 * @property {NodeRefType} kind
 */

/**
 * @typedef {Object} UiCommand
 * @property {UiOp} op
 * @property {NodeRef|null} [target]
 * @property {Object<string, any>} [params]
 * @property {number} rev 这条命令基于哪一版屏幕；比本地 rev 旧就丢弃
 */

/**
 * @typedef {Object} Suggestion
 * @property {string} label
 * @property {string} intent
 * @property {Object<string, any>} [slots]
 */

/**
 * @typedef {Object} Step
 * @property {number} n
 * @property {StepType} type
 * @property {string} detail
 * @property {number} ms
 */

/**
 * @typedef {Object} Meta
 * @property {string} intent
 * @property {number} confidence
 * @property {number} graphRev 后端代码图版本（不是前端 viewport rev）
 * @property {number} latencyMs
 */

/**
 * POST /api/agent/ask 的响应。
 * @typedef {Object} AgentResponse
 * @property {string} [conversationId]
 * @property {string} message
 * @property {boolean} sessionExpired
 * @property {Citation[]} citations
 * @property {UiCommand[]} uiCommands
 * @property {GraphPatch|null} graph
 * @property {Suggestion[]} suggestions
 * @property {Step[]} steps
 * @property {Meta|null} meta
 */

/**
 * 屏幕快照里的关系。和 GraphEdge 的区别：这里只有恢复屏幕所需的三要素。
 * @typedef {Object} ViewportRelation
 * @property {string} from
 * @property {string} to
 * @property {RelationType} rel
 */

/**
 * GET /api/agent/conversations/{id} 的响应。
 * exists=false 时其余字段为空，前端据此把会话置灰。
 * @typedef {Object} ConversationSnapshot
 * @property {boolean} exists
 * @property {string|null} [reason]
 * @property {ViewportState|null} [viewport]
 * @property {NodeRef|null} [focus]
 */

/**
 * @typedef {Object} ViewportState
 * @property {number} rev
 * @property {string[]} visibleNodes
 * @property {ViewportRelation[]} visibleRelations
 * @property {NodeRef|null} focusedNode
 * @property {boolean} truncated
 */

/** 指向图实体的类型。 */
export const NodeRefType = Object.freeze({
  CLASS: 'CLASS',
  METHOD: 'METHOD'
})

/** 图节点种类。 */
export const NodeKind = Object.freeze({
  CLASS: 'CLASS',
  INTERFACE: 'INTERFACE',
  ENUM: 'ENUM'
})

/** 图里的关系类型（与后端 RelationType 对齐）。 */
export const RelationType = Object.freeze({
  CALLS: 'CALLS',
  EXTENDS: 'EXTENDS',
  IMPLEMENTS: 'IMPLEMENTS',
  DEPENDS: 'DEPENDS'
})

/** 前端要执行的视图命令，V1 只有这四个。 */
export const UiOp = Object.freeze({
  FOCUS_NODE: 'FOCUS_NODE',
  EXPAND_NODE: 'EXPAND_NODE',
  SHOW_PATH: 'SHOW_PATH',
  CLEAR_VIEW: 'CLEAR_VIEW'
})

/** 一轮问答里的步骤类型。 */
export const StepType = Object.freeze({
  INTENT: 'INTENT',
  TOOL: 'TOOL',
  LLM: 'LLM'
})
