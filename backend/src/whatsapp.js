const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const { generateTasksCard } = require('./imageGenerator');
const { classifyReply } = require('./csvParser');
const db = require('./db');

let qrCodeBase64 = null;
let isReady = false;

// ✅ FIXED CLIENT (Railway-safe)
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: '/tmp/session' // ✅ works on Railway
    }),
    puppeteer: {
        headless: true, // ✅ required (no GUI in Railway)
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
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
    console.log('WhatsApp client ready hai');
});

// DISCONNECT EVENT
client.on('disconnected', () => {
    isReady = false;
    console.log('WhatsApp disconnected');
});

// MESSAGE HANDLER
client.on('message', (msg) => {
    if (msg.from === 'status@broadcast') return;
    if (msg.isStatus) return;

    const phone = msg.from.replace('@c.us', '');
    const body = msg.body;
    const classification = classifyReply(body);

    // ✅ FIX: replies table must exist in db.js
    db.prepare(
        `INSERT INTO replies (phone, reply_text, received_at, classification) VALUES (?, ?, ?, ?)`
    ).run(phone, body, new Date().toISOString(), classification);

    console.log(`Reply from ${phone} [${classification}]: ${body}`);
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
                task.case_number, // ✅ FIXED (was caseNumber)
                new Date().toISOString(),
                'sent'
            );

            db.prepare(`UPDATE tasks SET last_reminded_at = ? WHERE case_number = ?`)
                .run(new Date().toISOString(), task.case_number);
        }

        console.log(`Sent ${tasks.length} tasks to ${technicianName} (${phone})`);
        await new Promise((res) => setTimeout(res, 4000));

    } catch (err) {
        console.error(`Failed to send to ${tasks[0]?.technician_name || 'unknown'}:`, err.message);
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

        console.log(`Escalation sent for case ${task.case_number}`);

    } catch (err) {
        console.error(`Escalation failed for ${task.case_number}:`, err.message);
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