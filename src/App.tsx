import React, { useState, useEffect } from 'react';
import { Bot, LogOut, Settings, Smartphone, Activity, Shield, Globe, Plus, Phone } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI } from '@google/genai';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Session {
  id: string;
  status: 'disconnected' | 'connecting' | 'connected';
  phoneNumber: string;
}

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [pairingSessionId, setPairingSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [config, setConfig] = useState({ prefix: '!', mode: 'public' });
  const [savingConfig, setSavingConfig] = useState(false);

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return;
      const data = await res.json();
      setSessions(data);
      
      if (pairingSessionId) {
        const session = data.find((s: Session) => s.id === pairingSessionId);
        if (session && session.status === 'connected') {
          setPairingCode('');
          setPairingSessionId('');
          setPhoneNumber('');
        }
      }
    } catch (err) {
      // Silently ignore
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return;
      const data = await res.json();
      setConfig(data);
    } catch (err) {
      // Silently ignore
    }
  };

  const pollAITasks = async () => {
    try {
      const res = await fetch('/api/ai-tasks');
      if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return;
      const tasks = await res.json();
      
      for (const task of tasks) {
        try {
          const ai = new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '' });
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: task.prompt,
          });
          
          await fetch(`/api/ai-tasks/${task.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result: response.text }),
          });
        } catch (e: any) {
          console.error('AI Task Error:', e);
          await fetch(`/api/ai-tasks/${task.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: e.message }),
          });
        }
      }
    } catch (err) {
      // Silently ignore
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchConfig();
    const interval = setInterval(() => {
      fetchSessions();
      pollAITasks();
    }, 3000);
    return () => clearInterval(interval);
  }, [pairingSessionId]);

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setPairingCode('');

    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      if (!cleanPhone) {
        throw new Error('Please enter a valid phone number');
      }

      const res = await fetch('/api/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: cleanPhone }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to request pairing code');
      
      setPairingCode(data.code);
      setPairingSessionId(data.sessionId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async (sessionId: string) => {
    try {
      await fetch('/api/logout', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      fetchSessions();
    } catch (err) {
      console.error('Failed to logout', err);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
    } catch (err) {
      console.error('Failed to save config', err);
    } finally {
      setSavingConfig(false);
    }
  };

  const connectedCount = sessions.filter(s => s.status === 'connected').length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800/50 bg-zinc-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <Bot className="w-5 h-5 text-emerald-400" />
            </div>
            <h1 className="font-semibold tracking-tight text-lg">Vortex-MD Panel</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border",
              connectedCount > 0 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
              "bg-zinc-800/50 text-zinc-400 border-zinc-700/50"
            )}>
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                connectedCount > 0 ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
              )} />
              {connectedCount > 0 ? `${connectedCount} Connected` : 'Disconnected'}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-[1fr_340px] gap-8 items-start">
          
          {/* Main Content Area */}
          <div className="space-y-8">
            
            {/* Connected Sessions */}
            {sessions.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold tracking-tight">Connected Numbers</h2>
                <div className="grid gap-4">
                  {sessions.map(session => (
                    <div key={session.id} className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center border",
                          session.status === 'connected' ? "bg-emerald-500/10 border-emerald-500/20" :
                          session.status === 'connecting' ? "bg-amber-500/10 border-amber-500/20" :
                          "bg-zinc-800/50 border-zinc-700/50"
                        )}>
                          <Phone className={cn(
                            "w-5 h-5",
                            session.status === 'connected' ? "text-emerald-400" :
                            session.status === 'connecting' ? "text-amber-400" :
                            "text-zinc-400"
                          )} />
                        </div>
                        <div>
                          <div className="font-medium text-lg">+{session.phoneNumber}</div>
                          <div className={cn(
                            "text-sm",
                            session.status === 'connected' ? "text-emerald-400" :
                            session.status === 'connecting' ? "text-amber-400" :
                            "text-zinc-500"
                          )}>
                            {session.status === 'connected' ? 'Active & Processing' : 
                             session.status === 'connecting' ? 'Connecting...' : 'Disconnected'}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleLogout(session.id)}
                        className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        title="Disconnect"
                      >
                        <LogOut className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add New Connection */}
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-8">
              <div className="max-w-md">
                <h2 className="text-2xl font-semibold tracking-tight mb-2">Connect a Number</h2>
                <p className="text-zinc-400 text-sm mb-8">
                  Link a new WhatsApp account to Vortex-MD using a pairing code.
                </p>

                <form onSubmit={handlePair} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                      Phone Number
                    </label>
                    <div className="relative">
                      <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                      <input
                        type="text"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="e.g. 1234567890"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                        disabled={loading}
                      />
                    </div>
                    <p className="text-xs text-zinc-500">Include country code without '+' (e.g., 1 for US, 44 for UK)</p>
                  </div>

                  {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !phoneNumber}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin" />
                        Requesting Code...
                      </>
                    ) : (
                      <>
                        <Plus className="w-5 h-5" />
                        Get Pairing Code
                      </>
                    )}
                  </button>
                </form>

                {pairingCode && (
                  <div className="mt-8 p-6 rounded-xl bg-zinc-950 border border-zinc-800 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <p className="text-sm text-zinc-400 mb-4">Your pairing code is ready. Enter this in your WhatsApp linked devices screen:</p>
                    <div className="text-4xl font-mono font-bold tracking-[0.2em] text-emerald-400 bg-emerald-500/10 py-4 rounded-lg border border-emerald-500/20">
                      {pairingCode}
                    </div>
                    <p className="text-xs text-zinc-500 mt-4">
                      Waiting for connection...
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Sidebar Config */}
          <div className="space-y-6">
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <Settings className="w-5 h-5 text-zinc-400" />
                <h3 className="font-semibold">Configuration</h3>
              </div>

              <form onSubmit={handleSaveConfig} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    Command Prefix
                  </label>
                  <input
                    type="text"
                    value={config.prefix}
                    onChange={(e) => setConfig({ ...config, prefix: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all font-mono"
                    maxLength={3}
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    Bot Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, mode: 'public' })}
                      className={cn(
                        "flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all",
                        config.mode === 'public' 
                          ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                          : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800/50"
                      )}
                    >
                      <Globe className="w-4 h-4" />
                      Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, mode: 'private' })}
                      className={cn(
                        "flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all",
                        config.mode === 'private' 
                          ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                          : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800/50"
                      )}
                    >
                      <Shield className="w-4 h-4" />
                      Private
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {config.mode === 'public' 
                      ? 'Everyone can use bot commands.' 
                      : 'Only you can use bot commands.'}
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={savingConfig}
                  className="w-full bg-zinc-100 hover:bg-white text-zinc-900 font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                >
                  {savingConfig ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

