const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure the database directory exists
const dbDir = path.join(__dirname, '../db');
fs.mkdirSync(dbDir, { recursive: true });

// Define database path
const dbPath = path.join(dbDir, 'electrolyte.db');

// Initialize database
const db = new Database(dbPath);

// Create tables
db.prepare(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_number TEXT,
  technician_name TEXT,
  customer_name TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  street TEXT,
  complaint TEXT,
  product_name TEXT,
  wo_status TEXT,
  line_item_status TEXT,
  technician_assigned_date TEXT,
  created_date TEXT,
  end_date TEXT,
  last_reminded_at TEXT,
  resolved_at TEXT,
  days_pending INTEGER DEFAULT 0,
  updated_at TEXT
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS technicians (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  phone TEXT
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS send_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT,
  technician_name TEXT,
  matched_name TEXT,
  phone TEXT,
  case_number TEXT,
  reason TEXT,
  suggestion TEXT,
  type TEXT
)`).run();

module.exports = db;