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
  User,
  Trash2,
  Edit2,
  ArrowDownNarrowWide
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
  const [sortByConsumption, setSortByConsumption] = useState<boolean>(false);

  // Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [newClient, setNewClient] = useState({ name: '', mac: '', ip: '', plan_id: '1' });
  const [config, setConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    checkAuth();
    handleSync();
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
        const data = await res.json();
        setSyncData(data);
      } else {
        alert('Error al sincronizar');
      }
    } catch (err) {
      alert('Sync failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterFromDiscovery = (ip: string, mac: string, host: string) => {
    setNewClient({ name: host, ip, mac, plan_id: '1' });
    setShowAddModal(true);
  };

  const unregisteredLeases = syncData?.leases?.filter((l: any) => 
    !clients.some(c => c.mac.toLowerCase() === l['mac-address'].toLowerCase() || c.ip === l.address)
  ) || [];

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

  const handleTestTelegram = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/test-telegram', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert('TELEGRAM: Mensaje de prueba enviado exitosamente.');
      } else {
        alert('ERROR TELEGRAM: ' + data.error);
      }
    } catch (err: any) {
      alert('Error de red: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClient = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de eliminar a ${name}? Esto borrará sus registros en MikroTik (Queue, ARP y Lease).`)) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert('Error: ' + data.error);
      }
    } catch (err) {
      alert('Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${selectedClient.id}/plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: selectedClient.plan_id })
      });
      if (res.ok) {
        setShowEditModal(false);
        fetchData();
      } else {
        const data = await res.json();
        alert('Error: ' + data.error);
      }
    } catch (err) {
      alert('Update failed');
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients
    .filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.ip.includes(searchTerm) || 
      c.mac.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (sortByConsumption) {
        return parseInt(b.total_bytes || '0') - parseInt(a.total_bytes || '0');
      }
      return 0;
    });

  const formatSpeed = (speed: string) => {
    let s = parseInt(speed || '0');
    if (isNaN(s)) return speed; // Return as is if already has units like '5M'
    if (s === 0) return 'Ilimitado';
    
    if (s >= 1000000) return (s / 1000000).toFixed(0) + ' Mbps';
    if (s >= 1000) return (s / 1000).toFixed(0) + ' Kbps';
    return s + ' bps';
  };

  const formatBytes = (bytes: string) => {
    const b = parseInt(bytes || '0');
    if (b === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isAuthenticated === null) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <RefreshCw size={30} className="text-brand animate-spin" />
    </div>
  );

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md glass-panel p-8 shadow-2xl rounded-2xl relative overflow-hidden"
        >
          {/* Subtle background glow */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-brand/10 blur-[100px] rounded-full" />
          
          <div className="relative flex flex-col items-center mb-8">
            <div className="bg-brand p-4 rounded-2xl mb-6 shadow-lg shadow-brand/20">
              <Lock size={32} className="text-black" />
            </div>
            <h1 className="text-white font-bold text-2xl tracking-tight">ISP Dashboard</h1>
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-[0.2em] mt-2">Personal Autorizado</p>
          </div>

          <form onSubmit={handleLogin} className="relative space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-zinc-500 ml-1">Usuario</label>
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl focus-within:border-brand/50 transition-all px-4">
                <User size={18} className="text-zinc-500" />
                <input 
                  type="text" 
                  autoFocus
                  placeholder="Administrador"
                  className="w-full py-4 bg-transparent outline-none text-white text-sm ml-3"
                  value={loginForm.username}
                  onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-zinc-500 ml-1">Contraseña</label>
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl focus-within:border-brand/50 transition-all px-4">
                <Lock size={18} className="text-zinc-500" />
                <input 
                  type="password" 
                  placeholder="••••••••"
                  className="w-full py-4 bg-transparent outline-none text-white text-sm ml-3"
                  value={loginForm.password}
                  onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-brand hover:brightness-110 active:scale-[0.98] text-black font-bold py-4 rounded-xl text-sm uppercase tracking-widest transition-all mt-4 shadow-lg shadow-brand/20 disabled:opacity-50"
            >
              {loading ? 'Validando...' : 'Iniciar Sesión'}
            </button>
          </form>

          <p className="text-[10px] text-zinc-500 mt-10 text-center uppercase tracking-widest opacity-50 font-mono">
            MikroTik Engine v2.0
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-sans selection:bg-brand/30 pb-20">
      {/* Top Navbar */}
      <header className="glass-panel sticky top-0 z-50 px-4 md:px-8 py-4 flex items-center justify-between mx-auto md:m-4 md:rounded-2xl shadow-xl border-t border-white/5">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-brand p-2 rounded-xl shadow-lg shadow-brand/20">
              <Activity size={20} className="text-black" />
            </div>
            <div className="hidden sm:block">
              <h1 className="font-bold text-lg tracking-tight text-white">ISP Master</h1>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="text-[10px] font-mono text-zinc-500">ROUTEROS ONLINE</span>
              </div>
            </div>
          </div>
          
          <nav className="flex items-center bg-zinc-800/30 p-1 rounded-xl ml-4">
            {[
              { id: 'clients', label: 'Dashboard', icon: Activity },
              { id: 'sync', label: 'Monitor', icon: RefreshCw },
              { id: 'settings', label: 'Config', icon: SettingsIcon },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                  activeTab === item.id 
                    ? 'text-white bg-zinc-800 shadow-md border border-white/5' 
                    : 'text-zinc-500 hover:text-white'
                }`}
              >
                <item.icon size={14} className={activeTab === item.id ? 'text-brand' : ''} />
                <span className="hidden md:inline">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex -space-x-2 mr-2">
             <div className="h-8 w-8 rounded-full border-2 border-zinc-950 bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">
               {isAuthenticated && loginForm.username ? loginForm.username[0].toUpperCase() : 'A'}
             </div>
          </div>
          <button 
            onClick={handleLogout}
            className="hidden sm:flex items-center gap-2 text-xs font-bold uppercase text-zinc-500 hover:text-red-400 transition-all px-2 py-1"
          >
            <LogOut size={16} />
            Salir
          </button>
        </div>
      </header>

      <main className="p-4 md:p-8 max-w-[1600px] mx-auto">
        {activeTab === 'clients' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Total Clientes', val: clients.length, icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/5', border: 'border-blue-400/20' },
                { label: 'Nodos Activos', val: clients.filter(c => c.status === 'active').length, icon: Shield, color: 'text-emerald-400', bg: 'bg-emerald-400/5', border: 'border-emerald-400/20' },
                { label: 'Suspendidos', val: clients.filter(c => c.status === 'inactive').length, icon: ShieldOff, color: 'text-rose-400', bg: 'bg-rose-400/5', border: 'border-rose-400/20' },
                { label: 'Planes Config', val: plans.length, icon: Zap, color: 'text-amber-400', bg: 'bg-amber-400/5', border: 'border-amber-400/20' },
              ].map((stat, i) => (
                <motion.div 
                  key={i} 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`tech-card p-6 rounded-2xl relative overflow-hidden group`}
                >
                  <div className={`absolute top-0 right-0 p-8 ${stat.color} opacity-[0.03] group-hover:opacity-[0.08] transition-opacity`}>
                    <stat.icon size={120} />
                  </div>
                  <div className="relative flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-[0.2em]">{stat.label}</p>
                      <p className={`text-4xl font-mono font-bold mt-2 text-white`}>{stat.val}</p>
                    </div>
                    <div className={`p-4 rounded-2xl ${stat.bg} ${stat.border} border`}>
                      <stat.icon className={stat.color} size={24} />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                     <span className={`w-2 h-2 rounded-full ${stat.color.replace('text-', 'bg-')}`} />
                     <span className="text-[10px] text-zinc-500 uppercase font-medium">Estado del Sistema</span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Discovery Section */}
            {unregisteredLeases.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-brand/5 border border-brand/20 rounded-2xl overflow-hidden shadow-lg shadow-brand/5"
              >
                <div className="p-4 border-b border-brand/10 bg-brand/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-brand/20 p-1.5 rounded-lg">
                      <Search size={16} className="text-brand" />
                    </div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-brand">
                      Dispositivos Detectados (Dynamic Leases)
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] bg-brand text-black px-2 py-1 font-black rounded-lg uppercase">
                      {unregisteredLeases.length} Sugeridos
                    </span>
                  </div>
                </div>
                <div className="p-4 flex gap-4 overflow-x-auto custom-scrollbar pb-6">
                  {unregisteredLeases.map((lease: any, idx: number) => (
                    <motion.div 
                      key={idx} 
                      whileHover={{ y: -4 }}
                      onClick={() => handleRegisterFromDiscovery(lease.address, lease['mac-address'], lease['host-name'] || 'Cliente-Nuevo')}
                      className="inline-block bg-zinc-900 border border-zinc-800 p-5 rounded-2xl min-w-[240px] cursor-pointer hover:border-brand/50 transition-all group relative overflow-hidden"
                    >
                      <div className="absolute -right-4 -bottom-4 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
                         <Plus size={80} className="text-white" />
                      </div>
                      <div className="flex justify-between items-start">
                        <p className="text-white font-mono font-bold text-lg leading-none">{lease.address}</p>
                        <div className="bg-brand/10 p-2 rounded-xl text-brand group-hover:bg-brand group-hover:text-black transition-all">
                          <Plus size={14} />
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-500 font-mono mt-2 uppercase tracking-tight">{lease['mac-address']}</p>
                      <div className="mt-4 pt-4 border-t border-zinc-800">
                        <span className="text-[10px] text-zinc-400 font-bold uppercase truncate block">
                          {lease.comment || lease['host-name'] || 'Huesped Desconocido'}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Clients Panel */}
            <div className="tech-card rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-zinc-800 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-zinc-900/50 gap-4">
                <div className="flex items-center gap-4">
                  <div className="bg-zinc-800 p-2 rounded-xl">
                    <Users size={18} className="text-brand" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-widest text-white">Gestión de Clientes</h3>
                    <p className="text-[10px] text-zinc-500 font-medium">{filteredClients.length} equipos en monitoreo</p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                  <div className="relative group">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-brand transition-colors" />
                    <input 
                      type="text" 
                      placeholder="Buscar por IP, MAC..."
                      className="bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-4 py-2.5 outline-none text-xs focus:border-brand/40 transition-all w-full sm:w-64 text-white"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={() => setShowAddModal(true)}
                    className="bg-brand/10 hover:bg-brand text-brand hover:text-black font-bold text-[10px] uppercase px-5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 border border-brand/20 whitespace-nowrap shadow-lg shadow-brand/5"
                  >
                    <Plus size={16} /> Registrar Nodo
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-zinc-800">
                      <th className="px-6 py-5">Nombre / Identificador</th>
                      <th className="px-6 py-5">Red (IP/MAC)</th>
                      <th className="px-6 py-5">Plan de Servicio</th>
                      <th 
                        className="px-6 py-5 cursor-pointer hover:text-brand transition-colors group"
                        onClick={() => setSortByConsumption(!sortByConsumption)}
                      >
                        <div className="flex items-center gap-2">
                          Consumo MikroTik
                          <ArrowDownNarrowWide size={14} className={sortByConsumption ? 'text-brand' : 'text-zinc-700'} />
                        </div>
                      </th>
                      <th className="px-6 py-5 text-center">Estado</th>
                      <th className="px-6 py-5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    {filteredClients.map((client) => (
                      <tr key={client.id} className="border-b border-zinc-800/50 hover:bg-white/[0.02] transition-colors group/row">
                        <td className="px-6 py-5">
                          <div className="font-bold text-white group-hover/row:text-brand transition-colors">{client.name}</div>
                          <div className="text-[10px] text-zinc-600 mt-1 font-mono">#{client.id.slice(-8)}</div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="font-mono text-zinc-300 bg-zinc-950 px-2 py-1 rounded inline-block border border-zinc-800">{client.ip}</div>
                          <div className="font-mono text-[10px] text-zinc-600 mt-1.5 uppercase tracking-tighter">{client.mac}</div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <Zap size={14} className="text-amber-400/70" />
                            <span className="font-bold text-zinc-200">{client.plan_name}</span>
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-1">
                            <span className="text-zinc-600 tracking-tighter uppercase mr-1">BW:</span>
                             ↓{formatSpeed(client.download_limit)} / ↑{formatSpeed(client.upload_limit)}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                             <div className="flex-1 bg-zinc-800 h-1 rounded-full overflow-hidden max-w-[80px]">
                                <div className="bg-blue-500 h-full w-2/3" />
                             </div>
                             <span className="font-mono text-[11px] text-blue-400 font-bold">{formatBytes(client.total_bytes)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <div className="flex items-center justify-center">
                             <span className={`flex items-center gap-2 px-3 py-1 rounded-full font-bold text-[9px] uppercase border ${
                               client.status === 'active' 
                               ? 'bg-emerald-400/5 text-emerald-400 border-emerald-400/20' 
                               : 'bg-rose-400/5 text-rose-400 border-rose-400/20'
                             }`}>
                               <div className={`w-1 h-1 rounded-full ${client.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                               {client.status === 'active' ? 'En Línea' : 'Bloqueado'}
                             </span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-60 group-hover/row:opacity-100 transition-opacity">
                            <button 
                              onClick={() => toggleStatus(client.id, client.status)}
                              className={`p-2.5 rounded-lg transition-all border border-zinc-800 hover:bg-zinc-800 ${
                                client.status === 'active' ? 'hover:text-rose-400' : 'hover:text-emerald-400'
                              }`}
                              title={client.status === 'active' ? 'Cortar Internet' : 'Activar Servicio'}
                            >
                              {client.status === 'active' ? <ShieldOff size={16} /> : <Shield size={16} />}
                            </button>
                            <button 
                              onClick={() => {
                                setSelectedClient(client);
                                setShowEditModal(true);
                              }}
                              className="p-2.5 rounded-lg transition-all border border-zinc-800 hover:bg-zinc-800 hover:text-brand"
                              title="Configurar Plan"
                            >
                              <ArrowDownNarrowWide size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteClient(client.id, client.name)}
                              className="p-2.5 rounded-lg transition-all border border-zinc-800 hover:bg-zinc-800 hover:text-rose-600"
                              title="Borrar Cliente"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-lg">
              <div className="flex items-center gap-4">
                <div className="bg-emerald-400/10 p-3 rounded-xl">
                  <RefreshCw size={20} className="text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-white">Sincronización de Recursos</h2>
                  <p className="text-[10px] text-zinc-500 font-medium">Estado real de MikroTik RouterOS</p>
                </div>
              </div>
              <button 
                onClick={handleSync}
                className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-widest border border-white/5 transition-all flex items-center gap-3 shadow-lg shadow-black/20"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Consultando...' : 'Fuerza Sincronización'}
              </button>
            </div>

            {syncData && (
              <div className="grid grid-cols-1 gap-8">
                 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="tech-card rounded-2xl overflow-hidden border-blue-500/20">
                    <div className="bg-blue-500/5 p-5 border-b border-blue-500/10 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <Search size={16} className="text-blue-400" />
                         <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Arrendamientos Dinámicos (DHCP Leases)</span>
                      </div>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {syncData.leases.filter((l: any) => l.dynamic === 'true').map((lease: any, i: number) => {
                        const isRegistered = clients.some(c => c.mac.toLowerCase() === lease['mac-address'].toLowerCase());
                        return (
                          <div key={i} className={`p-5 rounded-2xl border transition-all ${!isRegistered ? 'bg-blue-500/5 border-blue-500/30 ring-1 ring-blue-500/20 shadow-lg shadow-blue-500/5' : 'bg-zinc-950 border-zinc-800 opacity-60'}`}>
                            <div className="flex justify-between items-start mb-3">
                              <span className="font-mono text-sm text-emerald-400 font-bold">{lease.address}</span>
                              {!isRegistered && (
                                <span className="text-[10px] bg-blue-500 text-black px-2 py-0.5 font-black uppercase rounded-md">Nuevo</span>
                              )}
                            </div>
                            <p className="text-[10px] font-mono text-zinc-500 break-all uppercase tracking-tight">{lease['mac-address']}</p>
                            {!isRegistered && (
                              <button 
                                onClick={() => {
                                  setNewClient({ ...newClient, mac: lease['mac-address'], ip: lease.address });
                                  setShowAddModal(true);
                                }}
                                className="mt-4 w-full bg-blue-500 hover:bg-blue-400 text-black py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                              >
                                Autorizar Acceso
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {syncData.leases.filter((l: any) => l.dynamic === 'true').length === 0 && (
                        <div className="col-span-full py-12 text-center text-[10px] text-zinc-600 uppercase tracking-[0.2em] italic">No se detectaron dispositivos dinámicos sin amarrar.</div>
                      )}
                    </div>
                 </motion.div>
              </div>
            )}

            {syncData && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="tech-card rounded-2xl overflow-hidden">
                    <div className="bg-zinc-900/80 p-5 border-b border-zinc-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <Search size={16} className="text-blue-400" />
                         <span className="text-xs font-bold uppercase tracking-widest text-white">Control ARP</span>
                      </div>
                      <span className="text-[10px] font-mono bg-blue-400/10 text-blue-400 px-3 py-1 rounded-full border border-blue-400/20">
                        {syncData.arp.length} ENTRADAS
                      </span>
                    </div>
                    <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                      {syncData.arp.map((a: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-4 border-b border-zinc-800/50 hover:bg-white/[0.01] transition-colors">
                          <div className="flex flex-col gap-1">
                            <span className="font-mono text-sm text-emerald-400 font-bold">{a.address}</span>
                            <span className="text-[10px] text-zinc-600 font-mono tracking-tighter uppercase">{a['mac-address']}</span>
                          </div>
                          <div className="flex items-center gap-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] font-medium text-zinc-400 max-w-[120px] truncate">{a.comment || 'N/A'}</span>
                              <div className={`mt-1 h-1 w-8 rounded-full ${a.disabled === 'true' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                 </motion.div>

                 <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="tech-card rounded-2xl overflow-hidden">
                    <div className="bg-zinc-900/80 p-5 border-b border-zinc-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <Zap size={16} className="text-amber-400" />
                         <span className="text-xs font-bold uppercase tracking-widest text-white">Simple Queues</span>
                      </div>
                      <span className="text-[10px] font-mono bg-amber-400/10 text-amber-400 px-3 py-1 rounded-full border border-amber-400/20">
                        {syncData.queues.length} COLAS
                      </span>
                    </div>
                    <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                      {syncData.queues.map((q: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-4 border-b border-zinc-800/50 hover:bg-white/[0.01] transition-colors">
                          <div className="flex flex-col gap-1">
                            <span className="font-bold text-sm text-zinc-200 uppercase tracking-tight">{q.name}</span>
                            <span className="text-[10px] text-zinc-600 font-mono italic">Limit: {q.target}</span>
                          </div>
                          <div className="bg-zinc-950 px-4 py-2 border border-zinc-800 rounded-xl shadow-inner">
                            <span className="font-mono text-xs text-brand font-bold">{q['max-limit']}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                 </motion.div>
              </div>
            )}

            {!syncData && (
              <div className="tech-card border-dashed border-zinc-800 rounded-3xl p-32 text-center">
                <div className="bg-zinc-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                  <RefreshCw size={24} className="text-zinc-600" />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">Sin Sincronizada</h3>
                <p className="text-sm text-zinc-500 max-w-xs mx-auto uppercase tracking-widest text-[10px]">Utiliza el botón de arriba para leer datos del RouterOS en tiempo real.</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="max-w-4xl mx-auto space-y-8 pb-20"
          >
            <div className="tech-card rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-zinc-800 bg-zinc-900/80 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-brand/10 p-2 rounded-xl">
                    <Server size={18} className="text-brand" />
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-white">Infraestructura MikroTik</h3>
                </div>
                <button 
                  onClick={handleTestConnection}
                  disabled={loading}
                  className="bg-brand/10 hover:bg-brand text-brand hover:text-black font-bold py-2.5 px-6 rounded-xl text-[10px] uppercase tracking-widest border border-brand/20 transition-all flex items-center gap-3 disabled:opacity-50"
                >
                  <Activity size={14} />
                  Ping Router API
                </button>
              </div>
              <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {[
                    { label: 'Host / IP Address', key: 'mt_host', icon: Search },
                    { label: 'API Port (8728)', key: 'mt_port', icon: Server },
                    { label: 'API User', key: 'mt_user', icon: User },
                    { label: 'API Password', key: 'mt_pass', type: 'password', icon: Lock },
                    { label: 'Main Interface', key: 'mt_interface', icon: Activity },
                  ].map((f: any) => (
                    <div key={f.key} className="space-y-3">
                       <div className="flex items-center gap-2">
                         <f.icon size={12} className="text-zinc-500" />
                         <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">{f.label}</label>
                       </div>
                       <input 
                          type={f.type || 'text'}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 outline-none font-mono text-sm focus:border-brand/40 text-emerald-400 transition-all placeholder:text-zinc-800"
                          value={config[f.key] || ''}
                          autoComplete="off"
                          onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
                       />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="tech-card rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-zinc-800 bg-zinc-900/80">
                  <div className="flex items-center gap-3">
                    <User size={18} className="text-blue-400" />
                    <h3 className="text-sm font-bold uppercase tracking-widest text-white">Seguridad de Acceso</h3>
                  </div>
                </div>
                <div className="p-8 space-y-6">
                  <div className="space-y-3">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Dashboard Username</label>
                    <input 
                      type="text"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 outline-none font-mono text-sm focus:border-brand/40 text-white"
                      value={config.admin_user || ''}
                      onChange={(e) => setConfig({ ...config, admin_user: e.target.value })}
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Dashboard Password</label>
                    <input 
                      type="password"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 outline-none font-mono text-sm focus:border-brand/40 text-white"
                      value={config.admin_pass || ''}
                      onChange={(e) => setConfig({ ...config, admin_pass: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="tech-card rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-zinc-800 bg-zinc-900/80">
                  <div className="flex items-center gap-3">
                    <MessageSquare size={18} className="text-indigo-400" />
                    <h3 className="text-sm font-bold uppercase tracking-widest text-white">Bot Telegram</h3>
                  </div>
                </div>
                <div className="p-8 space-y-6">
                  <div className="space-y-3">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Bot Token (HTTP API)</label>
                    <input 
                      type="password"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 outline-none font-mono text-sm focus:border-brand/40 text-indigo-300"
                      value={config.tg_token || ''}
                      onChange={(e) => setConfig({ ...config, tg_token: e.target.value })}
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Admin Chat ID</label>
                    <input 
                      type="text"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 outline-none font-mono text-sm focus:border-brand/40 text-indigo-300"
                      value={config.tg_admin_chat_id || ''}
                      onChange={(e) => setConfig({ ...config, tg_admin_chat_id: e.target.value })}
                    />
                  </div>
                  <button 
                    onClick={handleTestTelegram}
                    className="w-full bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white border border-indigo-500/20 font-bold py-3 px-6 rounded-xl text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    <MessageSquare size={14} /> Mandar Alerta de Prueba
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-center pt-8">
               <button 
                onClick={updateSettings}
                className="bg-brand hover:brightness-110 active:scale-95 text-black font-bold py-4 px-12 rounded-2xl text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-brand/20 flex items-center gap-3"
              >
                <Save size={18} />
                Guardar Configuración Maestra
              </button>
            </div>
          </motion.div>
        )}
      </main>

      {/* Modals Implementation - Modernized */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0 }}
               onClick={() => setShowAddModal(false)}
               className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-xl tech-card rounded-3xl shadow-2xl overflow-hidden"
             >
                <div className="p-6 border-b border-zinc-800 bg-zinc-900/80 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="bg-brand/20 p-2 rounded-xl">
                        <Plus size={18} className="text-brand" />
                      </div>
                      <h3 className="text-sm font-bold uppercase tracking-widest text-white">Registro de Nuevo Nodo</h3>
                   </div>
                   <button onClick={() => setShowAddModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                      <Plus size={24} className="rotate-45" />
                   </button>
                </div>
                <form onSubmit={handleAddClient} className="p-8 space-y-6">
                   <div className="grid grid-cols-1 gap-6">
                      <div className="space-y-2">
                         <label className="text-[10px] uppercase font-bold text-zinc-500 ml-1">Nombre Completo</label>
                         <input 
                           type="text" required
                           className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 outline-none text-white focus:border-brand/40 transition-all font-medium"
                           value={newClient.name}
                           onChange={e => setNewClient({...newClient, name: e.target.value})}
                         />
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                           <label className="text-[10px] uppercase font-bold text-zinc-500 ml-1">Dirección IP</label>
                           <input 
                             type="text" required
                             className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 outline-none font-mono text-emerald-400 focus:border-brand/40 transition-all"
                             value={newClient.ip}
                             onChange={e => setNewClient({...newClient, ip: e.target.value})}
                           />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] uppercase font-bold text-zinc-500 ml-1">Dirección MAC</label>
                           <input 
                             type="text" required
                             placeholder="00:00:00..."
                             className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 outline-none font-mono text-zinc-300 focus:border-brand/40 transition-all uppercase"
                             value={newClient.mac}
                             onChange={e => setNewClient({...newClient, mac: e.target.value})}
                           />
                        </div>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] uppercase font-bold text-zinc-500 ml-1">Plan de Velocidad</label>
                         <select 
                           className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 outline-none text-white focus:border-brand/40 transition-all appearance-none cursor-pointer font-bold"
                           value={newClient.plan_id}
                           onChange={e => setNewClient({...newClient, plan_id: e.target.value})}
                         >
                           {plans.map(p => (
                             <option key={p.id} value={p.id} className="bg-zinc-900 border-none">
                               {p.name} (↓{formatSpeed(p.download_limit)} / ↑{formatSpeed(p.upload_limit)})
                             </option>
                           ))}
                         </select>
                      </div>
                   </div>
                   <button 
                     type="submit" 
                     className="w-full bg-brand hover:brightness-110 text-black font-bold py-4 rounded-2xl text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-brand/20 mt-4"
                   >
                     Confirmar e Inyectar en MikroTik
                   </button>
                </form>
             </motion.div>
          </div>
        )}

        {showEditModal && selectedClient && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0 }}
               onClick={() => setShowEditModal(false)}
               className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-lg tech-card rounded-3xl shadow-2xl overflow-hidden"
             >
                <div className="p-6 border-b border-zinc-800 bg-zinc-900/80 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="bg-amber-400/20 p-2 rounded-xl">
                        <ArrowDownNarrowWide size={18} className="text-amber-400" />
                      </div>
                      <h3 className="text-sm font-bold uppercase tracking-widest text-white">Re-aprovisionar Servicio</h3>
                   </div>
                   <button onClick={() => setShowEditModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                      <Plus size={24} className="rotate-45" />
                   </button>
                </div>
                <form onSubmit={handleUpdatePlan} className="p-8 space-y-6">
                   <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-2xl">
                      <p className="text-[10px] uppercase font-bold text-zinc-500 mb-2">Cliente Destino</p>
                      <h4 className="text-white font-bold text-lg">{selectedClient.name}</h4>
                      <div className="flex gap-4 mt-2 font-mono text-[11px] text-emerald-400">
                         <span>{selectedClient.ip}</span>
                         <span className="text-zinc-800">|</span>
                         <span className="uppercase text-zinc-600">{selectedClient.mac}</span>
                      </div>
                   </div>

                   <div className="space-y-2">
                       <label className="text-[10px] uppercase font-bold text-zinc-500 ml-1">Nuevo Perfil de Velocidad</label>
                       <select 
                         className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 outline-none text-white focus:border-brand/40 transition-all appearance-none cursor-pointer font-bold"
                         value={selectedClient.plan_id}
                         onChange={e => setSelectedClient({...selectedClient, plan_id: e.target.value})}
                       >
                         {plans.map(p => (
                           <option key={p.id} value={p.id} className="bg-zinc-900 border-none">
                             {p.name} (↓{formatSpeed(p.download_limit)} / ↑{formatSpeed(p.upload_limit)})
                           </option>
                         ))}
                       </select>
                   </div>
                   
                   <p className="text-[10px] text-zinc-600 italic px-2">
                     * Esta acción actualizará instantáneamente la Queue correspondiente en el MikroTik configurado.
                   </p>

                   <button 
                     type="submit" 
                     className="w-full bg-amber-400 hover:brightness-110 text-black font-bold py-4 rounded-2xl text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-amber-400/20 mt-4"
                   >
                     Aplicar Nuevo Plan
                   </button>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
