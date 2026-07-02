import { AntiBanConfig } from '../antiban/index.js';
import type { WhtspConfig, WhtspClient } from './types.js';
export interface CreateClientOptions {
    config?: Partial<WhtspConfig>;
    antibanConfig?: AntiBanConfig;
}
export declare function createWhtspClient(opts?: CreateClientOptions): Promise<WhtspClient>;
//# sourceMappingURL=wa-socket.d.ts.map