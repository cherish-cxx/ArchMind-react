import { useState } from 'react'
import {
  LAYER_LABELS,
  LAYER_ORDER,
  groupPreview,
  normalizeLayers,
  sortedEdges
} from '../../utils/architecture'
import './architecture.css'

// 固定几何：不依赖 DOM 测量，隐藏面板 0 宽时坐标也不会失效。
const BAND_H = 132
const LABEL_W = 120
const GROUP_W = 184
const GROUP_H = 76
const GUTTER_W = 250
const BANDS_H = BAND_H * LAYER_ORDER.length

const bandCenter = (index) => index * BAND_H + BAND_H / 2

const layerIndex = (key) => {
  const index = LAYER_ORDER.indexOf(key)
  return index < 0 ? LAYER_ORDER.length - 1 : index
}

const layerLabel = (key) => LAYER_LABELS[key] || key || '未归类'

const simpleName = (uid) => String(uid || '').split('.').pop()

const edgeKey = (edge) => `${edge.fromLayer}>${edge.toLayer}`

// 三次贝塞尔：源层右缘中心 → 目标层中心，控制点不越过中线。
const edgePath = (fromIndex, toIndex) => {
  const y1 = bandCenter(fromIndex)
  const y2 = bandCenter(toIndex)
  return `M0,${y1} C80,${y1} 170,${y2} ${GUTTER_W},${y2}`
}

// 同一条曲线上的参数点；计数标签沿曲线错开，避免多条边在正中点叠字。
const cubicPoint = (fromIndex, toIndex, t) => {
  const y1 = bandCenter(fromIndex)
  const y2 = bandCenter(toIndex)
  const mt = 1 - t
  return {
    x: 3 * mt * mt * t * 80 + 3 * mt * t * t * 170 + t * t * t * GUTTER_W,
    y: mt * mt * mt * y1 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y2
  }
}

const labelT = (index) => Math.min(0.68, 0.32 + (index % 5) * 0.09)

function GroupBox({ group, onOpenCode }) {
  const preview = groupPreview(group, 3)
  const classes = (group.classes || []).slice(0, preview.names.length)
  return (
    <article
      className="arch-group"
      title={group.detail || group.name || group.key || ''}
      style={{ width: GROUP_W, height: GROUP_H }}
    >
      <div className="arch-group-head">
        <span className="arch-group-name">{group.name || group.key}</span>
        <span className="arch-group-count">
          {group.classCount ?? 0} 个类
          {preview.more > 0 && <em className="arch-group-more" title={`还有 ${preview.more} 个类未展示`}> +{preview.more}</em>}
        </span>
      </div>
      <div className="arch-group-classes">
        {classes.map((cls) => (
          <button
            key={cls.uid}
            type="button"
            className="arch-class-chip"
            onClick={() => onOpenCode?.(cls.uid)}
            title={`打开 ${cls.uid} 的源码`}
          >
            {cls.name || simpleName(cls.uid) || cls.uid}
          </button>
        ))}
      </div>
    </article>
  )
}

function Band({ layer, onOpenCode }) {
  const groups = layer.groups || []
  const hasClasses = (layer.classCount || 0) > 0
  const isOther = layer.key === 'other'
  return (
    <section
      className={`arch-band${isOther ? ' is-other' : ''}`}
      aria-label={layer.name || LAYER_LABELS[layer.key] || layer.key}
      style={{ height: BAND_H }}
    >
      <div className="arch-band-label" style={{ width: LABEL_W }}>
        <span className="arch-band-name">{layer.name || LAYER_LABELS[layer.key] || layer.key}</span>
        <span className="arch-band-count">{layer.classCount ?? 0} 个类</span>
      </div>
      <div className="arch-groups">
        {!hasClasses ? (
          <span className="arch-band-empty">无此类</span>
        ) : groups.length === 0 ? (
          <span className="arch-band-empty">暂无分组</span>
        ) : (
          groups.map((group) => (
            <GroupBox
              key={`${layer.key}:${group.key}`}
              group={group}
              onOpenCode={onOpenCode}
            />
          ))
        )}
      </div>
    </section>
  )
}

