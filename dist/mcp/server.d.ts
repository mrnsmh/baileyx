import type { WhtspClient } from '../core/types.js';
export interface McpTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
}
export interface McpServerOptions {
    transport: 'stdio' | 'http';
    port?: number;
}
/**
 * MCP (Model Context Protocol) server for WhatsApp.
 * Exposes WhatsApp operations as AI-callable tools.
 */
export declare class McpServer {
    private client;
    private options;
    private tools;
    constructor(client: WhtspClient, options?: McpServerOptions);
    private defineTools;
    /**
     * Execute a tool call.
     */
    executeTool(name: string, args: Record<string, unknown>): Promise<unknown>;
    /**
     * Get tool definitions (for MCP protocol).
     */
    getTools(): McpTool[];
    /**
     * Start the MCP server (stdio transport).
     */
    start(): Promise<void>;
    private startStdio;
    private startHttp;
    private handleJsonRpc;
}
//# sourceMappingURL=server.d.ts.map