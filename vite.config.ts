import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// index.html sarlavhasi/rangi va PWA manifest'ni brend env'dan yasaydi (src/brand.ts bilan bir xil standartlar)
function brandPlugin(env: Record<string, string>): Plugin {
  const name = env.VITE_BRAND_NAME?.trim() || 'MARKAZZO'
  const color = env.VITE_BRAND_COLOR?.trim() || '#c1121f'
  const title = `${name} — Do'kon boshqaruvi`
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
  const icon = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' rx='36' fill='${color}'/><text x='96' y='124' font-size='92' font-family='Arial' font-weight='bold' fill='white' text-anchor='middle'>${esc(name.charAt(0).toUpperCase())}</text></svg>`
  const manifest = JSON.stringify({
    name: title,
    short_name: name,
    start_url: '/',
    display: 'standalone',
    background_color: '#141414',
    theme_color: color,
    icons: [{ src: 'data:image/svg+xml,' + encodeURIComponent(icon), sizes: '192x192', type: 'image/svg+xml' }],
  }, null, 2)
  return {
    name: 'brand',
    transformIndexHtml: (html) =>
      html.replace(/<title>.*<\/title>/, `<title>${esc(title)}</title>`)
        .replace(/(<meta name="theme-color" content=")[^"]*/, `$1${esc(color)}`),
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json')
        res.end(manifest)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), brandPlugin(env)],
    server: { host: true, port: 5174 },
  }
})
