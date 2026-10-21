import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { apiMiddleware } from './mock/apiMiddleware.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

// /api 交给共享 mock 处理器（VITE_ENABLE_MOCK=false 时不再挂载）
if (process.env.VITE_ENABLE_MOCK !== 'false') {
  app.use(apiMiddleware)
}

app.use(express.static(path.join(__dirname, 'dist')))
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`ArchMind server running at http://localhost:${PORT}`)
})
