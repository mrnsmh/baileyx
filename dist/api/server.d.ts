import express from 'express';
import type { WhtspClient } from '../core/types.js';
export interface ApiServerOptions {
    port: number;
    host: string;
    apiKey?: string;
}
export declare class ApiServer {
    private app;
    private server?;
    private client;
    private options;
    constructor(client: WhtspClient, options: ApiServerOptions);
    private authMiddleware;
    private setupRoutes;
    start(): Promise<void>;
    stop(): Promise<void>;
    getApp(): express.Application;
}
//# sourceMappingURL=server.d.ts.map