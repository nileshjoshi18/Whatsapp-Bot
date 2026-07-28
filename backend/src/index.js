require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { client, sendTaskReminders, getQRCode, getStatus } = require('./whatsapp');
const { parseAndUpsertCSV } = require('./csvParser');
const { startScheduler } = require('./scheduler');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: path.join(__dirname, '../data/tmp/') });

try {
  client.initialize();
  console.log("Whatsapp connected ");
  
} catch (err) {
  console.error('WhatsApp client initialization failed:', err.message);
}
// startScheduler();

// Ensure data directories exist
fs.mkdirSync(path.join(__dirname, '../data'), { recursive: true });
fs.mkdirSync(path.join(__dirname, '../data/tmp'), { recursive: true });

async function initializeDataFromCsv() {
  const csvPath = path.join(__dirname, '../data/input.csv');
  if (!fs.existsSync(csvPath)) {
    console.log('No startup CSV found; skipping initial import');
    return;
  }

  try {
    db.prepare('DELETE FROM tasks').run();
    const pendingTasks = await parseAndUpsertCSV(csvPath);
    console.log(`Startup CSV import completed. Pending ('New') tasks loaded: ${pendingTasks.length}`);
  } catch (err) {
    console.error('Startup CSV import error:', err.message);
  }
}

// initializeDataFromCsv();

// QR Code endpoint
app.get('/api/qr', (req, res) => {
  res.json({
    qr: getQRCode(),
    connected: getStatus(),
  });
});

// Upload task CSV – clear existing tasks first
app.post('/api/upload', upload.single('csv'), async (req, res) => {
  const dest = path.join(__dirname, '../data/input.csv');
  try {
    if (fs.existsSync(dest)) {
      fs.unlinkSync(dest);
    }
    fs.copyFileSync(req.file.path, dest);
    fs.unlinkSync(req.file.path);
  } catch (err) {
    console.error('File handling error:', err.message);
    return res.status(500).json({ error: 'Failed to save uploaded file' });
  }

  try {
    // Clear all existing tasks (only keep the new data)
    db.prepare('DELETE FROM tasks').run();
    const tasks = await parseAndUpsertCSV(dest);
    res.json({ success: true, pendingCount: tasks.length });
  } catch (err) {
    console.error('CSV parsing error:', err.message);
    res.status(500).json({ error: 'Failed to parse CSV' });
  }
});

