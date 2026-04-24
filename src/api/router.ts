import express, { Request, Response, NextFunction } from 'express';
import db from '../lib/db.js';
import { provisionClient, setClientStatus, updateClientSpeed, getSyncData, removeClient } from '../lib/mikrotik.js';
import { restartBot } from '../lib/bot.js';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.GEMINI_API_KEY || 'super-secret-isp-key';

// Middleware to protect routes
const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'No autorizado' });

  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Sesión inválida' });
  }
};

// Login Route
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const adminUser = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_user') as any;
  const adminPass = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_pass') as any;

  if (username === adminUser?.value && password === adminPass?.value) {
    const token = jwt.sign({ user: username }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('auth_token', token, { 
      httpOnly: true, 
      secure: false, 
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      path: '/'
    });
    return res.json({ success: true });
  }

  res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
});

router.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

router.get('/check-auth', (req, res) => {
  const token = req.cookies.auth_token;
  if (!token) return res.json({ authenticated: false });
  try {
    jwt.verify(token, JWT_SECRET);
    res.json({ authenticated: true });
  } catch {
    res.json({ authenticated: false });
  }
});

// Settings (Protected)
router.get('/settings', authenticate, (req, res) => {
  const settings = db.prepare('SELECT * FROM settings').all();
  res.json(settings);
});

router.post('/settings', authenticate, (req, res) => {
  const { mt_host, mt_port, mt_user, mt_pass, mt_interface, tg_token, tg_chat_id, admin_user, admin_pass } = req.body;
  
  if (mt_host !== undefined) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(mt_host, 'mt_host');
  if (mt_port !== undefined) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(mt_port, 'mt_port');
  if (mt_user !== undefined) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(mt_user, 'mt_user');
  if (mt_pass !== undefined) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(mt_pass, 'mt_pass');
  if (mt_interface !== undefined) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(mt_interface, 'mt_interface');
  if (tg_chat_id !== undefined) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(tg_chat_id, 'tg_chat_id');
  if (admin_user !== undefined) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(admin_user, 'admin_user');
  if (admin_pass !== undefined) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(admin_pass, 'admin_pass');
  
  if (tg_token !== undefined) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(tg_token, 'tg_token');
    restartBot();
  }
  
  res.json({ success: true });
});

