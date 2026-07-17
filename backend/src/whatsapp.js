const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const { generateTasksCard } = require('./imageGenerator');
const { classifyReply } = require('./csvParser');
const db = require('./db');

let qrCodeBase64 = null;
let isReady = false;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        headless: false
    }
});

client.on('qr', async (qr) => {
  qrcode.generate(qr, { small: true });
  qrCodeBase64 = await QRCode.toDataURL(qr);
  isReady = false;
  console.log('QR generated');
});

client.on('ready', () => {
  isReady = true;
  qrCodeBase64 = null;
  console.log('WhatsApp client ready hai ');
});

client.on('disconnected', () => {
  isReady = false;
  console.log('WhatsApp disconnected');
});

client.on('message', (msg) => {
  if (msg.from === 'status@broadcast') return; //  can be added as we fiund more bots  ignore status updates
  if (msg.isStatus) return;
  const phone = msg.from.replace('@c.us', '');
  const body = msg.body;
  const classification = classifyReply(body);

  db.prepare(
    `INSERT INTO replies (phone, reply_text, received_at, classification) VALUES (?, ?, ?, ?)`
  ).run(phone, body, new Date().toISOString(), classification);

  console.log(`Reply from ${phone} [${classification}]: ${body}`);
});
async function sendTaskReminders(tasks, phone) {
  try {
    const technicianName = tasks[0].technician_name;
    const imagePath = generateTasksCard(tasks, technicianName);
    const media = MessageMedia.fromFilePath(imagePath);
    const chatId = `91${phone}@c.us`;

   // Inside sendTaskReminders, replace the caption part:
const taskList = tasks.map(t => 
  `Case #${t.case_number || 'N/A'} (${t.city || 'Unknown'}) - ${t.days_pending || 0} days`
).join('\n');

const caption = `Hi ${technicianName}, you have ${tasks.length} pending task(s):\n${taskList}\n\nPlease update your status today. — Electrolyte Solutions`;

    await client.sendMessage(chatId, media, { caption });

    // Log each sent message
    for (const task of tasks) {
      db.prepare(
        `INSERT INTO messages (technician_name, phone, case_number, sent_at, status) VALUES (?, ?, ?, ?, ?)`
      ).run(technicianName, phone, task.caseNumber, new Date().toISOString(), 'sent');
      db.prepare(`UPDATE tasks SET last_reminded_at = ? WHERE case_number = ?`)
        .run(new Date().toISOString(), task.caseNumber);
    }

    console.log(`Sent ${tasks.length} tasks to ${technicianName} (${phone})`);
    await new Promise((res) => setTimeout(res, 4000));
  } catch (err) {
    console.error(`Failed to send to ${tasks[0]?.technicianName || 'unknown'}:`, err.message);
  }
}
// async function sendTaskReminder(task, phone) {
//   try {
//     const imagePath = generateTaskCard(task);
//     const media = MessageMedia.fromFilePath(imagePath);
//     const chatId = `91${phone}@c.us`;

//     await client.sendMessage(chatId, media, {
//       caption: `Hi ${task.technicianName}, your task (Case #${task.caseNumber}) at ${task.city} has been pending for *${task.daysPending} days*. Please update your status today. — Electrolyte Solutions`,
//     });

//     db.prepare(
//       `INSERT INTO messages (technician_name, phone, case_number, sent_at, status) VALUES (?, ?, ?, ?, ?)`
//     ).run(task.technicianName, phone, task.caseNumber, new Date().toISOString(), 'sent');

//     // Update last_reminded_at
//     db.prepare(`UPDATE tasks SET last_reminded_at = ? WHERE case_number = ?`)
//       .run(new Date().toISOString(), task.caseNumber);

//     console.log(`Sent to ${task.technicianName} (${phone}) Bhej diya`);
//     await new Promise((res) => setTimeout(res, 4000));
//   } catch (err) {
//     console.error(`Failed to send to ${task.technicianName}:`, err.message);
//   }
// }

async function sendEscalation(task, supervisorPhone) {
  try {
    const chatId = `91${supervisorPhone}@c.us`;
    await client.sendMessage(chatId,
      `⚠️ *ESCALATION ALERT*\n\nCase #${task.caseNumber} assigned to *${task.technicianName}* has been pending for *${task.daysPending} days*.\n\nCustomer: ${task.customerName}\nLocation: ${task.city}\nIssue: ${task.complaint}\n\nImmediate attention required. — Electrolyte Solutions`
    );

    db.prepare(
      `INSERT INTO escalations (case_number, technician_name, escalated_at, days_pending) VALUES (?, ?, ?, ?)`
    ).run(task.caseNumber, task.technicianName, new Date().toISOString(), task.daysPending);

    console.log(`Escalation sent for case ${task.caseNumber}`);
  } catch (err) {
    console.error(`Escalation failed for ${task.caseNumber}:`, err.message);
  }
}

function getQRCode() { return qrCodeBase64; }
function getStatus() { return isReady; }

module.exports = { client, sendTaskReminders, sendEscalation, getQRCode, getStatus };