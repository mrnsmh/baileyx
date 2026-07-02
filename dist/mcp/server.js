/**
 * MCP (Model Context Protocol) server for WhatsApp.
 * Exposes WhatsApp operations as AI-callable tools.
 */
export class McpServer {
    client;
    options;
    tools;
    constructor(client, options = { transport: 'stdio' }) {
        this.client = client;
        this.options = options;
        this.tools = this.defineTools();
    }
    defineTools() {
        return [
            {
                name: 'whtsp_send_text',
                description: 'Send a text message to a WhatsApp contact or group',
                inputSchema: {
                    type: 'object',
                    properties: {
                        to: { type: 'string', description: 'Phone number or JID (e.g. 212600000000@s.whatsapp.net)' },
                        text: { type: 'string', description: 'Message text to send' },
                    },
                    required: ['to', 'text'],
                },
            },
            {
                name: 'whtsp_send_image',
                description: 'Send an image with optional caption',
                inputSchema: {
                    type: 'object',
                    properties: {
                        to: { type: 'string', description: 'Phone number or JID' },
                        image: { type: 'string', description: 'Image URL or base64 data URL' },
                        caption: { type: 'string', description: 'Optional caption text' },
                    },
                    required: ['to', 'image'],
                },
            },
            {
                name: 'whtsp_send_document',
                description: 'Send a document/file',
                inputSchema: {
                    type: 'object',
                    properties: {
                        to: { type: 'string', description: 'Phone number or JID' },
                        document: { type: 'string', description: 'Document URL or base64 data URL' },
                        fileName: { type: 'string', description: 'File name' },
                        mimetype: { type: 'string', description: 'MIME type (default: application/pdf)' },
                    },
                    required: ['to', 'document', 'fileName'],
                },
            },
            {
                name: 'whtsp_react',
                description: 'React to a message with an emoji',
                inputSchema: {
                    type: 'object',
                    properties: {
                        to: { type: 'string', description: 'Chat JID' },
                        emoji: { type: 'string', description: 'Emoji to react with' },
                        messageId: { type: 'string', description: 'ID of the message to react to' },
                    },
                    required: ['to', 'emoji', 'messageId'],
                },
            },
            {
                name: 'whtsp_check_number',
                description: 'Check if a phone number exists on WhatsApp',
                inputSchema: {
                    type: 'object',
                    properties: {
                        phone: { type: 'string', description: 'Phone number to check (with country code)' },
                    },
                    required: ['phone'],
                },
            },
            {
                name: 'whtsp_get_status',
                description: 'Get the current connection status and anti-ban health',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'whtsp_get_chats',
                description: 'List recent chats',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'whtsp_pause',
                description: 'Pause all outgoing messages (anti-ban safety)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        reason: { type: 'string', description: 'Optional reason for pausing' },
                    },
                },
            },
            {
                name: 'whtsp_resume',
                description: 'Resume sending messages after pause',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'whtsp_list_tools',
                description: 'List all available WhatsApp tools',
                inputSchema: { type: 'object', properties: {} },
            },
        ];
    }
    /**
     * Execute a tool call.
     */
    async executeTool(name, args) {
        switch (name) {
            case 'whtsp_send_text': {
                const { to, text } = args;
                const msg = await this.client.sendText(to, text);
                return { success: true, messageId: msg.key.id };
            }
            case 'whtsp_send_image': {
                const { to, image, caption } = args;
                const msg = await this.client.sendImage(to, image, caption);
                return { success: true, messageId: msg.key.id };
            }
            case 'whtsp_send_document': {
                const { to, document, fileName, mimetype } = args;
                const msg = await this.client.sendDocument(to, document, fileName, mimetype);
                return { success: true, messageId: msg.key.id };
            }
            case 'whtsp_react': {
                const { to, emoji, messageId } = args;
                await this.client.react(to, emoji, { id: messageId, remoteJid: to });
                return { success: true };
            }
            case 'whtsp_check_number': {
                const { phone } = args;
                return await this.client.isOnWhatsApp(phone);
            }
            case 'whtsp_get_status': {
                return this.client.antiBan.getState();
            }
            case 'whtsp_get_chats': {
                return await this.client.getChats();
            }
            case 'whtsp_pause': {
                const { reason } = args;
                this.client.antiBan.pause(reason);
                return { success: true, paused: true };
            }
            case 'whtsp_resume': {
                this.client.antiBan.resume();
                return { success: true, paused: false };
            }
            case 'whtsp_list_tools': {
                return this.tools.map(t => ({ name: t.name, description: t.description }));
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    /**
     * Get tool definitions (for MCP protocol).
     */
    getTools() {
        return this.tools;
    }
    /**
     * Start the MCP server (stdio transport).
     */
    async start() {
        if (this.options.transport === 'stdio') {
            await this.startStdio();
        }
        else {
            await this.startHttp();
        }
    }
    async startStdio() {
        const stdin = process.stdin;
        const stdout = process.stdout;
        stdin.setEncoding('utf-8');
        stdin.resume();
        let buffer = '';
        stdin.on('data', async (chunk) => {
            buffer += chunk;
            // Try to parse complete JSON-RPC messages
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (!line.trim())
                    continue;
                try {
                    const request = JSON.parse(line);
                    const response = await this.handleJsonRpc(request);
                    stdout.write(JSON.stringify(response) + '\n');
                }
                catch {
                    // Ignore parse errors
                }
            }
        });
    }
    async startHttp() {
        const express = (await import('express')).default;
        const app = express();
        app.use(express.json());
        app.post('/mcp', async (req, res) => {
            try {
                const response = await this.handleJsonRpc(req.body);
                res.json(response);
            }
            catch (err) {
                res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: err.message } });
            }
        });
        app.get('/mcp/tools', (_req, res) => {
            res.json(this.tools);
        });
        const port = this.options.port ?? 3011;
        app.listen(port, () => {
            console.log(`MCP server listening on port ${port}`);
        });
    }
    async handleJsonRpc(request) {
        const { id, method, params } = request;
        if (method === 'initialize') {
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'whtsp', version: '0.1.0' },
                },
            };
        }
        if (method === 'tools/list') {
            return {
                jsonrpc: '2.0',
                id,
                result: { tools: this.tools },
            };
        }
        if (method === 'tools/call') {
            const { name, arguments: args } = params;
            try {
                const result = await this.executeTool(name, args ?? {});
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                    },
                };
            }
            catch (err) {
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [{ type: 'text', text: `Error: ${err.message}` }],
                        isError: true,
                    },
                };
            }
        }
        return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
}
//# sourceMappingURL=server.js.map