app.get('/api/export-tasks', async (req, res) => {
  try {
    // Fetch all tasks with status 'New' regardless of resolved_at, since the parser may set
    // resolved_at for rows that are still marked as New in the CSV export.
    const tasks = db.prepare(`
      SELECT 
        case_number,
        COALESCE(NULLIF(technician_name, ''), 'Unassigned') AS technician_name,
        customer_name,
        city,
        street,
        zip,
        complaint,
        product_name,
        line_item_status
      FROM tasks 
      WHERE line_item_status = 'New'
      ORDER BY technician_name, case_number ASC
    `).all();

    // Create workbook
    const workbook = new ExcelJS.Workbook();

    // ---------- Sheet 1: Tasks List ----------
    const listSheet = workbook.addWorksheet('Tasks List');
    listSheet.columns = [
      { header: 'Case #', key: 'case_number', width: 15 },
      { header: 'Technician', key: 'technician_name', width: 25 },
      { header: 'Customer', key: 'customer_name', width: 25 },
      { header: 'City', key: 'city', width: 20 },
      { header: 'Street', key: 'street', width: 30 },
      { header: 'Zip', key: 'zip', width: 15 },
      { header: 'Complaint', key: 'complaint', width: 30 },
      { header: 'Product', key: 'product_name', width: 25 },
      { header: 'Status', key: 'line_item_status', width: 15 },
    ];

    tasks.forEach(task => {
      listSheet.addRow({
        case_number: task.case_number || '',
        technician_name: task.technician_name || '',
        customer_name: task.customer_name || '',
        city: task.city || '',
        street: task.street || '',
        zip: task.zip || '',
        complaint: task.complaint || '',
        product_name: task.product_name || '',
        line_item_status: task.line_item_status || '',
      });
    });

    // Style header (warm yellow like the provided image)
    const listHeader = listSheet.getRow(1);
    listHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    listHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD24D' } };

    // ---------- Sheet 2: Day-Wise Summary (Pivot) ----------
    const summarySheet = workbook.addWorksheet('Day-Wise Summary');

    // Build Summary pivot with dynamic day buckets (0 to max days_pending)
    
    // First, find the maximum days_pending value
    const maxDaysRow = db.prepare(`
      SELECT MAX(days_pending) as max_days
      FROM tasks
      WHERE line_item_status = 'New'
    `).get();
    
    const maxDays = maxDaysRow?.max_days || 0;
    const dayBuckets = Array.from({ length: maxDays + 1 }, (_, i) => i);

    // Get technicians with counts per days_pending
    const techRows = db.prepare(`
      SELECT 
        COALESCE(NULLIF(technician_name, ''), 'Unassigned') AS technician_name,
        days_pending,
        COUNT(*) as cnt
      FROM tasks
      WHERE line_item_status = 'New'
      GROUP BY technician_name, days_pending
      ORDER BY technician_name, days_pending
    `).all();

    // Build pivot: technician_name -> day -> count
    const pivot = {};
    const allTechs = [];
    for (const row of techRows) {
      const tech = row.technician_name;
      if (!pivot[tech]) {
        pivot[tech] = {};
        allTechs.push(tech);
      }
      pivot[tech][String(row.days_pending)] = row.cnt;
    }

    // Header: Technician | 0 | 1 | ... | 6 | Total
    const headerRow = ['Technician', ...dayBuckets.map(d => String(d)), 'Grand Total'];
    summarySheet.addRow(headerRow);

    // Add data rows
    let grandTotal = 0;
    const statusTotals = {};
    for (const tech of allTechs) {
      const rowData = [tech];
      let techTotal = 0;
      for (const d of dayBuckets) {
        const cnt = pivot[tech]?.[String(d)] || 0;
        rowData.push(cnt);
        techTotal += cnt;
        statusTotals[d] = (statusTotals[d] || 0) + cnt;
      }
      rowData.push(techTotal);
      grandTotal += techTotal;
      summarySheet.addRow(rowData);
    }

    // Add Grand Total row
    const totalRow = ['Grand Total'];
    for (const d of dayBuckets) {
      totalRow.push(statusTotals[d] || 0);
    }
    totalRow.push(grandTotal);
    summarySheet.addRow(totalRow);

    // Style the summary sheet
    const summaryHeader = summarySheet.getRow(1);
    summaryHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summaryHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf97316' } };

    // Make the Grand Total row bold with grey background
    const lastRowNum = summarySheet.rowCount;
    const grandTotalRow = summarySheet.getRow(lastRowNum);
    grandTotalRow.font = { bold: true };
    grandTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFe2e8f0' } };

    // Set reasonable column widths for summary sheet
    summarySheet.columns = summaryHeader.values.map((h, i) => ({ width: i === 0 ? 30 : 10 }));

    // ---------- Generate file ----------
    // const today = new Date().toISOString().split('T')[0];
    const today = new Date().toISOString();
    const fileName = `pending_tasks_${today}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Export error:', err.message);
    res.status(500).json({ error: 'Failed to generate export' });
  }
});
// Upload phones CSV (bulk technician import)
app.post('/api/upload-phones', upload.single('csv'), (req, res) => {
  const lines = fs.readFileSync(req.file.path, 'utf8').split('\n');
  let count = 0;
  lines.forEach((line, i) => {
    if (i === 0) return;
    const [name, phone] = line.split(',').map(s => s?.trim());
    if (name && phone) {
      db.prepare(`
        INSERT INTO technicians (name, phone) VALUES (?, ?)
        ON CONFLICT(name) DO UPDATE SET phone=excluded.phone
      `).run(name, phone);
      count++;
    }
  });
  fs.unlinkSync(req.file.path);
  res.json({ success: true, imported: count });
});

// Get pending tasks – only 'New' status
app.get('/api/tasks', (req, res) => {
  const tasks = db.prepare(`
    SELECT * FROM tasks 
    WHERE resolved_at IS NULL AND line_item_status = 'New'
    ORDER BY days_pending DESC
  `).all();
  res.json(tasks);
});

// Delete all unresolved tasks (clear)
app.delete('/api/tasks', (req, res) => {
  const info = db.prepare('DELETE FROM tasks WHERE resolved_at IS NULL').run();
  res.json({ success: true, deleted: info.changes });
});

// Debug endpoint to inspect statuses
app.get('/api/debug/statuses', (req, res) => {
  const rows = db.prepare(`
    SELECT line_item_status, COUNT(*) as count
    FROM tasks
    GROUP BY line_item_status
  `).all();
  res.json(rows);
});

// ----- Technician CRUD with Edit & Delete -----
app.post('/api/technicians', (req, res) => {
  const { name, phone } = req.body;
  db.prepare(`
    INSERT INTO technicians (name, phone) VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET phone=excluded.phone
  `).run(name, phone);
  res.json({ success: true });
});

app.get('/api/technicians', (req, res) => {
  res.json(db.prepare('SELECT * FROM technicians').all());
});

app.put('/api/technicians/:id', (req, res) => {
  const { name, phone } = req.body;
  const { id } = req.params;
  db.prepare(`UPDATE technicians SET name = ?, phone = ? WHERE id = ?`).run(name, phone, id);
  res.json({ success: true });
});

app.delete('/api/technicians/:id', (req, res) => {
  const { id } = req.params;
  db.prepare(`DELETE FROM technicians WHERE id = ?`).run(id);
  res.json({ success: true });
});

// Bulk send – group tasks by technician, send one image per technician
app.post('/api/send', async (req, res) => {
  const pendingTasks = db.prepare(`
    SELECT * FROM tasks 
    WHERE resolved_at IS NULL AND line_item_status = 'New'
  `).all();
  const technicians = db.prepare('SELECT * FROM technicians').all();
  // We'll build groups and also capture unmatched/skipped reasons for admin
  const groups = new Map();
  const skipped = [];

  for (const task of pendingTasks) {
    const techName = task.technician_name || '';
    const match = findBestMatchDetailed(techName, technicians);
    if (!match || !match.technician) {
      skipped.push({
        technicianName: techName,
        reason: match?.reason || 'name not found',
        suggestion: match?.suggestion || null,
        case_number: task.case_number
      });
      continue;
    }

    const tech = match.technician;
    // validate phone: simple numeric length check (10 digits expected)
    const phoneDigits = (tech.phone || '').replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      skipped.push({
        technicianName: techName,
        matchedTo: tech.name,
        reason: 'invalid phone make sure it  is 10 digits',
        phone: tech.phone,
        case_number: task.case_number
      });
      continue;
    }
    if (!groups.has(tech.id)) groups.set(tech.id, { ...tech, tasks: [] });
    groups.get(tech.id).tasks.push(task);
  }

  let sent = 0;
  const sendErrors = [];

  for (const [techId, techData] of groups) {
    try {
      await sendTaskReminders(techData.tasks, techData.phone);
      sent++;
    } catch (err) {
      sendErrors.push({ technician: techData.name, reason: `Send failed: ${err.message}` });
    }
  }

  // Persist skipped and sendErrors into send_reports for frontend visibility
  const insertReport = db.prepare(`INSERT INTO send_reports (created_at, technician_name, matched_name, phone, case_number, reason, suggestion, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const now = new Date().toISOString();
  for (const s of skipped) {
    insertReport.run(now, s.technicianName || null, s.matchedTo || s.matched_name || null, s.phone || null, s.case_number || null, s.reason || null, s.suggestion || null, 'skipped');
  }
  for (const e of sendErrors) {
    insertReport.run(now, null, e.technician || null, null, null, e.reason || null, null, 'error');
  }

  res.json({
    success: true,
    sent,
    skipped: skipped.length + sendErrors.length,
    details: { skipped: skipped.slice(0, 50), sendErrors: sendErrors.slice(0, 50) }
  });
});

// Return recent send reports (skipped/errors) for frontend dashboard
app.get('/api/send-reports', (req, res) => {
  // Aggregate by matched_name or technician_name to keep frontend simple
  const rows = db.prepare(`
    SELECT COALESCE(matched_name, technician_name, 'Unknown') as name,
      COUNT(*) as count,
      MAX(created_at) as last_seen
    FROM send_reports
    GROUP BY name
    ORDER BY count DESC
    LIMIT 200
  `).all();
  res.json(rows);
});

// One-off: recover likely-unsent tasks by comparing pending tasks vs messages
app.post('/api/recover-send-reports', (req, res) => {
  try {
    // Find pending tasks (New) that have no message record in the last 7 days
    const rows = db.prepare(`
      SELECT t.case_number, t.technician_name, t.zip, t.city
      FROM tasks t
      WHERE t.resolved_at IS NULL AND t.line_item_status = 'New'
        AND NOT EXISTS (
          SELECT 1 FROM messages m WHERE m.case_number = t.case_number AND m.sent_at >= datetime('now', '-7 days')
        )
    `).all();

    const insert = db.prepare(`INSERT INTO send_reports (created_at, technician_name, matched_name, phone, case_number, reason, suggestion, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const now = new Date().toISOString();
    let inserted = 0;
    for (const r of rows) {
      insert.run(now, r.technician_name || null, null, null, r.case_number || null, 'no message recorded (recovered)', null, 'recovered');
      inserted++;
    }

    res.json({ success: true, recovered: inserted });
  } catch (err) {
    console.error('Recover failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Helper: find best match for technician name
function normalizeName(n) {
  if (!n) return '';
  return n.toString().toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// Returns detailed match info: { technician, reason, suggestion }
function findBestMatchDetailed(name, technicians) {
  const norm = normalizeName(name || '');
  if (!norm) return { technician: null, reason: 'empty name' };

  // exact normalized match
  for (const t of technicians) {
    if (normalizeName(t.name) === norm) return { technician: t };
  }

  // contains match or startsWith
  for (const t of technicians) {
    const tn = normalizeName(t.name);
    if (tn.includes(norm) || norm.includes(tn)) return { technician: t, reason: 'partial match' };
  }

  // fallback: use levenshtein distance to find best candidate
  let best = null;
  let bestScore = Infinity;
  for (const t of technicians) {
    const tn = normalizeName(t.name);
    const dist = levenshtein(norm, tn);
    const rel = dist / Math.max(norm.length, tn.length);
    if (rel < bestScore) {
      bestScore = rel;
      best = t;
    }
  }

  // If relative distance is small enough, suggest as typo; threshold 0.4
  if (best && bestScore <= 0.4) {
    return { technician: best, reason: 'possible typo', suggestion: best.name };
  }

  return { technician: null, reason: 'no good match', suggestion: best?.name || null };
}

// Dashboard stats (unchanged, but now pending only from current data)
app.get('/api/stats', (req, res) => {
  // Only return messages sent today and messages sent in last 30 days per request
  const sentToday = db.prepare(`
    SELECT COUNT(*) as count FROM messages WHERE date(sent_at) = date(?)
  `).get(new Date().toISOString()).count;

  const sentLast30 = db.prepare(`
    SELECT COUNT(*) as count FROM messages WHERE sent_at >= datetime(?, '-30 days')
  `).get(new Date().toISOString()).count;

  res.json({ sentToday, sentLast30 });
});

app.listen(process.env.PORT || 5000, () => {
  console.log(`Backend running on port ${process.env.PORT || 5000}`);
});

// Technician leaderboard: pending task counts per technician
app.get('/api/tech-leaderboard', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT technician_name, COUNT(*) as pending
      FROM tasks
      WHERE resolved_at IS NULL AND line_item_status = 'New'
      GROUP BY technician_name
      ORDER BY pending DESC
    `).all();
    res.json(rows);
  } catch (err) {
    console.error('Leaderboard error:', err.message);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});