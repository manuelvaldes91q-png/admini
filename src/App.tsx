import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Settings as SettingsIcon, 
  Activity, 
  Plus, 
  Shield, 
  ShieldOff, 
  Zap, 
  RefreshCw,
  Search,
  MessageSquare,
  Server,
  Save,
  CheckCircle2,
  AlertCircle,
  Lock,
  LogOut,
  User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Types
interface Client {
  id: string;
  name: string;
  mac: string;
  ip: string;
  plan_id: string;
  status: string;
  plan_name: string;
  download_limit: string;
  upload_limit: string;
  total_bytes: string;
}

interface Plan {
  id: string;
  name: string;
  download_limit: string;
  upload_limit: string;
}

interface Setting {
  key: string;
  value: string;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  
  const [activeTab, setActiveTab] = useState<'clients' | 'settings' | 'sync'>('clients');
  const [clients, setClients] = useState<Client[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncData, setSyncData] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', mac: '', ip: '', plan_id: '1' });
  const [config, setConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/check-auth');
      const data = await res.json();
      setIsAuthenticated(data.authenticated);
      if (data.authenticated) {
        fetchData();
      }
    } catch (err) {
      setIsAuthenticated(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      if (res.ok) {
        setIsAuthenticated(true);
        fetchData();
      } else {
        alert('Credenciales incorrectas');
      }
    } catch (err) {
      alert('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    setIsAuthenticated(false);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [cRes, pRes, sRes] = await Promise.all([
        fetch('/api/clients'),
        fetch('/api/plans'),
        fetch('/api/settings')
      ]);
      
      if (cRes.status === 401) {
        setIsAuthenticated(false);
        return;
      }

      setClients(await cRes.json());
      setPlans(await pRes.json());
      const sData = await sRes.json();
      setSettings(sData);
      
      const configMap: Record<string, string> = {};
      sData.forEach((s: Setting) => configMap[s.key] = s.value);
      setConfig(configMap);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClient)
      });
      if (res.ok) {
        setShowAddModal(false);
        setNewClient({ name: '', mac: '', ip: '', plan_id: '1' });
        fetchData();
      } else {
        const error = await res.json();
        alert('Error: ' + error.error);
      }
    } catch (err) {
      alert('Error en conexión');
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await fetch(`/api/clients/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      fetchData();
    } catch (err) {
      alert('Error al cambiar estado');
    }
  };

  const updateSettings = async () => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        alert('Configuración guardada');
        fetchData();
      } else {
        alert('Error al guardar');
      }
    } catch (err) {
      alert('Error al guardar config');
    }
  };

  const handleSync = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sync');
      if (res.ok) {
        setSyncData(await res.json());
      } else {
        alert('Error al sincronizar');
      }
    } catch (err) {
      alert('Sync failed');
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/test-connection', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert('CONEXIÓN EXITOSA: ' + data.details);
        fetchData();
      } else {
        alert('ERROR DE CONEXIÓN: ' + data.error + '\n\nTIP: ' + (data.tip || ''));
      }
    } catch (err: any) {
      alert('Error de red: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.ip.includes(searchTerm) || 
    c.mac.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatBytes = (bytes: string) => {
    const b = parseInt(bytes || '0');
    if (b === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isAuthenticated === null) return (
    <div className="min-h-screen bg-[#0b0c10] flex items-center justify-center">
      <RefreshCw size={30} className="text-[#ff7800] animate-spin" />
    </div>
  );

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0b0c10] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-[#181b1e] border border-[#2a2c31] p-8 shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="bg-[#ff7800] p-3 rounded-sm mb-4">
              <Lock size={32} className="text-black" />
            </div>
            <h1 className="text-white font-bold text-xl uppercase tracking-widest">ISP Master Access</h1>
            <p className="text-[#8e8e8e] text-[10px] uppercase mt-2">Personal Administrativo Autorizado</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-[#8e8e8e]">Usuario</label>
              <div className="flex items-center bg-[#0b0c10] border border-[#2a2c31] focus-within:border-[#ff7800] px-3">
                <User size={16} className="text-[#8e8e8e]" />
                <input 
                  type="text" 
                  autoFocus
                  className="w-full p-3 bg-transparent outline-none text-white text-sm"
                  value={loginForm.username}
                  onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-[#8e8e8e]">Contraseña</label>
              <div className="flex items-center bg-[#0b0c10] border border-[#2a2c31] focus-within:border-[#ff7800] px-3">
                <Lock size={16} className="text-[#8e8e8e]" />
                <input 
                  type="password" 
                  className="w-full p-3 bg-transparent outline-none text-white text-sm"
                  value={loginForm.password}
                  onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-[#ff7800] hover:bg-[#ff8c24] text-black font-bold py-4 text-xs uppercase tracking-widest transition-all mt-4"
            >
              {loading ? 'Validando...' : 'Entrar al Sistema'}
            </button>
          </form>

          <p className="text-[9px] text-[#8e8e8e] mt-8 text-center uppercase tracking-tighter opacity-50">
            Aprovisionamiento Automático • MikroTik RouterOS API
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0c10] text-[#d8d9da] font-sans selection:bg-[#ff7800]/30">
      {/* Top Navbar */}
      <header className="bg-[#181b1e] border-b border-[#2a2c31] px-6 py-3 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="bg-[#ff7800] p-1.5 rounded-sm">
            <Activity size={20} className="text-black" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide text-white uppercase">MikroTik Dashboard <span className="text-[#ff7800] ml-2">ISP MASTER</span></h1>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <nav className="flex gap-1 text-[11px] font-medium uppercase">
            {[
              { id: 'clients', label: 'Dashboard', icon: Activity },
              { id: 'sync', label: 'Monitor Real-Time', icon: RefreshCw },
              { id: 'settings', label: 'Configuración', icon: SettingsIcon },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`flex items-center gap-2 px-4 py-2 transition-all ${
                  activeTab === item.id 
                    ? 'text-[#ff7800] border-b-2 border-[#ff7800] bg-[#222529]' 
                    : 'text-[#8e8e8e] hover:text-white hover:bg-[#222529]'
                }`}
              >
                <item.icon size={14} />
                {item.label}
              </button>
            ))}
          </nav>

          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 text-[10px] font-bold uppercase text-red-500 hover:bg-red-500/10 px-3 py-1 rounded transition-all"
          >
            <LogOut size={14} />
            Salir
          </button>
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto">
        {activeTab === 'clients' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Clientes', val: clients.length, icon: Users, col: 'text-blue-400' },
                { label: 'Activos', val: clients.filter(c => c.status === 'active').length, icon: Shield, col: 'text-green-400' },
                { label: 'Cortados', val: clients.filter(c => c.status === 'inactive').length, icon: ShieldOff, col: 'text-red-400' },
                { label: 'Planes Config', val: plans.length, icon: Zap, col: 'text-orange-400' },
              ].map((stat, i) => (
                <div key={i} className="bg-[#181b1e] border border-[#2a2c31] p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-[#8e8e8e] uppercase font-bold tracking-widest">{stat.label}</p>
                    <p className={`text-2xl font-mono font-bold mt-1 ${stat.col}`}>{stat.val}</p>
                  </div>
                  <stat.icon className="opacity-20" size={32} />
                </div>
              ))}
            </div>

            {/* Clients Panel */}
            <div className="bg-[#181b1e] border border-[#2a2c31]">
              <div className="p-4 border-b border-[#2a2c31] flex justify-between items-center bg-[#222529]">
                <h3 className="text-xs font-bold uppercase flex items-center gap-2">
                  <Users size={14} className="text-[#ff7800]" /> Lista de Gestión
                </h3>
                <div className="flex gap-3">
                  <div className="relative flex items-center bg-[#0b0c10] border border-[#2a2c31] px-3 py-1.5 focus-within:border-[#ff7800] transition-all">
                    <Search size={14} className="text-[#8e8e8e]" />
                    <input 
                      type="text" 
                      placeholder="Filtrar..."
                      className="bg-transparent border-none outline-none text-xs ml-2 w-48 text-white"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={() => setShowAddModal(true)}
                    className="bg-[#ff7800] hover:bg-[#ff8c24] text-black font-bold text-[10px] uppercase px-4 py-2 transition-all flex items-center gap-2"
                  >
                    <Plus size={14} /> Registrar Cliente
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[10px] text-[#8e8e8e] uppercase font-bold border-b border-[#2a2c31]">
                      <th className="p-4">Identificación</th>
                      <th className="p-4">MAC / IP</th>
                      <th className="p-4">Plan Actual</th>
                      <th className="p-4">Consumo Total</th>
                      <th className="p-4">Estado Red</th>
                      <th className="p-4 text-right">Controles</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    {filteredClients.map((client) => (
                      <tr key={client.id} className="border-b border-[#2a2c31] hover:bg-[#222529] group">
                        <td className="p-4">
                          <div className="font-bold text-[#d8d9da]">{client.name}</div>
                          <div className="text-[10px] text-[#8e8e8e] mt-0.5">ID: {client.id}</div>
                        </td>
                        <td className="p-4">
                          <div className="font-mono text-[#56d64d]">{client.ip}</div>
                          <div className="font-mono text-[10px] text-[#8e8e8e] uppercase">{client.mac}</div>
                        </td>
                        <td className="p-4">
                          <div className="font-bold">{client.plan_name}</div>
                          <div className="text-[10px] text-[#8e8e8e]">↑{client.upload_limit} ↓{client.download_limit}</div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                             <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                             <span className="font-mono text-[11px] text-blue-400 font-bold">{formatBytes(client.total_bytes)}</span>
                          </div>
                          <div className="text-[8px] uppercase text-[#8e8e8e] mt-0.5">Acumulado Mikrotik</div>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-sm font-bold text-[9px] uppercase ${
                            client.status === 'active' ? 'bg-[#56d64d]/10 text-[#56d64d]' : 'bg-red-500/10 text-red-500'
                          }`}>
                            {client.status === 'active' ? 'Conectado' : 'Sin Acceso'}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <button 
                            onClick={() => toggleStatus(client.id, client.status)}
                            className={`p-2 transition-all border border-transparent hover:border-[#2a2c31] ${
                              client.status === 'active' ? 'hover:text-red-500' : 'hover:text-[#56d64d]'
                            }`}
                          >
                            {client.status === 'active' ? <ShieldOff size={16} /> : <Shield size={16} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'sync' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="flex justify-between items-center bg-[#181b1e] border border-[#2a2c31] p-4">
              <h2 className="text-xs font-bold uppercase flex items-center gap-2">
                <RefreshCw size={14} className="text-[#56d64d]" /> Sincronización de Recursos
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={handleSync}
                  className="bg-[#222529] hover:bg-[#2a2c31] text-[10px] uppercase font-bold border border-[#3a3f4b] px-4 py-2 flex items-center gap-2"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  {loading ? 'Sincronizando RouterOS...' : 'Refrescar MikroTik'}
                </button>
              </div>
            </div>

            {syncData && (
              <div className="bg-[#181b1e] border border-blue-500/30 overflow-hidden">
                <div className="bg-blue-500/10 p-3 border-b border-blue-500/30 flex items-center gap-2">
                  <Search size={14} className="text-blue-400" />
                  <h3 className="text-xs font-bold uppercase text-blue-400">Descubrimiento: IPs Automáticas (Dynamic Leases)</h3>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {syncData.leases.filter((l: any) => l.dynamic === 'true').map((lease: any, i: number) => {
                    const isRegistered = clients.some(c => c.mac.toLowerCase() === lease['mac-address'].toLowerCase());
                    return (
                      <div key={i} className={`p-3 border border-[#2a2c31] bg-[#0b0c10] ${!isRegistered ? 'ring-1 ring-orange-500/30 border-orange-500/50' : ''}`}>
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-mono text-sm text-[#56d64d]">{lease.address}</span>
                          {!isRegistered && (
                            <span className="text-[8px] bg-orange-500 text-black px-1.5 font-bold uppercase">No Registrado</span>
                          )}
                        </div>
                        <p className="text-[10px] font-mono text-[#8e8e8e] break-all uppercase">{lease['mac-address']}</p>
                        {!isRegistered && (
                          <button 
                            onClick={() => {
                              setNewClient({ ...newClient, mac: lease['mac-address'], ip: lease.address });
                              setShowAddModal(true);
                            }}
                            className="mt-3 w-full border border-blue-500/50 text-blue-400 py-1.5 text-[10px] uppercase hover:bg-blue-500 hover:text-white transition-all font-bold"
                          >
                            Autorizar Ahora
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {syncData.leases.filter((l: any) => l.dynamic === 'true').length === 0 && (
                    <div className="col-span-full py-8 text-center text-[10px] text-[#8e8e8e] italic">No hay dispositivos con IP dinámica activa (sin amarrar).</div>
                  )}
                </div>
              </div>
            )}

            {syncData ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <div className="bg-[#181b1e] border border-[#2a2c31]">
                    <div className="bg-[#222529] p-3 border-b border-[#2a2c31] text-[10px] font-bold uppercase tracking-widest flex items-center justify-between">
                      Control ARP (IP-MAC Binding)
                      <span className="text-blue-400">{syncData.arp.length} entradas</span>
                    </div>
                    <div className="max-h-96 overflow-y-auto custom-scrollbar">
                      {syncData.arp.map((a: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 border-b border-[#2a2c31]/30 hover:bg-[#222529]">
                          <div className="flex flex-col">
                            <span className="font-mono text-xs text-[#56d64d]">{a.address}</span>
                            <span className="text-[9px] text-[#8e8e8e] font-mono">{a['mac-address']}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col items-end">
                              <span className="text-[9px] italic text-[#8e8e8e]">{a.comment || 'Sin comentario'}</span>
                              <span className={`text-[8px] font-bold ${a.disabled === 'true' ? 'text-red-500' : 'text-[#56d64d]'}`}>
                                {a.disabled === 'true' ? 'DISABLED' : 'ACTIVE'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                 </div>

                 <div className="bg-[#181b1e] border border-[#2a2c31]">
                    <div className="bg-[#222529] p-3 border-b border-[#2a2c31] text-[10px] font-bold uppercase tracking-widest flex items-center justify-between">
                      Gestión de Anchos de Banda (Queues)
                      <span className="text-orange-400">{syncData.queues.length} colas</span>
                    </div>
                    <div className="max-h-96 overflow-y-auto custom-scrollbar">
                      {syncData.queues.map((q: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 border-b border-[#2a2c31]/30 hover:bg-[#222529]">
                          <div className="flex flex-col">
                            <span className="font-bold text-xs uppercase text-white">{q.name}</span>
                            <span className="text-[9px] text-[#8e8e8e] font-mono">Target: {q.target}</span>
                          </div>
                          <div className="bg-[#0b0c10] px-3 py-1.5 border border-[#2a2c31] rounded-sm">
                            <span className="font-mono text-[11px] text-[#ff7800]">{q['max-limit']}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                 </div>
              </div>
            ) : (
              <div className="bg-[#181b1e] border border-dashed border-[#2a2c31] p-24 text-center">
                <p className="text-[10px] text-[#8e8e8e] uppercase tracking-widest">Ejecuta "Refresh" para sincronizar con MikroTik</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} className="max-w-3xl mx-auto space-y-6 pb-12">
            <div className="bg-[#181b1e] border border-[#2a2c31]">
              <div className="p-4 border-b border-[#2a2c31] bg-[#222529]">
                <h3 className="text-xs font-bold uppercase flex items-center gap-2">Configuración General</h3>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    { label: 'MikroTik Host / Domain', key: 'mt_host' },
                    { label: 'Port API', key: 'mt_port' },
                    { label: 'API User', key: 'mt_user' },
                    { label: 'API Password', key: 'mt_pass', type: 'password' },
                    { label: 'Interfaz ARP (BINDING)', key: 'mt_interface' },
                  ].map(f => (
                    <div key={f.key} className="flex flex-col gap-2">
                       <label className="text-[10px] uppercase font-bold text-[#8e8e8e]">{f.label}</label>
                       <input 
                          type={f.type || 'text'}
                          className="bg-[#0b0c10] border border-[#2a2c31] p-2.5 outline-none font-mono text-xs focus:border-[#ff7800] text-[#56d64d] transition-all"
                          value={config[f.key] || ''}
                          onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
                       />
                    </div>
                  ))}
                </div>
                
                <div className="pt-6 border-t border-[#2a2c31]">
                  <h4 className="text-[10px] uppercase font-bold text-[#ff7800] mb-4 tracking-widest">Credenciales del Panel</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] uppercase font-bold text-[#8e8e8e]">Usuario Administrador</label>
                      <input 
                        type="text"
                        className="bg-[#0b0c10] border border-[#2a2c31] p-2.5 outline-none font-mono text-xs focus:border-[#ff7800] text-white"
                        value={config.admin_user || ''}
                        onChange={(e) => setConfig({ ...config, admin_user: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] uppercase font-bold text-[#8e8e8e]">Nueva Contraseña</label>
                      <input 
                        type="password"
                        className="bg-[#0b0c10] border border-[#2a2c31] p-2.5 outline-none font-mono text-xs focus:border-[#ff7800] text-white"
                        value={config.admin_pass || ''}
                        onChange={(e) => setConfig({ ...config, admin_pass: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-4 border-t border-[#2a2c31]">
                  <label className="text-[10px] uppercase font-bold text-[#8e8e8e]">Telegram Bot Token</label>
                  <input 
                    type="password"
                    className="bg-[#0b0c10] border border-[#2a2c31] p-2.5 outline-none font-mono text-xs focus:border-[#ff7800] text-[#ff7800] transition-all"
                    placeholder="Provide token from @BotFather"
                    value={config.tg_token || ''}
                    onChange={(e) => setConfig({ ...config, tg_token: e.target.value })}
                  />
                </div>
                <div className="flex flex-col md:flex-row gap-4">
                  <button 
                    onClick={updateSettings}
                    className="flex-1 bg-[#ff7800] hover:bg-[#ff8c24] text-black font-bold py-3 text-xs uppercase tracking-widest transition-all"
                  >
                    Confirmar y Guardar Cambios
                  </button>
                  <button 
                    onClick={handleTestConnection}
                    className="bg-[#2a2c31] hover:bg-[#3a3f4b] text-white font-bold py-3 px-6 text-xs uppercase tracking-widest border border-[#3a3f4b] transition-all flex items-center justify-center gap-2"
                  >
                    <Activity size={14} className="text-[#ff7800]" />
                    Probar Conexión
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </main>

      {/* Add Client Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddModal(false)} className="fixed inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="relative bg-[#181b1e] border border-[#2a2c31] w-full max-w-lg overflow-hidden shadow-2xl">
              <div className="bg-[#ff7800] p-4 flex justify-between items-center text-black">
                <h2 className="font-bold uppercase text-xs">Registrar / Autorizar Cliente</h2>
                <button onClick={() => setShowAddModal(false)} className="hover:rotate-90 transition-transform"><Plus className="rotate-45" /></button>
              </div>
              
              <form onSubmit={handleAddClient} className="p-8 space-y-5">
                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] uppercase font-bold text-[#8e8e8e]">Nombre de Identificación</label>
                    <input 
                      type="text" required placeholder="Ej. Familia Gomez - Calle 01"
                      className="bg-[#0b0c10] border border-[#2a2c31] p-2.5 outline-none font-mono text-xs focus:border-[#ff7800]"
                      value={newClient.name} onChange={e => setNewClient({ ...newClient, name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] uppercase font-bold text-[#8e8e8e]">Dirección MAC</label>
                      <input 
                        type="text" required placeholder="00:00:00:00:00:00"
                        className="bg-[#0b0c10] border border-[#2a2c31] p-2.5 outline-none font-mono text-xs uppercase focus:border-[#ff7800]"
                        value={newClient.mac} onChange={e => setNewClient({ ...newClient, mac: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] uppercase font-bold text-[#8e8e8e]">Dirección IP (Static)</label>
                      <input 
                        type="text" required placeholder="192.168.88.x"
                        className="bg-[#0b0c10] border border-[#2a2c31] p-2.5 outline-none font-mono text-xs focus:border-[#ff7800]"
                        value={newClient.ip} onChange={e => setNewClient({ ...newClient, ip: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] uppercase font-bold text-[#8e8e8e]">Plan de Navegación</label>
                    <select 
                      className="bg-[#0b0c10] border border-[#2a2c31] p-2.5 outline-none font-mono text-xs cursor-pointer focus:border-[#ff7800]"
                      value={newClient.plan_id} onChange={e => setNewClient({ ...newClient, plan_id: e.target.value })}
                    >
                      {plans.map(p => <option key={p.id} value={p.id}>{p.name} (↓{p.download_limit} ↑{p.upload_limit})</option>)}
                    </select>
                  </div>
                </div>

                <div className="pt-6">
                  <button type="submit" className="w-full bg-[#ff7800] hover:bg-[#ff8c24] text-black font-bold py-4 text-[11px] uppercase tracking-widest transition-all">
                    Ejecutar Provisionamiento
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0b0c10; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2a2c31; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #ff7800; }
      `}</style>
    </div>
  );
}
