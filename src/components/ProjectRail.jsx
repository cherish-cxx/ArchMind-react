import {
  STAGE_KEYS,
  STAGE_LABELS,
  STAGE_PAGES,
  stageStates,
  currentStage,
  runningNote
} from '../utils/projectStages'

/**
 * 项目流程轨。
 *
 * 一条线回答三个问题：这个项目走到哪一步了、还能往哪去、下一步该做什么。
 * 主操作只出现在这里——页面头部的按钮因此可以退成次要动作，
 * 同屏永远只有一个橙色按钮，且永远在同一个位置。
 */
export default function ProjectRail({
  project,
  page,
  analyzing = false,
  taskProgress = 0,
  onUpload,
  onAnalyze,
  onOpenPage,
  projects = [],
  onSwitchProject,
  bleed = false
}) {
  if (!project) return null

  const status = project.analysisStatus
  const states = stageStates(project)
  const current = currentStage(project, analyzing, page)
  const running = analyzing || status === 'PENDING'
  const note = current === 'analysis' ? runningNote(project, analyzing, taskProgress) : null

  let action = null
  if (current === 'source') {
    action = { label: '上传源码', run: onUpload }
  } else if (current === 'analysis' && !running) {
    const label = status === 'PARTIAL' ? '补全分析' : status === 'FAILED' ? '重新分析' : '开始分析'
    action = { label, run: onAnalyze }
  } else if (current === 'overview') {
    action = { label: '进入领域地图', run: () => onOpenPage?.('domain') }
  } else if (current === 'domain') {
    action = { label: '进入记忆地图', run: () => onOpenPage?.('memory') }
  }

  return (
    <div className={`rail${bleed ? ' is-bleed' : ''}`}>
      <div className="rail-project">
        {projects.length > 1 && onSwitchProject ? (
          <select
            className="rail-select"
            value={String(project.id)}
            onChange={(e) => {
              const next = projects.find((p) => String(p.id) === e.target.value)
              if (next) onSwitchProject(next)
            }}
            aria-label="切换项目"
            title="切换项目"
          >
            {projects.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        ) : (
          <span className="rail-project-name" title={project.name}>{project.name}</span>
        )}
      </div>

      <ol className="rail-stations">
        {STAGE_KEYS.map((key) => {
          const state = key === current ? 'current' : states[key]
          const target = STAGE_PAGES[key]
          const clickable = Boolean(target) && states[key] === 'done' && key !== current
          const body = (
            <>
              <span className="rail-dot" aria-hidden="true" />
              <span className="rail-label">{STAGE_LABELS[key]}</span>
              {key === current && note && <span className="rail-note">{note}</span>}
            </>
          )

          return (
            <li key={key} className={`rail-station is-${state}${clickable ? ' is-clickable' : ''}`}>
              <span className="rail-seg" aria-hidden="true" />
              {clickable ? (
                <button
                  type="button"
                  className="rail-station-btn"
                  onClick={() => onOpenPage?.(target)}
                  title={`前往${STAGE_LABELS[key]}`}
                >
                  {body}
                </button>
              ) : (
                <span className="rail-station-body" aria-current={key === current ? 'step' : undefined}>
                  {body}
                </span>
              )}
            </li>
          )
        })}
      </ol>

      <div className="rail-next">
        {action && (
          <button type="button" className="btn-primary rail-action" onClick={action.run}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}
