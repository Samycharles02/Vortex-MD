import React, { useState, useEffect } from 'react';
import { Bot, LogOut, Settings, Smartphone, Phone, RefreshCw, Plus, Globe, Shield, Lock } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Session {
  id: string;
  status: 'disconnected' | 'connecting' | 'connected';
  phoneNumber: string;
}

export default function App() {
  const [loggedInPhone, setLoggedInPhone] = useState(localStorage.getItem('vortex_phone') || '');
  const [loginInput, setLoginInput] = useState('');
  
  const [sessions, setSessions] = useState<Session[]>([]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [pairingSessionId, setPairingSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [config, setConfig] = useState({ prefix: '.', mode: 'public', autostatus: false, autostatusEmoji: '🗽' });
  const [savingConfig, setSavingConfig] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = loginInput.replace(/\D/g, '');
    if (cleanPhone) {
      localStorage.setItem('vortex_phone', cleanPhone);
      setLoggedInPhone(cleanPhone);
      setPhoneNumber(cleanPhone);
    }
  };

  const handleLogoutApp = () => {
    localStorage.removeItem('vortex_phone');
    setLoggedInPhone('');
    setSessions([]);
  };

  const fetchSessions = async () => {
    if (!loggedInPhone) return;
    try {
      const res = await fetch(`/api/sessions?phone=${loggedInPhone}`);
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data);
      
      if (pairingSessionId) {
        const session = data.find((s: Session) => s.id === pairingSessionId);
        if (session && session.status === 'connected') {
          setPairingCode('');
          setPairingSessionId('');
        }
      }
    } catch (err) {
      // Silently ignore
    }
  };

  const fetchConfig = async () => {
    if (!loggedInPhone) return;
    try {
      const res = await fetch(`/api/config?phone=${loggedInPhone}`);
      if (!res.ok) return;
      const data = await res.json();
      setConfig(data);
    } catch (err) {
      // Silently ignore
    }
  };

  useEffect(() => {
    if (loggedInPhone) {
      fetchSessions();
      fetchConfig();
      const interval = setInterval(() => {
        fetchSessions();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [loggedInPhone, pairingSessionId]);

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setPairingCode('');

    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      if (!cleanPhone || cleanPhone !== loggedInPhone) {
        throw new Error('You can only pair the number you logged in with.');
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

  const handleReconnect = async (sessionId: string) => {
    try {
      await fetch('/api/reconnect', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      fetchSessions();
    } catch (err) {
      console.error('Failed to reconnect', err);
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
      await fetch(`/api/config?phone=${loggedInPhone}`, {
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

  if (!loggedInPhone) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 text-zinc-100 font-sans selection:bg-emerald-500/30">
        <div className="w-full max-w-md bg-zinc-900/50 border border-zinc-800/50 rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 mb-6">
              <Bot className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Vortex-MD Panel</h1>
            <p className="text-zinc-400 text-sm">Enter your WhatsApp number to access your dashboard.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider ml-1">
                WhatsApp Number
              </label>
              <div className="relative">
                <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type="text"
                  value={loginInput}
                  onChange={(e) => setLoginInput(e.target.value)}
                  placeholder="e.g. 33612345678"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Lock className="w-5 h-5" />
              Access Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  const connectedCount = sessions.filter(s => s.status === 'connected').length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      <header className="border-b border-zinc-800/50 bg-zinc-900/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <Bot className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="font-bold tracking-tight text-lg leading-tight">Vortex-MD Panel</h1>
              <p className="text-xs text-zinc-500">+{loggedInPhone}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border",
              connectedCount > 0 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
              "bg-zinc-800/50 text-zinc-400 border-zinc-700/50"
            )}>
              <div className={cn(
                "w-2 h-2 rounded-full",
                connectedCount > 0 ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-zinc-500"
              )} />
              {connectedCount > 0 ? 'Online' : 'Offline'}
            </div>
            <button 
              onClick={handleLogoutApp}
              className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-colors"
              title="Logout from Dashboard"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-[1fr_400px] gap-8 items-start">
          
          <div className="space-y-8">
            {sessions.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-400" />
                  Active Session
                </h2>
                <div className="grid gap-4">
                  {sessions.map(session => (
                    <div key={session.id} className="bg-zinc-900/40 border border-zinc-800/50 rounded-3xl p-6 flex items-center justify-between hover:bg-zinc-900/60 transition-colors">
                      <div className="flex items-center gap-5">
                        <div className={cn(
                          "w-14 h-14 rounded-2xl flex items-center justify-center border",
                          session.status === 'connected' ? "bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(52,211,153,0.1)]" :
                          session.status === 'connecting' ? "bg-amber-500/10 border-amber-500/20" :
                          "bg-zinc-800/50 border-zinc-700/50"
                        )}>
                          <Phone className={cn(
                            "w-6 h-6",
                            session.status === 'connected' ? "text-emerald-400" :
                            session.status === 'connecting' ? "text-amber-400" :
                            "text-zinc-400"
                          )} />
                        </div>
                        <div>
                          <div className="font-semibold text-lg tracking-wide">+{session.phoneNumber}</div>
                          <div className={cn(
                            "text-sm font-medium mt-0.5",
                            session.status === 'connected' ? "text-emerald-400" :
                            session.status === 'connecting' ? "text-amber-400" :
                            "text-zinc-500"
                          )}>
                            {session.status === 'connected' ? 'Connected & Active' : 
                             session.status === 'connecting' ? 'Connecting...' : 'Disconnected'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleReconnect(session.id)}
                          className="p-3 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-xl transition-colors"
                          title="Reconnect"
                        >
                          <RefreshCw className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleLogout(session.id)}
                          className="p-3 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-colors"
                          title="Disconnect"
                        >
                          <LogOut className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sessions.length === 0 && (
              <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-3xl p-8 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0" />
                <div className="max-w-md">
                  <h2 className="text-2xl font-bold tracking-tight mb-3">Deploy Vortex-MD</h2>
                  <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
                    Link your WhatsApp account to start using the bot. You will receive a pairing code to enter in your WhatsApp linked devices.
                  </p>

                  <form onSubmit={handlePair} className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1">
                        Your Number
                      </label>
                      <div className="relative">
                        <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                        <input
                          type="text"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="e.g. 33612345678"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                          disabled={loading}
                        />
                      </div>
                    </div>

                    {error && (
                      <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading || !phoneNumber}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin" />
                          Generating Code...
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
                    <div className="mt-8 p-8 rounded-3xl bg-zinc-950 border border-zinc-800 text-center animate-in fade-in slide-in-from-bottom-4 duration-500 shadow-xl">
                      <p className="text-sm font-medium text-zinc-400 mb-4">Enter this code in WhatsApp:</p>
                      <div className="text-5xl font-mono font-bold tracking-[0.25em] text-emerald-400 bg-emerald-500/10 py-6 rounded-2xl border border-emerald-500/20 shadow-[inset_0_0_20px_rgba(52,211,153,0.05)]">
                        {pairingCode}
                      </div>
                      <p className="text-sm font-medium text-emerald-500/70 mt-6 animate-pulse">
                        Waiting for connection...
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-3xl p-8">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 rounded-xl bg-zinc-800/50">
                  <Settings className="w-5 h-5 text-zinc-300" />
                </div>
                <h3 className="font-bold text-lg">Configuration</h3>
              </div>

              <form onSubmit={handleSaveConfig} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1">
                    Command Prefix
                  </label>
                  <input
                    type="text"
                    value={config.prefix}
                    onChange={(e) => setConfig({ ...config, prefix: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl py-3.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all font-mono text-center text-lg"
                    maxLength={3}
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1">
                    Bot Mode
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, mode: 'public' })}
                      className={cn(
                        "flex items-center justify-center gap-2 py-3.5 rounded-2xl border text-sm font-bold transition-all",
                        config.mode === 'public' 
                          ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.1)]" 
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
                        "flex items-center justify-center gap-2 py-3.5 rounded-2xl border text-sm font-bold transition-all",
                        config.mode === 'private' 
                          ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.1)]" 
                          : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800/50"
                      )}
                    >
                      <Shield className="w-4 h-4" />
                      Private
                    </button>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-zinc-800/50">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-zinc-300">
                      Auto-Status React
                    </label>
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, autostatus: !config.autostatus })}
                      className={cn(
                        "w-12 h-6 rounded-full transition-colors relative",
                        config.autostatus ? "bg-emerald-500" : "bg-zinc-700"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                        config.autostatus ? "left-7" : "left-1"
                      )} />
                    </button>
                  </div>
                  {config.autostatus && (
                    <div className="flex items-center gap-3 mt-2">
                      <input
                        type="text"
                        value={config.autostatusEmoji}
                        onChange={(e) => setConfig({ ...config, autostatusEmoji: e.target.value })}
                        className="w-16 bg-zinc-950 border border-zinc-800 rounded-xl py-2 text-center text-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                        maxLength={2}
                      />
                      <span className="text-xs text-zinc-500">Emoji to react with</span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={savingConfig}
                  className="w-full bg-zinc-100 hover:bg-white text-zinc-900 font-bold py-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2 mt-4"
                >
                  {savingConfig ? 'Saving...' : 'Save Configuration'}
                </button>
              </form>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

