/**
 * Shiki 高亮器的**唯一实例**。
 *
 * 代码抽屉和讲解正文都要高亮，各建一个 highlighter 会把这一串语言语法重复加载一遍，
 * 所以主题在这里一次建全，两边共用同一份。
 */

export const THEMES = ['github-dark', 'github-light']

export const LANGS = [
  'java', 'javascript', 'typescript', 'tsx', 'jsx', 'python', 'json', 'yaml',
  'xml', 'sql', 'bash', 'markdown', 'css', 'html', 'kotlin', 'go', 'rust',
  'csharp', 'properties'
]

let highlighterPromise = null

export function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki')
      .then(({ createHighlighter }) => createHighlighter({ themes: THEMES, langs: LANGS }))
      .catch((err) => {
        highlighterPromise = null
        throw err
      })
  }
  return highlighterPromise
}
