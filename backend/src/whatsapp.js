const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const puppeteer = require('puppeteer-core'); // ✅ IMPORTANT
const fs = require('fs');
const { execSync } = require('child_process');
const { generateTasksCard } = require('./imageGenerator');
const { classifyReply } = require('./csvParser');
const db = require('./db');

let qrCodeBase64 = null;
let isReady = false;

// ✅ FIXED: don't trust a single hardcoded path — different build systems
// (Nixpacks vs Dockerfile vs apt) put Chromium in different places, and the
// wrong guess crashes the whole process on startup. Instead, check the env
// var first, then `which`, then a list of common install locations.
function resolveChromiumPath() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    try {
        const which = execSync('which chromium chromium-browser google-chrome-stable google-chrome 2>/dev/null')
            .toString()
            .split('\n')[0]
            .trim();
        if (which) return which;
    } catch (_) {
        // `which` found nothing on any of those names — fall through to manual list
    }

    const candidates = [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/root/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome'
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }

    console.error(
        'No Chromium/Chrome binary found on this system. ' +
        'Set PUPPETEER_EXECUTABLE_PATH, or make sure your build installs one (see nixpacks.toml).'
    );
    return process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium'; // last resort, will surface a clear error
}

const resolvedExecutablePath = resolveChromiumPath();
console.log(`Using Chromium executable: ${resolvedExecutablePath}`);

// ✅ FIXED CLIENT (NO CRASH)
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: '/tmp/session'
    }),
    puppeteer: {
        executablePath: resolvedExecutablePath,
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
            '--single-process'
        ]
    }
});

// QR EVENT
client.on('qr', async (qr) => {
    qrcode.generate(qr, { small: true });
    qrCodeBase64 = await QRCode.toDataURL(qr);
    isReady = false;
    console.log('QR generated');
});

// READY EVENT
client.on('ready', () => {
    isReady = true;
    qrCodeBase64 = null;
    console.log('WhatsApp client ready');
});

// DISCONNECT
client.on('disconnected', () => {
    isReady = false;
    console.log('WhatsApp disconnected');
});

// MESSAGE HANDLER
client.on('message', (msg) => {
    if (msg.from === 'status@broadcast') return;
    if (msg.isStatus) return;

    // ✅ FIXED: this handler used to insert with no try/catch — any DB error
    // (e.g. missing table) threw uncaught and crashed the entire process.
    try {
        const phone = msg.from.replace('@c.us', '');
        const body = msg.body;
        const classification = classifyReply(body);

        db.prepare(
            `INSERT INTO replies (phone, reply_text, received_at, classification) VALUES (?, ?, ?, ?)`
        ).run(phone, body, new Date().toISOString(), classification);

        console.log(`Reply from ${phone} [${classification}]: ${body}`);
    } catch (err) {
        console.error('Failed to handle incoming message:', err.message);
    }
});

// SEND TASK REMINDERS
async function sendTaskReminders(tasks, phone) {
    try {
        const technicianName = tasks[0].technician_name;
        const imagePath = generateTasksCard(tasks, technicianName);
        const media = MessageMedia.fromFilePath(imagePath);
        const chatId = `91${phone}@c.us`;

        const taskList = tasks.map(t =>
            `Case #${t.case_number || 'N/A'} (${t.city || 'Unknown'}) - ${t.days_pending || 0} days`
        ).join('\n');

        const caption = `Hi ${technicianName}, you have ${tasks.length} pending task(s):\n${taskList}\n\nPlease update your status today. — Electrolyte Solutions`;

        await client.sendMessage(chatId, media, { caption });

        for (const task of tasks) {
            db.prepare(
                `INSERT INTO messages (technician_name, phone, case_number, sent_at, status) VALUES (?, ?, ?, ?, ?)`
            ).run(
                technicianName,
                phone,
                task.case_number,
                new Date().toISOString(),
                'sent'
            );

            db.prepare(`UPDATE tasks SET last_reminded_at = ? WHERE case_number = ?`)
                .run(new Date().toISOString(), task.case_number);
        }

        console.log(`Sent ${tasks.length} tasks to ${technicianName}`);
        await new Promise((res) => setTimeout(res, 4000));

    } catch (err) {
        console.error(`Failed to send:`, err.message);
    }
}

// ESCALATION
async function sendEscalation(task, supervisorPhone) {
    try {
        const chatId = `91${supervisorPhone}@c.us`;

        await client.sendMessage(
            chatId,
            `⚠️ *ESCALATION ALERT*\n\nCase #${task.case_number} assigned to *${task.technician_name}* has been pending for *${task.days_pending} days*.\n\nCustomer: ${task.customer_name}\nLocation: ${task.city}\nIssue: ${task.complaint}\n\nImmediate attention required. — Electrolyte Solutions`
        );

        db.prepare(
            `INSERT INTO escalations (case_number, technician_name, escalated_at, days_pending) VALUES (?, ?, ?, ?)`
        ).run(
            task.case_number,
            task.technician_name,
            new Date().toISOString(),
            task.days_pending
        );

        console.log(`Escalation sent`);

    } catch (err) {
        console.error(`Escalation failed:`, err.message);
    }
}

// HELPERS
function getQRCode() {
    return qrCodeBase64;
}

function getStatus() {
    return isReady;
}

module.exports = {
    client,
    sendTaskReminders,
    sendEscalation,
    getQRCode,
    getStatus
};