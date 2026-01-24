import { invoke } from "@tauri-apps/api/core";



export async function get_machine_id(): Promise<string> {
    try {
        return await invoke<string>('get_machine_id');
    } catch (e) {
        console.error("Machine ID fetch failed:", e);
        // Only alert if we are in production and it's a real error
        if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost')) {
            alert("IPC Error (get_machine_id): " + JSON.stringify(e));
        } else if (process.env.NODE_ENV === 'production') {
            alert("IPC Error (get_machine_id): " + JSON.stringify(e));
        }
        return "UNKNOWN_MACHINE_ID";
    }
}


