import { useState } from 'react'
import {
  LAYER_LABELS,
  LAYER_SHORT,
  buildMatrix,
  cellKey,
  layerShare,
  layerTraffic,
  normalizeLayers,
  summarize,
  topPairs
} from '../../utils/architecture'
import './architecture.css'

const layerLabel = (key) => LAYER_LABELS[key] || key || '未归类'

const simpleName = (uid) => String(uid || '').split('.').pop()

const countOf = (edge) => edge?.count ?? 0

function ClassChip({ cls, onOpenCode }) {
  const name = cls.name || simpleName(cls.uid) || cls.uid
  if (!onOpenCode) {
    return <span className="arch-class is-static" title={cls.uid}>{name}</span>
  }
  return (
    <button
      type="button"
      className="arch-class"
      title={`打开 ${cls.uid} 的源码`}
      onClick={() => onOpenCode(cls.uid)}
    >
      {name}
    </button>
  )
}

function GroupLine({ group, onOpenCode }) {
  const classes = group.classes || []
  return (
    <div className="arch-group">
      <span className="arch-group-name" title={group.detail || group.name || group.key}>
        {group.name || group.key}
        <em className="arch-group-count">{group.classCount ?? 0}</em>
      </span>
      <div className="arch-group-classes">
        {classes.map((cls) => (
          <ClassChip key={cls.uid} cls={cls} onOpenCode={onOpenCode} />
        ))}
      </div>
    </div>
  )
}

function Stratum({ layer, total, selected, related, onSelect, onOpenCode }) {
  const groups = layer.groups || []
  const count = layer.classCount ?? 0
  const hasClasses = count > 0
  const name = layer.name || layerLabel(layer.key)
  return (
    <section
      className={`arch-stratum${selected ? ' is-selected' : ''}${related ? ' is-related' : ''}${layer.key === 'other' ? ' is-other' : ''}`}
    >
      <button
        type="button"
        className="arch-stratum-head"
        aria-pressed={selected}
        onClick={() => onSelect(layer.key)}
        title={selected ? '取消选中这一层' : '选中这一层，在右侧看它的出入口'}
      >
        <span className="arch-stratum-name">{name}</span>
        <span className="arch-stratum-count">{count} 个类</span>
        <span className="arch-stratum-share">{layerShare(count, total)}%</span>
      </button>
      {hasClasses && groups.length > 0 ? (
        <div className="arch-stratum-body">
          {groups.map((group) => (
            <GroupLine key={group.key} group={group} onOpenCode={onOpenCode} />
          ))}
        </div>
      ) : (
        <p className="arch-stratum-empty">{hasClasses ? '这一层没有分组' : '没有类归入这一层'}</p>
      )}
    </section>
  )
}

