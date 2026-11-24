import AgentPanel from './AgentPanel'
import { useGraphState } from '../../state/graphStore'
import { usePagesState } from '../../state/pagesStore'
import { simpleName } from '../../graph/model'

/**
 * 常驻右侧的 Agent 面板。
 *
 * 锚点标签要跟着画布焦点走，但订阅图状态会把整个 App 拖进每次布局更新——
 * 所以把订阅收在这一层，外面只传行为。
 */
export default function AgentDock(props) {
  const graph = useGraphState()
  const pages = usePagesState()
  const activePage = pages.pages.find((p) => p.id === pages.activeId) || pages.pages[0]

  const focusUid = activePage?.kind === 'focus' && activePage.centerUid
    ? (activePage.selectedUid || activePage.centerUid)
    : graph.focusUid
  const node = focusUid ? graph.nodes.get(focusUid) : null
  const focusLabel = node?.name || (focusUid ? simpleName(focusUid) : '')

  return <AgentPanel {...props} focusLabel={focusLabel} />
}
