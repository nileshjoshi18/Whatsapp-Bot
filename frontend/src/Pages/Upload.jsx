import { useState, useEffect } from "react";
import axios from "axios";
import { useAppContext } from "../context/AppContext";

const API = "whatsapp-bot-production-ff4d.up.railway.app/api";

export default function Upload() {
  const { tasks, setTasks, technicians, setTechnicians, triggerRefresh } = useAppContext();
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Fetch technicians once on mount
  useEffect(() => {
    const fetchTechs = async () => {
      try {
        const res = await axios.get(`${API}/technicians`);
        setTechnicians(res.data);
      } catch (err) {
        console.error("Failed to fetch technicians", err);
      }
    };
    fetchTechs();
  }, []); // only once

  const handleUpload = async () => {
    if (!file) return;
    const form = new FormData();
    form.append("csv", file);
    await axios.post(`${API}/upload`, form);
    const res = await axios.get(`${API}/tasks`);
    setTasks(res.data);
    setStatus(`${res.data.length} pending tasks loaded`);
    triggerRefresh(); // refresh dashboard stats
  };

  const handleBulkSend = async () => {
    if (tasks.length === 0) {
      setStatus("⚠️ No tasks to send. Load a CSV first.");
      return;
    }
    const hasPhone = technicians.some(t => t.phone && t.phone.trim() !== "");
    if (!hasPhone) {
      setStatus("❌ No technician has a phone number. Add phone numbers in Technicians tab.");
      return;
    }
    setSending(true);
    try {
      const res = await axios.post(`${API}/send`);
      const { sent, skipped, details } = res.data;
      let msg = `✅ Sent ${sent} reminder(s).`;
      if (skipped > 0) {
        msg += ` ⚠️ ${skipped} task(s) skipped.`;
        if (details && details.length) {
          const reasons = details.map(d => `Case ${d.caseNumber}: ${d.reason}`).join('; ');
          msg += ` (${reasons}${skipped > details.length ? ` and ${skipped - details.length} more...` : ''})`;
        }
      }
      setStatus(msg);
      triggerRefresh(); // refresh dashboard after sending
    } catch (err) {
      setStatus("❌ Error sending reminders: " + err.message);
    }
    setSending(false);
  };

  const clearTasks = async () => {
    if (!confirm("Delete all pending tasks? This cannot be undone.")) return;
    await axios.delete(`${API}/tasks`);
    setTasks([]);
    setStatus("🧹 All pending tasks cleared");
    triggerRefresh();
  };

  const hasPhone = technicians.some(t => t.phone && t.phone.trim() !== "");
// const exportTasks = async () => {
//   try {
//     const response = await axios.get(`${API}/export-tasks`, {
//       responseType: 'blob', // Important: receive as binary data
//     });

//     // Create a download link
//     const url = window.URL.createObjectURL(new Blob([response.data]));
//     const link = document.createElement('a');
//     link.href = url;
//     // Extract filename from Content-Disposition header if available
//     const contentDisposition = response.headers['content-disposition'];
//     let filename = 'pending_tasks.xlsx';
//     if (contentDisposition) {
//       const match = contentDisposition.match(/filename="(.+)"/);
//       if (match) filename = match[1];
//     }
//     link.setAttribute('download', filename);
//     document.body.appendChild(link);
//     link.click();
//     link.remove();
//     window.URL.revokeObjectURL(url);
//   } catch (err) {
//     setStatus('❌ Failed to export tasks: ' + err.message);
//   }
// };
const exportTasks = async () => {
  try {
    const response = await axios.get(`${API}/export-tasks`, {
      responseType: 'blob',
    });

    // Generate filename with current date
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `pending_tasks_${today}.xlsx`;

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    setStatus('❌ Failed to export tasks: ' + err.message);
  }
};

return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-orange-500">Upload & Send</h1>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); setFile(e.dataTransfer.files[0]); }}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
          dragOver ? "border-orange-500 bg-orange-500/10" : "border-slate-600 hover:border-orange-400"
        }`}
      >
        <p className="text-slate-400 mb-3">Drag & drop CSV here or</p>
        <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} className="hidden" id="fileInput" />
        <label htmlFor="fileInput" className="cursor-pointer bg-orange-500 px-4 py-2 rounded-lg text-sm font-medium">
          Browse File
        </label>
        {file && <p className="mt-3 text-green-400 text-sm">{file.name} selected</p>}
      </div>

      {/* <div className="flex gap-4 flex-wrap">
        <button onClick={handleUpload} className="bg-slate-700 hover:bg-slate-600 px-6 py-2 rounded-lg font-medium">
          Load Tasks
        </button>
        <button
          onClick={handleBulkSend}
          disabled={sending || tasks.length === 0 || !hasPhone}
          className={`bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-6 py-2 rounded-lg font-medium`}
        >
          {sending ? "Sending..." : ` Bulk Send (${tasks.length})`}
        </button>
        <button
          onClick={clearTasks}
          className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg font-medium"
        >
          🗑️ Clear Tasks
        </button>
      </div> */}
      <div className="flex gap-4 flex-wrap">
  <button onClick={handleUpload} className="bg-slate-700 hover:bg-slate-600 px-6 py-2 rounded-lg font-medium">
    Load Tasks
  </button>
  <button
    onClick={handleBulkSend}
    disabled={sending || tasks.length === 0 || !hasPhone}
    className={`bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-6 py-2 rounded-lg font-medium`}
  >
    {sending ? "Sending..." : ` Bulk Send (${tasks.length})`}
  </button>
  <button
    onClick={clearTasks}
    className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg font-medium"
  >
    🗑️ Clear Tasks
  </button>
  <button
    onClick={exportTasks}
    disabled={tasks.length === 0}
    className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-6 py-2 rounded-lg font-medium"
  >
    📥 Export Tasks
  </button>
</div>

      {status && <p className={`text-sm ${status.includes("❌") ? "text-red-400" : "text-green-400"}`}>{status}</p>}

      {tasks.length > 0 && !hasPhone && (
        <p className="text-yellow-400 text-sm">⚠️ No technician has a phone number. Add phones in Technicians tab to send reminders.</p>
      )}

      {/* Tasks Table */}
      {tasks.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-slate-400">
              <tr>
                {["Case #", "Technician", "Customer", "City", "Complaint", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map((t, i) => (
                <tr key={i} className="border-t border-slate-700 hover:bg-slate-800/50">
                  <td className="px-4 py-3 text-orange-400">{t.case_number}</td>
                  <td className="px-4 py-3">{t.technician_name}</td>
                  <td className="px-4 py-3">{t.customer_name}</td>
                  <td className="px-4 py-3">{t.city}</td>
                  <td className="px-4 py-3">{t.complaint}</td>
                  <td className="px-4 py-3">
                    <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded text-xs">
                      {t.line_item_status || t.wo_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}