function EdgeGutter({ edges, selectedKey, onSelect }) {
  return (
    <div className="arch-gutter">
      <svg width={GUTTER_W} height={BANDS_H} role="group" aria-label="跨层调用边">
        <defs>
          <marker id="arch-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" className="arch-arrow-head" />
          </marker>
          <marker id="arch-arrow-sel" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" className="arch-arrow-head is-selected" />
          </marker>
        </defs>
        {edges.map((edge, index) => {
          const fromIndex = layerIndex(edge.fromLayer)
          const toIndex = layerIndex(edge.toLayer)
          const key = edgeKey(edge)
          const selected = key === selectedKey
          const count = edge.count ?? 0
          const labelPoint = cubicPoint(fromIndex, toIndex, labelT(index))
          const activate = () => onSelect(edge)
          return (
            <g
              key={key}
              className={`arch-edge${selected ? ' is-selected' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`${layerLabel(edge.fromLayer)} 到 ${layerLabel(edge.toLayer)}，${count} 条调用关系`}
              aria-pressed={selected}
              onClick={activate}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  activate()
                }
              }}
            >
              <path className="arch-edge-hit" d={edgePath(fromIndex, toIndex)} />
              <path
                className="arch-edge-line"
                d={edgePath(fromIndex, toIndex)}
                markerEnd={`url(#${selected ? 'arch-arrow-sel' : 'arch-arrow'})`}
              />
              <text className="arch-edge-count" x={labelPoint.x} y={labelPoint.y} dy="0.32em">
                {count}
              </text>
            </g>
          )
        })}
      </svg>
      {edges.length === 0 && <p className="arch-gutter-empty">没有跨层调用</p>}
    </div>
  )
}

function EdgeDetail({ edge }) {
  if (!edge) return null
  const samples = edge.samples || []
  return (
    <div className="arch-edge-detail" role="status">
      <p className="arch-edge-summary">
        <b>{layerLabel(edge.fromLayer)}</b>
        <span aria-hidden="true"> → </span>
        <b>{layerLabel(edge.toLayer)}</b>
        <span>，{edge.count ?? 0} 条调用关系</span>
      </p>
      {samples.length === 0 ? (
        <p className="arch-edge-samples-empty">这条边没有可展示的具体类对。</p>
      ) : (
        <ul className="arch-edge-samples">
          {samples.map((sample) => (
            <li key={`${sample.fromUid}>${sample.toUid}`} className="arch-edge-sample">
              <span className="arch-edge-sample-name">{simpleName(sample.fromUid) || '未知'}</span>
              <span aria-hidden="true"> → </span>
              <span className="arch-edge-sample-name">{simpleName(sample.toUid) || '未知'}</span>
              <span className="arch-edge-sample-count">{sample.count ?? 0} 条</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * 系统架构分层：六条固定色带 + 一条跨层调用槽。
 * 全部几何由常量推导，类名点击走 onOpenCode，边点开在下方看具体类对。
 */
export default function LayerBands({ data, loading = false, error = '', onRetry, onOpenCode }) {
  const [selectedKey, setSelectedKey] = useState(null)
  const model = normalizeLayers(data)
  const edges = sortedEdges(model.edges)
  const selected = edges.find((edge) => edgeKey(edge) === selectedKey) || null

  if (loading) {
    return <p className="arch-status">正在读取架构分层…</p>
  }

  if (error) {
    return (
      <div className="arch-status is-error">
        <p className="arch-status-title">架构分层读取失败</p>
        <p className="arch-status-text">{error}</p>
        {onRetry && (
          <button type="button" className="btn-ghost arch-retry" onClick={onRetry}>
            重试
          </button>
        )}
      </div>
    )
  }

  if (!model.classCount) {
    return <p className="arch-status">这次分析没有产出类角色</p>
  }

  const select = (edge) => {
    const key = edgeKey(edge)
    setSelectedKey((current) => (current === key ? null : key))
  }

  const otherLayer = model.layers.find((layer) => layer.key === 'other')
  const hasOtherClasses = (otherLayer?.classCount || 0) > 0

  return (
    <div className="arch-view">
      <div className="arch-body">
        <div className="arch-bands">
          {model.layers.map((layer) => (
            <Band key={layer.key} layer={layer} onOpenCode={onOpenCode} />
          ))}
        </div>
        <EdgeGutter edges={edges} selectedKey={selectedKey} onSelect={select} />
      </div>
      {hasOtherClasses && (
        <p className="arch-other-note">未能归类的类不会被隐藏</p>
      )}
      <EdgeDetail edge={selected} />
      <p className="arch-foot">分层由类角色推导；同层调用不计入跨层边</p>
    </div>
  )
}
