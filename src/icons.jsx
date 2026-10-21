// 统一线性图标库 (stroke 风格, 16px 基准)
const I = ({ children, size = 16, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {children}
  </svg>
)

export const IconUpload = (p) => <I {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></I>
export const IconDashboard = (p) => <I {...p}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></I>
export const IconMap = (p) => <I {...p}><polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21 1 6" /><line x1="8" y1="3" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="21" /></I>
export const IconFolder = (p) => <I {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></I>
export const IconSearch = (p) => <I {...p}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></I>
export const IconFilter = (p) => <I {...p}><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3" /></I>
export const IconMinus = (p) => <I {...p}><line x1="5" y1="12" x2="19" y2="12" /></I>
export const IconPlus = (p) => <I {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></I>
export const IconFullscreen = (p) => <I {...p}><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /><path d="M8 21H5a2 2 0 0 1-2-2v-3" /></I>
export const IconChevronDown = (p) => <I {...p}><polyline points="6 9 12 15 18 9" /></I>
export const IconSend = (p) => <I {...p}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></I>
export const IconBot = (p) => <I {...p}><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M12 8V4" /><circle cx="12" cy="3" r="1" /><circle cx="9" cy="13" r="0.5" fill="currentColor" /><circle cx="15" cy="13" r="0.5" fill="currentColor" /><path d="M9 17h6" /></I>
export const IconPanelHide = (p) => <I {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="15" y1="4" x2="15" y2="20" /><polyline points="18 10 20 12 18 14" /></I>
export const IconPanelShow = (p) => <I {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="15" y1="4" x2="15" y2="20" /><polyline points="11 10 9 12 11 14" /></I>
export const IconMessage = (p) => <I {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></I>
export const IconRefresh = (p) => <I {...p}><polyline points="1 4 1 10 7 10" /><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10" /></I>
export const IconBook = (p) => <I {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></I>
export const IconX = (p) => <I {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></I>
export const IconArrowLeft = (p) => <I {...p}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></I>
export const IconMore = (p) => <I {...p}><circle cx="12" cy="5" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="19" r="1.4" fill="currentColor" /></I>
export const IconTrash = (p) => <I {...p}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></I>
