const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function generateTasksCard(tasks, technicianName) {
  const safeName = technicianName || 'Technician';

  // Columns matching the attached image: Case #, TAT, Street, Customer, Zip Code, Complaint, LineItem Status
  const cols = [
    { key: 'case_number', label: 'Case #', width: 120 },
    { key: 'days_pending', label: 'TAT', width: 70 },
    { key: 'street', label: 'Street', width: 320 },
    { key: 'customer_name', label: 'Customer', width: 200 },
    { key: 'zip', label: 'Zip Code', width: 100 },
    { key: 'complaint', label: 'Complaint', width: 240 },
    { key: 'line_item_status', label: 'LineItem Status', width: 130 },
  ];

  const margin = 24;
  const padding = 10;
  const rowHeight = 44;
  const headerHeight = 48;
  const tableWidth = cols.reduce((s, c) => s + c.width, 0) + padding * 2;
  const canvasWidth = tableWidth + margin * 2 + 2;

  const totalRows = tasks.length;
  const tableHeight = headerHeight + totalRows * rowHeight + 10;
  const titleHeight = 80;
  const footerHeight = 40;
  const canvasHeight = titleHeight + tableHeight + footerHeight + 30;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Title (left aligned like sample)
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(`Pending Tasks for ${safeName}`, margin + 6, 48);

  ctx.fillStyle = '#475569';
  ctx.font = '16px sans-serif';
  ctx.fillText(`Total: ${tasks.length} task(s)`, margin + 8, 72);

  let y = titleHeight;

  // ---- Table header: yellow bar like sample ----
  ctx.fillStyle = '#ffd24d'; // warm yellow
  ctx.fillRect(margin, y, tableWidth, headerHeight);
  ctx.strokeStyle = '#dbae2b';
  ctx.lineWidth = 2;
  ctx.strokeRect(margin, y, tableWidth, headerHeight);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 15px sans-serif';
  let x = margin + padding;
  for (const col of cols) {
    ctx.fillText(col.label, x, y + 32);
    x += col.width;
  }
  y += headerHeight;

  // ---- Table rows ----
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const isEven = i % 2 === 0;
    ctx.fillStyle = isEven ? '#fffef8' : '#ffffff'; // pale alternate
    ctx.fillRect(margin, y, tableWidth, rowHeight);
    ctx.strokeStyle = '#e6d8b0';
    ctx.lineWidth = 1;
    ctx.strokeRect(margin, y, tableWidth, rowHeight);

    ctx.fillStyle = '#0f172a';
    ctx.font = '14px sans-serif';
    let xPos = margin + padding;
    for (const col of cols) {
      let value = (task[col.key] || '') + '';
      if (value.length > 40) {
        ctx.font = '13px sans-serif';
      } else {
        ctx.font = '14px sans-serif';
      }
      ctx.fillText(value, xPos, y + 30);
      xPos += col.width;
    }
    y += rowHeight;
  }

  // ---- Footer ----
  ctx.fillStyle = '#94a3b8';
  ctx.font = '13px sans-serif';
  ctx.fillText('Electrolyte Solutions — Automated Reminder', margin + 6, canvasHeight - 12);

  const dir = path.join(__dirname, '../generated-images');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const fileName = `tasks_${safeName.replace(/\s+/g, '_')}_${Date.now()}.png`;
  const filePath = path.join(dir, fileName);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filePath, buffer);

  return filePath;
}

module.exports = { generateTasksCard };