import { invoke } from "@tauri-apps/api/core";

// ⚠️ SECRET KEY: KEEP THIS SAFE AND CONSISTENT
// If you change this, all existing activation codes will become invalid.
const SECRET_KEY = "MY_SUPER_SECRET_KEY_2026_YOUTUBE_MONITOR";

export async function get_machine_id(): Promise<string> {
    try {
        return await invoke<string>('get_machine_id');
    } catch (e) {
        console.error("Machine ID fetch failed:", e);
        return "UNKNOWN_MACHINE_ID";
    }
}

// Generate a code with embedded expiration
// Format: TTTTTT-TTSSSS-SSSSSS-SSSSSS (24 chars)
// T = Timestamp Hex (8 chars), S = Signature Hex (16 chars)
// This part is logic-only and safe for browsers/webview.
// Note: We use a simplified signature logic if we don't have crypto.subtle easily, 
// but for the frontend validation we can use a basic hash if needed or just keep it as is if it's only for "mocking" or simple checks.
// Actually, crypto.subtle exists in modern browsers.
async function hashString(message: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(message + SECRET_KEY);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function generateActivationCode(machineId: string, daysValid: number): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + (daysValid * 24 * 60 * 60);
    const expiresHex = expiresAt.toString(16).toUpperCase().padStart(8, '0');

    const fullSignature = await hashString(`${machineId}:${expiresHex}`);
    const signatureFrag = fullSignature.substring(0, 16);

    const raw = expiresHex + signatureFrag;
    return `${raw.substring(0, 6)}-${raw.substring(6, 12)}-${raw.substring(12, 18)}-${raw.substring(18, 24)}`;
}

export async function validateActivation(inputCode: string, machineId: string): Promise<{ valid: boolean, expiresAt?: Date, message?: string }> {
    if (!inputCode) return { valid: false, message: "No code provided" };

    const cleanCode = inputCode.replace(/[^A-F0-9]/g, '').toUpperCase();
    if (cleanCode.length !== 24) return { valid: false, message: "Invalid code format" };

    const expiresHex = cleanCode.substring(0, 8);
    const signatureFrag = cleanCode.substring(8, 24);

    const expectedSig = (await hashString(`${machineId}:${expiresHex}`)).substring(0, 16);

    if (signatureFrag !== expectedSig) {
        return { valid: false, message: "Invalid signature" };
    }

    const expiresTimestamp = parseInt(expiresHex, 16);
    const nowTimestamp = Math.floor(Date.now() / 1000);

    if (nowTimestamp > expiresTimestamp) {
        return { valid: false, message: "Activation code expired", expiresAt: new Date(expiresTimestamp * 1000) };
    }

    return { valid: true, expiresAt: new Date(expiresTimestamp * 1000) };
}
