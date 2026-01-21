const { createHmac } = require('crypto');

// MUST MATCH THE KEY IN src/lib/activation.ts
const SECRET_KEY = "MY_SUPER_SECRET_KEY_2026_YOUTUBE_MONITOR";

// CLI Usage
const args = process.argv.slice(2);
const machineId = args[0];
// Default 365 days (1 year) if not specified
const daysValid = args[1] ? parseInt(args[1]) : 365;

if (!machineId) {
    console.error("Please provide a Machine ID");
    console.log("Usage: node admin-keygen.js <MACHINE_ID> [DAYS_VALID]");
    process.exit(1);
}

function generateActivationCode(machineId, days) {
    // Calculate expiration timestamp (seconds)
    const expiresAt = Math.floor(Date.now() / 1000) + (days * 24 * 60 * 60);
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

// Generate the code
const code = generateActivationCode(machineId, daysValid);

console.log("========================================");
console.log(`Machine ID:       ${machineId}`);
console.log(`Validity:         ${daysValid} days`);
console.log(`Activation Code:  ${code}`);
console.log("========================================");
