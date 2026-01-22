import { ask, message } from '@tauri-apps/plugin-dialog';

/**
 * Show a native confirmation dialog
 * @param msg - The message to display
 * @param title - Optional title for the dialog
 * @returns Promise<boolean> - true if user clicked OK/Yes, false if cancelled
 */
export async function show_confirm(msg: string, title: string = '确认'): Promise<boolean> {
    try {
        return await ask(msg, {
            title,
            kind: 'warning',
        });
    } catch (e) {
        console.error('Dialog error:', e);
        // Fallback to browser confirm if Tauri dialog fails
        return window.confirm(msg);
    }
}

/**
 * Show a native alert/message dialog
 * @param msg - The message to display
 * @param title - Optional title for the dialog
 * @param kind - Type of message: 'info', 'warning', or 'error'
 */
export async function show_alert(
    msg: string,
    title: string = '提示',
    kind: 'info' | 'warning' | 'error' = 'info'
): Promise<void> {
    try {
        await message(msg, {
            title,
            kind,
        });
    } catch (e) {
        console.error('Dialog error:', e);
        // Fallback to browser alert if Tauri dialog fails
        window.alert(msg);
    }
}

/**
 * Show a success message
 */
export async function show_success(msg: string, title: string = '成功'): Promise<void> {
    return show_alert(msg, title, 'info');
}

/**
 * Show an error message
 */
export async function show_error(msg: string, title: string = '错误'): Promise<void> {
    return show_alert(msg, title, 'error');
}