router.post('/test-telegram', authenticate, async (req, res) => {
  const token = db.prepare('SELECT value FROM settings WHERE key = ?').get('tg_token') as any;
  const chatId = db.prepare('SELECT value FROM settings WHERE key = ?').get('tg_chat_id') as any;

  if (!token?.value || !chatId?.value) {
    return res.status(400).json({ error: 'Token o Chat ID no configurados' });
  }

  try {
    const { Telegraf } = await import('telegraf');
    const testBot = new Telegraf(token.value);
    const ids = chatId.value.split(',').map((id: string) => id.trim());
    
    let sentCount = 0;
    for (const id of ids) {
      if (id) {
        await testBot.telegram.sendMessage(id, '🔔 Prueba de conexión desde MikroTik Dashboard. ¡Tu bot esta funcionando!');
        sentCount++;
      }
    }
    
    res.json({ success: true, message: `Mensaje enviado a ${sentCount} ID(s)` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/test-connection', authenticate, async (req, res) => {
  try {
    const mtData = await getSyncData();
    res.json({ 
      success: true, 
      message: 'Conexión exitosa', 
      details: `${mtData.queues.length} colas encontradas` 
    });
  } catch (err: any) {
    res.status(500).json({ 
      success: false, 
      error: err.message,
      tip: 'Verifica que el servicio API esté habilitado en /ip service y que el puerto coincida con el configurado.'
    });
  }
});

// Clients (Protected)
router.get('/clients', authenticate, async (req, res) => {
  try {
    const mtData = await getSyncData();
    const { arp, queues, leases } = mtData;

    // --- LÓGICA INTELIGENTE DE AUTO-IMPORTACIÓN ---
    // 1. Filtrar Leases Estáticos con Comentarios (Clientes reales en MikroTik)
    const staticLeases = leases.filter((l: any) => l.dynamic === 'false' && l.comment);
    
    for (const l of staticLeases) {
      const mac = l['mac-address'];
      const ip = l.address;
      const name = l.comment;

      // Buscar si ya existe en la DB
      const existing = db.prepare('SELECT id FROM clients WHERE mac = ?').get(mac) as any;
      
      if (!existing) {
        // Buscar velocidad en Queues para asignar plan correcto
        const queue = queues.find((q: any) => q.target.split('/')[0] === ip || q.name === name);
        let planId = '1'; // Plan por defecto (Básico)

        if (queue) {
          const maxLimit = queue['max-limit'] || '0/0';
          const [up, down] = maxLimit.split('/');
          
          // Buscar plan que coincida con esta velocidad
          let plan = db.prepare('SELECT id FROM plans WHERE download_limit = ? AND upload_limit = ?').get(down, up) as any;
          if (!plan) {
            // Crear el plan si no existe
            planId = 'plan_' + Date.now() + Math.random().toString(36).substring(2, 5);
            db.prepare('INSERT INTO plans (id, name, download_limit, upload_limit) VALUES (?, ?, ?, ?)')
              .run(planId, `Plan ${down}`, down, up);
          } else {
            planId = plan.id;
          }
        }

        // Auto-registrar cliente detectado
        db.prepare('INSERT INTO clients (id, name, mac, ip, plan_id, status) VALUES (?, ?, ?, ?, ?, ?)')
          .run('cl_' + Date.now() + Math.random().toString(36).substring(2, 5), name, mac, ip, planId, 'active');
      }
    }

    // --- ACTUALIZACIÓN DE ESTADO EN TIEMPO REAL ---
    for (const q of queues) {
      const name = q.name;
      const ip = q.target.split('/')[0];
      
      const arpEntry = arp.find((a: any) => a.address === ip);
      const isEnabled = arpEntry ? arpEntry.disabled === 'false' : true;
      const currentStatus = isEnabled ? 'active' : 'inactive';
      
      const bytes = q.bytes || '0/0';
      const [upBytes, downBytes] = bytes.split('/');
      const totalBytes = (parseInt(upBytes) + parseInt(downBytes)).toString();

      db.prepare('UPDATE clients SET status = ?, total_bytes = ? WHERE name = ? OR ip = ?')
        .run(currentStatus, totalBytes, name, ip);
    }
  } catch (syncErr) {
    console.error('Auto-sync failed (router may be offline):', syncErr);
  }

  const clients = db.prepare(`
    SELECT clients.*, plans.name as plan_name, plans.download_limit, plans.upload_limit 
    FROM clients 
    LEFT JOIN plans ON clients.plan_id = plans.id
  `).all();
  res.json(clients);
});

router.post('/clients', authenticate, async (req, res) => {
  const { name, mac, ip, plan_id } = req.body;
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(plan_id) as any;

  try {
    await provisionClient({
      name,
      mac,
      ip,
      plan: { download: plan.download_limit, upload: plan.upload_limit }
    });

    db.prepare('INSERT INTO clients (id, name, mac, ip, plan_id, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(Date.now().toString(), name, mac, ip, plan_id, 'active');

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/clients/:id/status', authenticate, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as any;
  if (!client) return res.status(404).json({ error: 'Client not found' });

  try {
    await setClientStatus(client.ip, status === 'active');
    db.prepare('UPDATE clients SET status = ? WHERE id = ?').run(status, id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/clients/:id/plan', authenticate, async (req, res) => {
  const { id } = req.params;
  const { plan_id } = req.body;
  
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as any;
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(plan_id) as any;
  
  if (!client || !plan) return res.status(404).json({ error: 'Client or Plan not found' });

  try {
    // Update speed on MikroTik (Queue)
    await updateClientSpeed(client.name, client.ip, plan.upload_limit, plan.download_limit);
    
    // Update in local database
    db.prepare('UPDATE clients SET plan_id = ? WHERE id = ?').run(plan_id, id);
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/clients/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as any;
  
  if (!client) return res.status(404).json({ error: 'Client not found' });

  try {
    // Attempt to remove from MikroTik (Queues, ARP, Leases)
    await removeClient(client.name, client.ip, client.mac);
    
    // Remove from local database
    db.prepare('DELETE FROM clients WHERE id = ?').run(id);
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Plans (Protected)
router.get('/plans', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM plans').all());
});

// Sync (Protected)
router.get('/sync', authenticate, async (req, res) => {
  try {
    const data = await getSyncData();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import-mikrotik', authenticate, async (req, res) => {
  try {
    const data = await getSyncData();
    const { leases, queues } = data;
    
    let importedCount = 0;
    
    // 1. Process Queues (Primary source for speed/plans)
    queues.forEach((q: any) => {
      const name = q.name;
      const ip = q.target.split('/')[0];
      const maxLimit = q['max-limit'] || '0/0';
      const [up, down] = maxLimit.split('/');
      
      const lease = leases.find((l: any) => l.address === ip);
      const mac = lease ? lease['mac-address'] : '00:00:00:00:00:00';

      const existingByMac = db.prepare('SELECT id FROM clients WHERE mac = ?').get(mac) as any;
      const existingByIp = db.prepare('SELECT id FROM clients WHERE ip = ?').get(ip) as any;
      const existingByName = db.prepare('SELECT id FROM clients WHERE name = ?').get(name) as any;
      
      if (!existingByMac && !existingByIp && !existingByName) {
        let plan = db.prepare('SELECT id FROM plans WHERE download_limit = ? AND upload_limit = ?').get(down, up) as any;
        if (!plan) {
          const planId = 'plan_' + Date.now() + Math.random().toString(36).substr(2, 4);
          db.prepare('INSERT INTO plans (id, name, download_limit, upload_limit) VALUES (?, ?, ?, ?)')
            .run(planId, `Plan ${down}`, down, up);
          plan = { id: planId };
        }

        db.prepare('INSERT INTO clients (id, name, mac, ip, plan_id, status) VALUES (?, ?, ?, ?, ?, ?)')
          .run('cl_' + Date.now() + importedCount, name, mac, ip, plan.id, 'active');
        
        importedCount++;
      }
    });

    // 2. Process Static Leases with Comments (Secondary source)
    leases.filter((l: any) => l.dynamic === 'false' && l.comment).forEach((l: any) => {
      const name = l.comment;
      const mac = l['mac-address'];
      const ip = l.address;

      const existingByMac = db.prepare('SELECT id FROM clients WHERE mac = ?').get(mac) as any;
      const existingByIp = db.prepare('SELECT id FROM clients WHERE ip = ?').get(ip) as any;
      
      if (!existingByMac && !existingByIp) {
        // Look for a matching queue to get speed, else default to first plan
        const queue = queues.find((q: any) => q.target.split('/')[0] === ip || q.name === name);
        let planId = '1'; // Default plan ID if none found
        
        if (queue) {
           const [up, down] = (queue['max-limit'] || '0/0').split('/');
           const existingPlan = db.prepare('SELECT id FROM plans WHERE download_limit = ? AND upload_limit = ?').get(down, up) as any;
           if (existingPlan) planId = existingPlan.id;
        }

        db.prepare('INSERT INTO clients (id, name, mac, ip, plan_id, status) VALUES (?, ?, ?, ?, ?, ?)')
          .run('cl_' + Date.now() + importedCount, name, mac, ip, planId, 'active');
        
        importedCount++;
      }
    });

    res.json({ success: true, imported: importedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
