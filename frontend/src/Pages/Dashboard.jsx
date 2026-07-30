import { useEffect, useState } from "react";
import axios from "axios";
import {
  BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { useAppContext } from "../context/AppContext";

const API = "https://whatsapp-bot-production-ff4d.up.railway.app/api";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const { refreshTrigger, triggerRefresh } = useAppContext();

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API}/stats`);
      setStats(res.data);
    } catch (err) {
      console.error("Stats fetch error", err);
    }
  };

  const fetchReports = async () => {
    try {
      const r = await axios.get(`${API}/send-reports`);
      setReports(r.data || []);
    } catch (err) {
      console.error('Reports fetch error', err);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const r = await axios.get(`${API}/tech-leaderboard`);
      setLeaderboard(r.data || []);
    } catch (err) {
      console.error('Leaderboard fetch error', err);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchReports();
    fetchLeaderboard();
    const interval = setInterval(() => { fetchStats(); fetchLeaderboard(); fetchReports(); }, 10000);
    return () => clearInterval(interval);
  }, [refreshTrigger]);

  const resetDashboard = async () => {
    if (!confirm("Clear all pending tasks and reset dashboard?")) return;
    await axios.delete(`${API}/tasks`);
    setStats(null);
    triggerRefresh();
  };

  if (!stats) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  const COLORS = ['#f97316', '#22c55e', '#3b82f6', '#ef4444'];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-orange-500">Dashboard</h1>
        <div>
          <button
            onClick={resetDashboard}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium"
          >
            🔄 Reset Dashboard
          </button>
        </div>
      </div>

      {/* Stat Cards – Messages sent today and last 30 days */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Messages Sent Today", value: stats.sentToday || 0, color: "text-blue-400" },
          { label: "Messages Sent (Last 30 days)", value: stats.sentLast30 || 0, color: "text-purple-400" },
        ].map((s) => (
          <div key={s.label} className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <p className="text-slate-400 text-xs">{s.label}</p>
            <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Leaderboard – pending tasks per technician */}
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Technician Leaderboard (Pending Tasks)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={leaderboard.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 10 }}>
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis dataKey="technician_name" type="category" width={180} tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none' }} />
              <Bar dataKey="pending" radius={[4, 4, 0, 0]} fill="#f97316" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Simple skipped/send summary: technician + not-sent count */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Messages Not Sent (by Technician)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-left border-b border-slate-700">
                <th className="pb-2">Technician</th>
                <th className="pb-2">Not Sent</th>
                <th className="pb-2">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r, i) => (
                <tr key={i} className="border-b border-slate-700/50">
                  <td className="py-2">{r.name}</td>
                  <td className="py-2 text-red-400">{r.count}</td>
                  <td className="py-2 text-slate-400 text-xs">{r.last_seen ? new Date(r.last_seen).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}