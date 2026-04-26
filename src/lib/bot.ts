import { Telegraf, Markup } from 'telegraf';
import db from './db.js';
import { provisionClient, setClientStatus, updateClientSpeed, getSyncData } from './mikrotik.js';

let bot: Telegraf | null = null;

export async function initBot() {
  let token = process.env.TG_TOKEN || (db.prepare('SELECT value FROM settings WHERE key = ?').get('tg_token') as any)?.value;
  const chatId = process.env.TG_CHAT_ID || (db.prepare('SELECT value FROM settings WHERE key = ?').get('tg_chat_id') as any)?.value;
  
  // --- OVERRIDE MANUAL ---
  // If you want to force it directly here:
  // token = 'YOUR_NEW_TOKEN_HERE';
  // -------------------------

  if (!token) {
    console.warn('Telegram token not found in settings. Bot not initialized.');
    return;
  }

  // Stop existing instance if any
  if (bot) {
    try {
      console.log('Stopping existing Telegram bot instance...');
      await bot.stop('SIGTERM');
    } catch (e) {
      console.error('Error stopping bot:', e);
    }
  }

  bot = new Telegraf(token);

  // Auth Middleware: Only allow configured Chat IDs
  bot.use(async (ctx, next) => {
    const chatIds = (db.prepare('SELECT value FROM settings WHERE key = ?').get('tg_chat_id') as any)?.value || '';
    const allowedIds = chatIds.split(',').map((id: string) => id.trim());
    
    if (ctx.from && allowedIds.includes(ctx.from.id.toString())) {
      return next();
    }
    
    if (ctx.chat?.type === 'private') {
      ctx.reply(`🚫 No tienes acceso a este sistema.\nTu ID de Telegram es: \`${ctx.from?.id}\`\nAgrégalo en el panel web para autorizarte.`, { parse_mode: 'Markdown' });
    }
  });

  const mainKeyboard = Markup.keyboard([
    ['📊 Status', '🔍 Descubrir'],
    ['👥 Clientes', '⚡ Planes']
  ]).resize();

  // State tracker for interactive flows
  const pendingState = new Map<number, any>();

  // --- Logic Handlers ---
  const handleStatus = async (ctx: any) => {
    pendingState.delete(ctx.from.id);
    const clients = db.prepare('SELECT * FROM clients').all() as any[];
    const active = clients.filter(c => c.status === 'active').length;
    const inactive = clients.length - active;

    let msg = `📊 *ESTADO DEL SISTEMA ISP*\n\n`;
    msg += `👥 Total Clientes: ${clients.length}\n`;
    msg += `✅ Activos: ${active}\n`;
    msg += `🚫 Suspendidos: ${inactive}\n\n`;
    msg += `💡 Usa /clientes para gestionar a cada uno.`;

    ctx.reply(msg, { parse_mode: 'Markdown' });
  };

  const handleDiscovery = async (ctx: any) => {
    pendingState.delete(ctx.from.id);
    try {
      ctx.reply('🔎 Escaneando red Mikrotik...');
      const mtData = await getSyncData();
      const registeredClients = db.prepare('SELECT mac, ip FROM clients').all() as any[];
      
      const unregistered = mtData.leases.filter((lease: any) => {
        if (!lease.address || !lease['mac-address']) return false;
        const isDynamic = String(lease.dynamic) === 'true';
        const isRegistered = registeredClients.some(c => 
          (c.mac?.toLowerCase() === (lease['mac-address'] || '').toLowerCase()) || 
          (c.ip === lease.address)
        );
        return isDynamic && !isRegistered;
      });

      if (unregistered.length === 0) {
        return ctx.reply(`✅ No se encontraron nuevos dispositivos dinámicos para autorizar.\n\n📡 Total leases en Mikrotik: ${mtData.leases.length}\n👥 Clientes registrados: ${registeredClients.length}`);
      }

      ctx.reply(`📡 *Dispositivos encontrados:* ${unregistered.length}\nSelecciona uno para autorizar:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(
          unregistered.map((u: any) => [
            // Usamos un formato más compacto para la data: l|IP|MAC (sin colones)
            Markup.button.callback(`IP: ${u.address} (${u['host-name'] || 'Sin nombre'})`, `l|${u.address}|${u['mac-address'].replace(/:/g, '')}`)
          ])
        )
      });
    } catch (err: any) {
      ctx.reply(`❌ Error al descubrir: ${err.message}`);
    }
  };

  const handleClients = (ctx: any) => {
    const clients = db.prepare('SELECT * FROM clients').all() as any[];
    if (clients.length === 0) return ctx.reply('No hay clientes registrados.');

    ctx.reply('👥 *Gestión de Clientes registrados:*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(
        clients.map(c => [
          Markup.button.callback(`${c.name} (${c.ip})`, `show_client:${c.id}`)
        ])
      )
    });
  };

  const handlePlanes = (ctx: any) => {
    const plans = db.prepare('SELECT * FROM plans').all() as any[];
    let msg = '⚡ *Planes Configurados:*\n\n';
    plans.forEach(p => {
      msg += `🔹 *${p.name}:* ↓${p.download_limit} Mbps / ↑${p.upload_limit} Mbps\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown' });
  };

  bot.start((ctx) => ctx.reply('🚀 Mikrotik ISP Manager Bot Online.', mainKeyboard));

  // Handle Menu Buttons
  bot.hears('📊 Status', handleStatus);
  bot.hears('🔍 Descubrir', handleDiscovery);
  bot.hears('👥 Clientes', handleClients);
  bot.hears('⚡ Planes', handlePlanes);

  bot.command('status', handleStatus);
  bot.command('descubrir', handleDiscovery);
  bot.command('clientes', handleClients);
  bot.command('planes', handlePlanes);

  bot.command('help', (ctx) => {
    ctx.reply(
      '📋 *Comandos Disponibles:*\n\n' +
      '/status - 📊 Resumen de la red y clientes\n' +
      '/descubrir - 🔍 Buscar nuevos dispositivos (Leases)\n' +
      '/clientes - 👥 Gestionar clientes registrados\n' +
      '/planes - ⚡ Ver planes de velocidad disponibles',
      { parse_mode: 'Markdown' }
    );
  });

  // Action for choosing a device from discovery (Compact)
  bot.action(/^l\|([^|]+)\|(.+)$/, async (ctx) => {
    const [_, ip, macNoColons] = ctx.match;
    const mac = macNoColons.match(/.{1,2}/g)?.join(':') || macNoColons;
    
    pendingState.set(ctx.from!.id, { type: 'register_naming', ip, mac });
    ctx.answerCbQuery();
    ctx.reply(`📝 *IP:* ${ip}\n*MAC:* ${mac}\n\n👉 *Escribe el nombre del cliente:*`, { parse_mode: 'Markdown' });
  });

  // Handle text input for naming
  bot.on('text', async (ctx, next) => {
    const state = pendingState.get(ctx.from.id);
    if (!state || state.type !== 'register_naming') return next();

    const name = ctx.message.text.trim();
    if (name.length < 3) return ctx.reply('⚠️ El nombre es muy corto. Intenta de nuevo:');
    if (name.length > 50) return ctx.reply('⚠️ El nombre es muy largo. Intenta de nuevo:');

    state.name = name;
    state.type = 'register_planning';
    pendingState.set(ctx.from.id, state);

    const plans = db.prepare('SELECT * FROM plans').all() as any[];
    ctx.reply(`⚡ *Selecciona el plan para:* ${name}`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(
        plans.map(p => [
          // USAR ID DEL PLAN EN CALLBACK
          Markup.button.callback(`${p.name} (↓${p.download_limit} ↑${p.upload_limit})`, `l3|${p.id}`)
        ])
      )
    });
  });

  // Final confirmation of registration (State-based)
  bot.action(/^l3\|(.+)$/, async (ctx) => {
    const planId = ctx.match[1];
    const state = pendingState.get(ctx.from!.id);
    
    if (!state || state.type !== 'register_planning') {
      return ctx.answerCbQuery('Sesión expirada. Inicia de nuevo con /descubrir');
    }

    const { ip, mac, name } = state;
    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as any;

    try {
      await provisionClient({
        name,
        mac,
        ip,
        plan: { download: plan.download_limit, upload: plan.upload_limit }
      });

      db.prepare('INSERT INTO clients (id, name, mac, ip, plan_id, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(Date.now().toString(), name, mac, ip, planId, 'active');

      ctx.editMessageText(`✨ *ÉXITO:* Cliente registrado.\n👤 Nombre: ${name}\n🌐 IP: ${ip}\n⚡ Plan: ${plan.name}`, { parse_mode: 'Markdown' });
      
      // Notificar a todos los admins
      sendNotification(`🆕 *CLIENTE REGISTRADO (Bot)*\n👤 Nombre: ${name}\n🌐 IP: ${ip}\n⚡ Plan: ${plan.name}`);
      pendingState.delete(ctx.from!.id);
    } catch (err: any) {
      ctx.reply(`❌ Error en el proceso: ${err.message}`);
    }
  });

  // Action to start changing plan
  bot.action(/^change_p_start:([^:]+)$/, async (ctx) => {
    const clientId = ctx.match[1];
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as any;
    const plans = db.prepare('SELECT * FROM plans').all() as any[];
    
    if (!client) return ctx.answerCbQuery('Cliente no encontrado');

    ctx.answerCbQuery();
    ctx.editMessageText(`⚡ *Cambiar plan para:* ${client.name}\nSelecciona el nuevo plan:`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(
        plans.map(p => [
          // cp|CLID|PLID
          Markup.button.callback(`${p.name} (↓${p.download_limit} ↑${p.upload_limit})`, `cp|${clientId}|${p.id}`)
        ]).concat([[Markup.button.callback('⬅️ Cancelar', `show_client:${clientId}`)]])
      )
    });
  });

  // Confirm plan change
  bot.action(/^cp\|([^|]+)\|(.+)$/, async (ctx) => {
    const [_, clientId, planId] = ctx.match;
    const clientData = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as any;
    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as any;

    if (!clientData || !plan) return ctx.reply('❌ Error al obtener datos del cliente o plan.');

    try {
      await updateClientSpeed(clientData.name, clientData.ip, plan.upload_limit, plan.download_limit);
      db.prepare('UPDATE clients SET plan_id = ? WHERE id = ?').run(planId, clientId);
      
      ctx.editMessageText(`✅ *PLAN ACTUALIZADO:* ${clientData.name}\n🚀 Nuevo Plan: ${plan.name}`, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Volver a Detalles', `show_client:${clientId}`)]])
      });
      
      sendNotification(`⚡ *PLAN CAMBIADO (Bot)*\n👤 Cliente: ${clientData.name}\n📦 Nuevo Plan: ${plan.name}`);
    } catch (err: any) {
      ctx.reply(`❌ Error: ${err.message}`);
    }
  });

  // Client Details View
  bot.action(/^show_client:(.+)$/, async (ctx) => {
    const clientId = ctx.match[1];
    const client = db.prepare('SELECT clients.*, plans.name as plan_name FROM clients JOIN plans ON clients.plan_id = plans.id WHERE clients.id = ?').get(clientId) as any;
    
    if (!client) return ctx.reply('Cliente no encontrado.');

    const statusEmoji = client.status === 'active' ? '✅ Activo' : '🚫 Suspendido';
    const msg = `👤 *DETALLES DEL CLIENTE*\n\n` +
                `Nombre: ${client.name}\n` +
                `Dirección IP: ${client.ip}\n` +
                `MAC: ${client.mac}\n` +
                `Plan Actual: ${client.plan_name}\n` +
                `Estado: ${statusEmoji}`;

    ctx.editMessageText(msg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(client.status === 'active' ? '🚫 Cortar Acceso' : '✅ Activar Acceso', `toggle_serv:${client.id}:${client.status}`),
          Markup.button.callback('⚡ Cambiar Plan', `change_p_start:${client.id}`)
        ],
        [Markup.button.callback('⬅️ Volver a Lista', 'clientes_back')]
      ])
    });
  });

  bot.action('clientes_back', (ctx) => {
    const clients = db.prepare('SELECT * FROM clients').all() as any[];
    ctx.editMessageText('👥 *Gestión de Clientes registrados:*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(
        clients.map(c => [
          Markup.button.callback(`${c.name} (${c.ip})`, `show_client:${c.id}`)
        ])
      )
    });
  });

  // Toggle Service Status
  bot.action(/^toggle_serv:([^:]+):([^:]+)$/, async (ctx) => {
    const [_, id, currentStatus] = ctx.match;
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const client = db.prepare('SELECT ip FROM clients WHERE id = ?').get(id) as any;

    try {
      await setClientStatus(client.ip, newStatus === 'active');
      db.prepare('UPDATE clients SET status = ? WHERE id = ?').run(newStatus, id);
      ctx.answerCbQuery(`Servicio ${newStatus === 'active' ? 'ACTIVADO' : 'CORTADO'}`);
      // Refresh the view
      const updatedClient = db.prepare('SELECT clients.*, plans.name as plan_name FROM clients JOIN plans ON clients.plan_id = plans.id WHERE clients.id = ?').get(id) as any;
      const statusEmoji = updatedClient.status === 'active' ? '✅ Activo' : '🚫 Suspendido';
      const msg = `👤 *DETALLES DEL CLIENTE*\n\nNombre: ${updatedClient.name}\nIP: ${updatedClient.ip}\nMAC: ${updatedClient.mac}\nPlan: ${updatedClient.plan_name}\nEstado: ${statusEmoji}`;
      
      ctx.editMessageText(msg, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(updatedClient.status === 'active' ? '🚫 Cortar Acceso' : '✅ Activar Acceso', `toggle_serv:${updatedClient.id}:${updatedClient.status}`),
            Markup.button.callback('⚡ Cambiar Plan', `change_p_start:${updatedClient.id}`)
          ],
          [Markup.button.callback('⬅️ Volver a Lista', 'clientes_back')]
        ])
      });
    } catch (err: any) {
      ctx.reply(`❌ Error: ${err.message}`);
    }
  });

  try {
    await bot.launch();
    console.log('✅ Telegram bot started successfully with multiple admin support.');
  } catch (err: any) {
    if (err.response?.error_code === 409 || err.message?.includes('409') || err.description?.includes('conflict')) {
      console.error('❌ CRITICAL: Telegram Bot Conflict (409). Another instance is running.');
      console.error('If you are on a VPS, use: pm2 restart all OR pkill -f node');
    } else if (err.code === 'ETIMEDOUT') {
      console.error('❌ CRITICAL: Telegram API Timeout. Check internet connection.');
    } else {
      console.error('❌ Telegram bot failed to launch:', err.message || err);
    }
  }
}

export async function sendNotification(message: string) {
  if (!bot) return;
  const chatIds = (db.prepare('SELECT value FROM settings WHERE key = ?').get('tg_chat_id') as any)?.value || '';
  const ids = chatIds.split(',').map((id: string) => id.trim()).filter(Boolean);
  
  for (const id of ids) {
    try {
      await bot.telegram.sendMessage(id, message, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error(`Error sending notification to ${id}:`, err);
    }
  }
}

export async function restartBot() {
  if (bot) {
    try {
      await bot.stop('SIGTERM');
      // Esperar 2 segundos para asegurar que Telegram cierre la sesión anterior
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      console.error('Error stopping bot:', e);
    }
  }
  await initBot();
}
