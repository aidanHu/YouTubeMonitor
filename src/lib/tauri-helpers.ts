import { invoke } from '@tauri-apps/api/core';
import { show_error } from './dialogs';

/**
 * 安全调用 Tauri 命令，统一错误处理
 * 
 * @param command - Tauri 命令名称
 * @param args - 命令参数
 * @param options - 可选配置
 * @returns 命令执行结果，失败时返回 null
 */
export async function safeTauriCommand<T>(
    command: string,
    args?: Record<string, any>,
    options?: {
        silent?: boolean;
        onSuccess?: (result: T) => void;
        errorMessage?: string;
    }
): Promise<T | null> {
    try {
        const result = await invoke<T>(command, args);
        options?.onSuccess?.(result);
        return result;
    } catch (e) {
        const errorMsg = options?.errorMessage || `命令执行失败: ${command}`;
        if (!options?.silent) {
            await show_error(`${errorMsg}\n\n${String(e)}`);
        }
        if (process.env.NODE_ENV === 'development') {
            console.error(`[Tauri Command Error] ${command}:`, e);
        }
        return null;
    }
}

/**
 * 批量调用 Tauri 命令
 * 
 * @param commands - 命令数组
 * @returns 所有命令的执行结果
 */
export async function batchTauriCommands<T>(
    commands: Array<{
        command: string;
        args?: Record<string, any>;
    }>
): Promise<Array<T | null>> {
    return Promise.all(
        commands.map(({ command, args }) =>
            safeTauriCommand<T>(command, args, { silent: true })
        )
    );
}
