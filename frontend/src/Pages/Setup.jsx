import { useEffect, useState } from "react";
import axios from "axios";

const API = "https://whatsapp-bot-production-ff4d.up.railway.app";

export default function Setup() {
  const [qr, setQr] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await axios.get(`${API}/qr`);
        setConnected(res.data.connected);
        setQr(res.data.qr);
      } catch (e) {}
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-md mx-auto text-center space-y-6">
      <h1 className="text-2xl font-bold text-orange-500">WhatsApp Setup</h1>

      {connected ? (
        <div className="bg-green-500/20 border border-green-500 rounded-xl p-8">
          <p className="text-green-400 text-4xl mb-2">✅</p>
          <p className="text-green-400 font-semibold text-lg">WhatsApp Connected</p>
          <p className="text-slate-400 text-sm mt-2">Bot is active and ready to send messages</p>
        </div>
      ) : qr ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
          <p className="text-slate-400 text-sm">Open WhatsApp → Linked Devices → Link a Device → Scan this QR</p>
          <img src={qr} alt="QR Code" className="mx-auto rounded-lg w-64 h-64" />
          <div className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
            <p className="text-orange-400 text-sm">Waiting for scan...</p>
          </div>
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8">
          <p className="text-slate-400 text-sm">Starting WhatsApp client...</p>
          <div className="mt-4 w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      )}
    </div>
  );
}