import { execSync } from 'child_process';
import { platform } from 'os';
import { createHmac } from 'crypto';

// ⚠️ SECRET KEY: KEEP THIS SAFE AND CONSISTENT
// If you change this, all existing activation codes will become invalid.
const SECRET_KEY = "MY_SUPER_SECRET_KEY_2026_YOUTUBE_MONITOR";

export function getMachineId(): string {
    // 1. Production: Electron injects this ID
    if (process.env.MACHINE_ID) {
        return process.env.MACHINE_ID;
    }

    // 2. Dev / Fallback: Calculate manually
    try {
        const plat = platform();
        if (plat === 'darwin') {
            const output = execSync('ioreg -rd1 -c IOPlatformExpertDevice', { encoding: 'utf8' });
            const match = output.match(/"IOPlatformUUID" = "(.+)"/);
            if (match) return match[1];
        } else if (plat === 'win32') {
            const output = execSync('REG QUERY HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', { encoding: 'utf8' });
            const match = output.match(/REG_SZ\s+(.*)/);
            if (match) return match[1].trim();
        } else if (plat === 'linux') {
            try {
                return execSync('cat /var/lib/dbus/machine-id', { encoding: 'utf8' }).trim();
            } catch {
                return execSync('cat /etc/machine-id', { encoding: 'utf8' }).trim();
            }
        }
    } catch (e) {
        console.error("Machine ID Manual fallback failed:", e);
    }

    return "UNKNOWN_MACHINE_ID";
}

// Generate a code with embedded expiration
// Format: TTTTTT-TTSSSS-SSSSSS-SSSSSS (24 chars)
// T = Timestamp Hex (8 chars), S = Signature Hex (16 chars)
export function generateActivationCode(machineId: string, daysValid: number): string {
    // Calculate expiration timestamp (seconds)
    const expiresAt = Math.floor(Date.now() / 1000) + (daysValid * 24 * 60 * 60);
    const expiresHex = expiresAt.toString(16).toUpperCase().padStart(8, '0'); // 8 chars

    // Sign the machineId + expiration
    const payload = `${machineId}:${expiresHex}`;
    const hmac = createHmac('sha256', SECRET_KEY);
    hmac.update(payload);
    const fullSignature = hmac.digest('hex').toUpperCase();
    const signatureFrag = fullSignature.substring(0, 16); // 16 chars

    // Combine: 8 chars time + 16 chars sig = 24 chars
    const raw = expiresHex + signatureFrag;

    // Format: XXXXXX-XXXXXX-XXXXXX-XXXXXX
    return `${raw.substring(0, 6)}-${raw.substring(6, 12)}-${raw.substring(12, 18)}-${raw.substring(18, 24)}`;
}

export function validateActivation(inputCode: string, machineId: string): { valid: boolean, expiresAt?: Date, message?: string } {
    if (!inputCode) return { valid: false, message: "No code provided" };

    // Remove dashes and cleanup
    const cleanCode = inputCode.replace(/[^A-F0-9]/g, '').toUpperCase();
    if (cleanCode.length !== 24) return { valid: false, message: "Invalid code format" };

    // Extract parts
    const expiresHex = cleanCode.substring(0, 8);
    const signatureFrag = cleanCode.substring(8, 24);

    // 1. Verify Signature
    const payload = `${machineId}:${expiresHex}`;
    const hmac = createHmac('sha256', SECRET_KEY);
    hmac.update(payload);
    const expectedSig = hmac.digest('hex').toUpperCase().substring(0, 16);

    if (signatureFrag !== expectedSig) {
        return { valid: false, message: "Invalid signature" };
    }

    // 2. Verify Expiration
    const expiresTimestamp = parseInt(expiresHex, 16);
    const nowTimestamp = Math.floor(Date.now() / 1000);

    if (nowTimestamp > expiresTimestamp) {
        return { valid: false, message: "Activation code expired", expiresAt: new Date(expiresTimestamp * 1000) };
    }

    return { valid: true, expiresAt: new Date(expiresTimestamp * 1000) };
}
