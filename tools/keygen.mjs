import crypto from 'crypto';
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const SALT = "youtube_monitor_secret_salt_2024";

function generateActivationCode(machineId, days) {
    const payload = `${machineId}-${days}`;
    const hmac = crypto.createHmac('sha256', SALT);
    hmac.update(payload);
    const signature = hmac.digest('hex');
    return `${days}-${signature}`;
}

console.log("\n--- YouTube Monitor Activation Key Generator ---\n");

rl.question('请输入机器码 (Machine ID): ', (machineId) => {
    if (!machineId) {
        console.error("错误: 机器码不能为空");
        rl.close();
        return;
    }
    rl.question('请输入授权天数 (默认 365): ', (daysStr) => {
        const days = daysStr ? parseInt(daysStr, 10) : 365;
        if (isNaN(days)) {
            console.error("错误: 无效的天数");
            rl.close();
            return;
        }

        const activationCode = generateActivationCode(machineId, days);
        console.log("\n-------------------------------------------");
        console.log(`机器码: ${machineId}`);
        console.log(`天数:   ${days}`);
        console.log(`激活码: ${activationCode}`);
        console.log("-------------------------------------------\n");
        rl.close();
    });
});