function LayerMatrix({ matrix, selectedKey, activeRow, activeCol, onToggle }) {
  return (
    <div className="arch-matrix-scroll">
      <table className="arch-matrix">
        <thead>
          <tr>
            <th className="arch-matrix-corner" aria-label="调用方 / 被调用方" />
            {matrix.keys.map((key) => (
              <th
                key={key}
                scope="col"
                className={activeCol === key ? 'is-active' : undefined}
                title={layerLabel(key)}
              >
                {LAYER_SHORT[key]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.keys.map((from) => (
            <tr key={from}>
              <th
                scope="row"
                className={activeRow === from ? 'is-active' : undefined}
                title={layerLabel(from)}
              >
                {LAYER_SHORT[from]}
              </th>
              {matrix.keys.map((to) => {
                if (from === to) {
                  return (
                    <td key={to} className="arch-cell is-diagonal" title="同层调用不计入跨层边">
                      —
                    </td>
                  )
                }
                const edge = matrix.cells.get(`${from}>${to}`)
                if (!edge) {
                  return <td key={to} className="arch-cell is-empty" title="没有跨层调用">·</td>
                }
                const key = cellKey(edge)
                const isSelected = key === selectedKey
                const ratio = matrix.max ? countOf(edge) / matrix.max : 0
                return (
                  <td key={to} className="arch-cell">
                    <button
                      type="button"
                      className={`arch-cell-btn${isSelected ? ' is-selected' : ''}`}
                      style={{ '--cell-tint': `${(6 + ratio * 26).toFixed(1)}%` }}
                      aria-pressed={isSelected}
                      title={`${layerLabel(from)} → ${layerLabel(to)}，${countOf(edge)} 条调用`}
                      onClick={() => onToggle(edge)}
                    >
                      {countOf(edge)}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PairList({ pairs, onOpenCode }) {
  return (
    <ul className="arch-pairs">
      {pairs.map((sample, index) => {
        const uid = sample.fromUid
        const body = (
          <>
            <span className="arch-pair-name">{simpleName(uid) || '未知'}</span>
            <span className="arch-pair-arrow" aria-hidden="true">→</span>
            <span className="arch-pair-name">{simpleName(sample.toUid) || '未知'}</span>
            <span className="arch-pair-count">{countOf(sample)} 条</span>
          </>
        )
        return (
          <li key={`${sample.fromUid}>${sample.toUid}:${index}`} className="arch-pair-item">
            {onOpenCode ? (
              <button
                type="button"
                className="arch-pair"
                title={`打开 ${uid} 的源码`}
                onClick={() => onOpenCode(uid)}
              >
                {body}
              </button>
            ) : (
              <span className="arch-pair is-static">{body}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function EdgeInspect({ edge, onOpenCode, onSelectEdge }) {
  const samples = edge.samples || []
  return (
    <div className="arch-inspect" role="status">
      <p className="arch-inspect-summary">
        <b>{layerLabel(edge.fromLayer)}</b>
        <span aria-hidden="true"> → </span>
        <b>{layerLabel(edge.toLayer)}</b>
        <span>，{countOf(edge)} 条调用</span>
      </p>
      {samples.length === 0 ? (
        <p className="arch-inspect-meta">这条边没有可展示的具体类对。</p>
      ) : (
        <PairList pairs={samples} onOpenCode={onOpenCode} />
      )}
      <button
        type="button"
        className="arch-inspect-close"
        onClick={() => onSelectEdge(null)}
      >
        收起
      </button>
    </div>
  )
}

function TopPairsInspect({ pairs, onOpenCode }) {
  if (pairs.length === 0) {
    return <p className="arch-inspect-hint">没有跨层调用，六层之间彼此独立。</p>
  }
  return (
    <div className="arch-inspect">
      <p className="arch-inspect-summary"><b>最频繁的类对</b></p>
      <PairList pairs={pairs} onOpenCode={onOpenCode} />
      <p className="arch-inspect-meta">点矩阵里带数字的格子，看这一层到另一层的全部类对。</p>
    </div>
  )
}

function LayerInspect({ layer, traffic, total, onSelectEdge }) {
  const out = traffic.outEdges || []
  const inn = traffic.inEdges || []
  return (
    <div className="arch-inspect" role="status">
      <p className="arch-inspect-summary">
        <b>{layer.name || layerLabel(layer.key)}</b>
        <span>，{layer.classCount ?? 0} 个类，占 {layerShare(layer.classCount ?? 0, total)}%</span>
      </p>
      <p className="arch-inspect-meta">
        向外调用 {traffic.out} 条，被其他层调用 {traffic.in} 条。
      </p>
      {out.length > 0 && (
        <div className="arch-inspect-row">
          <span className="arch-inspect-tag">调出</span>
          {out.map((edge) => (
            <button
              key={cellKey(edge)}
              type="button"
              className="arch-link-btn"
              onClick={() => onSelectEdge(edge)}
            >
              {layerLabel(edge.toLayer)} {countOf(edge)}
            </button>
          ))}
        </div>
      )}
      {inn.length > 0 && (
        <div className="arch-inspect-row">
          <span className="arch-inspect-tag">接入</span>
          {inn.map((edge) => (
            <button
              key={cellKey(edge)}
              type="button"
              className="arch-link-btn"
              onClick={() => onSelectEdge(edge)}
            >
              {layerLabel(edge.fromLayer)} {countOf(edge)}
            </button>
          ))}
        </div>
      )}
      {out.length === 0 && inn.length === 0 && (
        <p className="arch-inspect-meta">这一层没有和其他层发生调用。</p>
      )}
    </div>
  )
}

/**
 * 系统架构分层：左边是分层剖面（每层的分组与类），右边是层间调用矩阵。
 * 点层名看这一层的进出，点矩阵格子看具体类对，点类名打开源码。
 */
export default function ArchitectureLayers({ data, loading = false, error = '', onRetry, onOpenCode }) {
  const [selectedLayer, setSelectedLayer] = useState(null)
  const [selectedCell, setSelectedCell] = useState(null)
  const model = normalizeLayers(data)
  const matrix = buildMatrix(model.edges)
  const traffic = layerTraffic(model)
  const summary = summarize(model)
  const selectedEdge = selectedCell ? matrix.cells.get(selectedCell) : null
  const selectedLayerData = selectedLayer
    ? model.layers.find((layer) => layer.key === selectedLayer)
    : null
  const activeRow = selectedEdge ? selectedEdge.fromLayer : selectedLayer
  const activeCol = selectedEdge ? selectedEdge.toLayer : selectedLayer

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

  const selectLayer = (key) => {
    setSelectedLayer((current) => (current === key ? null : key))
    setSelectedCell(null)
  }

  const selectEdge = (edge) => {
    if (!edge) {
      setSelectedCell(null)
      return
    }
    const key = cellKey(edge)
    setSelectedCell((current) => (current === key ? null : key))
    setSelectedLayer(null)
  }

  const lead = summary.topLayer
    ? `共 ${summary.total} 个类，分布在 ${summary.activeLayers} 层，${layerLabel(summary.topLayer.key)}最重（${summary.topLayer.classCount ?? 0} 个类）。`
    : `共 ${summary.total} 个类。`
  const crossLayer = summary.calls > 0 && summary.topEdge
    ? `跨层调用 ${summary.calls} 条，最密集的是${layerLabel(summary.topEdge.fromLayer)} → ${layerLabel(summary.topEdge.toLayer)}（${countOf(summary.topEdge)} 条）。`
    : '这次分析没有记录到跨层调用。'

  return (
    <div className="arch-view">
      <p className="arch-lead">
        {lead}
        {crossLayer}
      </p>
      <div className="arch-sheet">
        <section className="arch-panel arch-panel-strata" aria-label="分层剖面">
          <header className="arch-panel-head">
            <h2>分层剖面</h2>
            <p>点层名看它的出入口，点类名打开源码</p>
          </header>
          <div className="arch-strata">
            {model.layers.map((layer) => (
              <Stratum
                key={layer.key}
                layer={layer}
                total={summary.total}
                selected={selectedLayer === layer.key}
                related={Boolean(
                  selectedEdge &&
                  (selectedEdge.fromLayer === layer.key || selectedEdge.toLayer === layer.key)
                )}
                onSelect={selectLayer}
                onOpenCode={onOpenCode}
              />
            ))}
          </div>
        </section>
        <section className="arch-panel arch-panel-matrix" aria-label="层间调用">
          <header className="arch-panel-head">
            <h2>层间调用</h2>
            <p>行是调用方，列是被调用方</p>
          </header>
          <LayerMatrix
            matrix={matrix}
            selectedKey={selectedCell}
            activeRow={activeRow}
            activeCol={activeCol}
            onToggle={(edge) => selectEdge(edge)}
          />
          {selectedEdge ? (
            <EdgeInspect edge={selectedEdge} onOpenCode={onOpenCode} onSelectEdge={selectEdge} />
          ) : selectedLayerData ? (
            <LayerInspect
              layer={selectedLayerData}
              traffic={traffic.get(selectedLayerData.key)}
              total={summary.total}
              onSelectEdge={(edge) => selectEdge(edge)}
            />
          ) : (
            <TopPairsInspect pairs={topPairs(model, 5)} onOpenCode={onOpenCode} />
          )}
        </section>
      </div>
      <p className="arch-foot">分层由类角色推导；同层调用不计入跨层边。</p>
    </div>
  )
}
