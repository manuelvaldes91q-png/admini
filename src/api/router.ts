import express, { Request, Response, NextFunction } from 'express';
import db from '../lib/db.js';
import { provisionClient, setClientStatus, updateClientSpeed, getSyncData } from '../lib/mikrotik.js';
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
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 
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
  const { mt_host, mt_port, mt_user, mt_pass, mt_interface, tg_token, admin_user, admin_pass } = req.body;
  
  if (mt_host !== undefined) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(mt_host, 'mt_host');
  if (mt_port !== undefined) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(mt_port, 'mt_port');
  if (mt_user !== undefined) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(mt_user, 'mt_user');
  if (mt_pass !== undefined) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(mt_pass, 'mt_pass');
  if (mt_interface !== undefined) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(mt_interface, 'mt_interface');
  if (admin_user !== undefined) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(admin_user, 'admin_user');
  if (admin_pass !== undefined) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(admin_pass, 'admin_pass');
  
  if (tg_token !== undefined) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(tg_token, 'tg_token');
    restartBot();
  }
  
  res.json({ success: true });
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
      tip: 'Verifica que el servicio API (puerto 8728) esté habilitado en /ip service.'
    });
  }
});

// Clients (Protected)
router.get('/clients', authenticate, async (req, res) => {
  try {
    // RECONCILE START: Automatic intelligent sync with MikroTik
    const mtData = await getSyncData();
    const { leases, arp, queues } = mtData;

    // Use Queues as the primary list of active managed clients
    for (const q of queues) {
      const name = q.name;
      const ip = q.target.split('/')[0];
      const maxLimit = q['max-limit'];
      const [up, down] = maxLimit.split('/');
      
      const lease = leases.find((l: any) => l.address === ip);
      const mac = lease ? lease['mac-address'] : (arp.find((a: any) => a.address === ip)?.['mac-address'] || '00:00:00:00:00:00');
      
      const arpEntry = arp.find((a: any) => a.address === ip);
      const isEnabled = arpEntry ? arpEntry.disabled === 'false' : true;
      const currentStatus = isEnabled ? 'active' : 'inactive';
      
      // Traffic consumption from Queue stats
      const bytes = q.bytes || '0/0'; // "up/down" in bytes
      const [upBytes, downBytes] = bytes.split('/');
      const totalBytes = (parseInt(upBytes) + parseInt(downBytes)).toString();

      const existingSource = db.prepare('SELECT id, plan_id FROM clients WHERE name = ? OR ip = ?').get(name, ip) as any;

      // Find or create plan based on speed
      let plan = db.prepare('SELECT id FROM plans WHERE download_limit = ? AND upload_limit = ?').get(down, up) as any;
      if (!plan) {
        const planId = 'p_' + Math.random().toString(36).substr(2, 6);
        db.prepare('INSERT INTO plans (id, name, download_limit, upload_limit) VALUES (?, ?, ?, ?)')
          .run(planId, `Plan ${down}`, down, up);
        plan = { id: planId };
      }

      if (existingSource) {
        db.prepare('UPDATE clients SET status = ?, plan_id = ?, mac = ?, total_bytes = ? WHERE id = ?')
          .run(currentStatus, plan.id, mac, totalBytes, existingSource.id);
      } else {
        db.prepare('INSERT INTO clients (id, name, mac, ip, plan_id, status, total_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run('mt_' + Math.random().toString(36).substr(2, 6), name, mac, ip, plan.id, currentStatus, totalBytes);
      }
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
    
    // We'll use Static Leases or Queues as the primary source for clients
    // Usually, comments in MikroTik are the client names
    const importedCount = { count: 0 };
    
    // We prioritize Queues since they define the "Plan"
    queues.forEach((q: any) => {
      const name = q.name;
      const ip = q.target.split('/')[0]; // target can be "192.168.1.1/32"
      const maxLimit = q['max-limit']; // "1M/5M"
      const [up, down] = maxLimit.split('/');
      
      // Try to find the MAC from leases
      const lease = leases.find((l: any) => l.address === ip);
      const mac = lease ? lease['mac-address'] : '00:00:00:00:00:00';

      // Check if client already exists in DB
      const existing = db.prepare('SELECT id FROM clients WHERE name = ? OR ip = ?').get(name, ip);
      
      if (!existing) {
        // Find or create a matching plan
        let plan = db.prepare('SELECT id FROM plans WHERE download_limit = ? AND upload_limit = ?').get(down, up) as any;
        if (!plan) {
          const planId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
          db.prepare('INSERT INTO plans (id, name, download_limit, upload_limit) VALUES (?, ?, ?, ?)')
            .run(planId, `Plan ${down}`, down, up);
          plan = { id: planId };
        }

        db.prepare('INSERT INTO clients (id, name, mac, ip, plan_id, status) VALUES (?, ?, ?, ?, ?, ?)')
          .run(Date.now().toString() + importedCount.count, name, mac, ip, plan.id, 'active');
        
        importedCount.count++;
      }
    });

    res.json({ success: true, imported: importedCount.count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
