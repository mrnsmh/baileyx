import express, { Request, Response, NextFunction } from 'express'
import type { Server } from 'http'
import type { WhtspClient } from '../core/types.js'

export interface ApiServerOptions {
  port: number
  host: string
  apiKey?: string
}

export class ApiServer {
  private app: express.Application
  private server?: Server
  private client: WhtspClient
  private options: ApiServerOptions

  constructor(client: WhtspClient, options: ApiServerOptions) {
    this.client = client
    this.options = options
    this.app = express()
    this.app.use(express.json({ limit: '10mb' }))
    this.setupRoutes()
  }

  private authMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!this.options.apiKey) {
      next()
      return
    }
    const headerKey = req.headers['x-api-key']
    const queryKey = req.query['api_key']
    const key = (typeof headerKey === 'string' ? headerKey : undefined) ??
                (typeof queryKey === 'string' ? queryKey : undefined)
    if (key !== this.options.apiKey) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    next()
  }

  private requireBody(req: Request, res: Response): boolean {
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ error: 'Invalid or missing JSON body' })
      return false
    }
    return true
  }

  private setupRoutes(): void {
    const r = this.app

    // Health
    r.get('/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() })
    })

    // Status
    r.get('/status', this.authMiddleware.bind(this), (_req, res) => {
      const state = this.client.antiBan.getState()
      res.json({
        connected: true,
        health: state.health,
        warmup: state.warmup,
        paused: state.paused,
        messages: state.messages,
      })
    })

    // Send text
    r.post('/send', this.authMiddleware.bind(this), async (req: Request, res: Response) => {
      try {
        if (!this.requireBody(req, res)) return
        const { to, text, quoted, mentions } = req.body
        if (!to || !text) {
          res.status(400).json({ error: 'Missing "to" and/or "text"' })
          return
        }
        const msg = await this.client.sendText(to, text, { quoted, mentions })
        res.json({ success: true, messageId: msg.key.id })
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message })
      }
    })

    // Send image
    r.post('/send/image', this.authMiddleware.bind(this), async (req: Request, res: Response) => {
      try {
        if (!this.requireBody(req, res)) return
        const { to, image, caption } = req.body
        if (!to || !image) {
          res.status(400).json({ error: 'Missing "to" and/or "image"' })
          return
        }
        const msg = await this.client.sendImage(to, image, caption)
        res.json({ success: true, messageId: msg.key.id })
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message })
      }
    })

    // Send video
    r.post('/send/video', this.authMiddleware.bind(this), async (req: Request, res: Response) => {
      try {
        if (!this.requireBody(req, res)) return
        const { to, video, caption } = req.body
        if (!to || !video) {
          res.status(400).json({ error: 'Missing "to" and/or "video"' })
          return
        }
        const msg = await this.client.sendVideo(to, video, caption)
        res.json({ success: true, messageId: msg.key.id })
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message })
      }
    })

    // Send document
    r.post('/send/document', this.authMiddleware.bind(this), async (req: Request, res: Response) => {
      try {
        if (!this.requireBody(req, res)) return
        const { to, document, fileName, mimetype } = req.body
        if (!to || !document || !fileName) {
          res.status(400).json({ error: 'Missing "to", "document", and/or "fileName"' })
          return
        }
        const msg = await this.client.sendDocument(to, document, fileName, mimetype)
        res.json({ success: true, messageId: msg.key.id })
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message })
      }
    })

    // React
    r.post('/react', this.authMiddleware.bind(this), async (req: Request, res: Response) => {
      try {
        if (!this.requireBody(req, res)) return
        const { to, emoji, key } = req.body
        if (!to || !emoji || !key) {
          res.status(400).json({ error: 'Missing "to", "emoji", and/or "key"' })
          return
        }
        await this.client.react(to, emoji, key)
        res.json({ success: true })
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message })
      }
    })

    // Check WhatsApp
    r.get('/check/:phone', this.authMiddleware.bind(this), async (req: Request, res: Response) => {
      try {
        const phone = req.params.phone as string
        const result = await this.client.isOnWhatsApp(phone)
        res.json(result)
      } catch (err: any) {
        res.status(500).json({ error: err.message })
      }
    })

    // Get chats
    r.get('/chats', this.authMiddleware.bind(this), async (_req, res) => {
      try {
        const chats = await this.client.getChats()
        res.json(chats.map(c => ({ id: c.id, name: c.name })))
      } catch (err: any) {
        res.status(500).json({ error: err.message })
      }
    })

    // Anti-ban control
    r.post('/antiban/pause', this.authMiddleware.bind(this), (req: Request, res: Response) => {
      this.client.antiBan.pause(req.body?.reason)
      res.json({ success: true, paused: true })
    })

    r.post('/antiban/resume', this.authMiddleware.bind(this), (_req, res) => {
      this.client.antiBan.resume()
      res.json({ success: true, paused: false })
    })

    r.post('/antiban/reset', this.authMiddleware.bind(this), (_req, res) => {
      this.client.antiBan.reset()
      res.json({ success: true })
    })

    r.get('/antiban/state', this.authMiddleware.bind(this), (_req, res) => {
      res.json(this.client.antiBan.getState())
    })
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.options.port, this.options.host, () => {
        resolve()
      })
      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.options.port} already in use`))
        } else if (err.code === 'EACCES') {
          reject(new Error(`Permission denied for port ${this.options.port}`))
        } else {
          reject(err)
        }
      })
    })
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) console.error('[whtsp] Server close error:', err.message)
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  getApp(): express.Application {
    return this.app
  }
}
