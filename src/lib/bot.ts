import { Telegraf } from 'telegraf';
import db from './db.js';
import { provisionClient, setClientStatus, updateClientSpeed } from './mikrotik.js';

let bot: Telegraf | null = null;

export function initBot() {
  const token = db.prepare('SELECT value FROM settings WHERE key = ?').get('tg_token') as any;
  
  if (!token?.value) {
    console.warn('Telegram token not found in settings. Bot not initialized.');
    return;
  }

  bot = new Telegraf(token.value);

  bot.start((ctx) => ctx.reply('Bienvenido al Gestor MikroTik. Usa /help para ver comandos.'));

  bot.command('help', (ctx) => {
    ctx.reply(
      'Comandos disponibles:\n' +
      '/status - Ver lista de clientes y estado\n' +
      '/cortar [ip] - Deshabilitar internet\n' +
      '/activar [ip] - Habilitar internet\n' +
      '/plan [ip] [plan_id] - Cambiar plan de velocidad\n' +
      '/nuevo [nombre] [mac] [ip] [plan_id] - Registrar nuevo cliente'
    );
  });

  bot.command('status', (ctx) => {
    const clients = db.prepare('SELECT * FROM clients').all() as any[];
    if (clients.length === 0) return ctx.reply('No hay clientes registrados.');

    let msg = 'Estado de Clientes:\n';
    clients.forEach(c => {
      msg += `👤 ${c.name} - ${c.ip} (${c.status === 'active' ? '✅' : '❌'})\n`;
    });
    ctx.reply(msg);
  });

  bot.command('cortar', async (ctx) => {
    const ip = ctx.message.text.split(' ')[1];
    if (!ip) return ctx.reply('Uso: /cortar [ip]');

    try {
      await setClientStatus(ip, false);
      db.prepare('UPDATE clients SET status = ? WHERE ip = ?').run('inactive', ip);
      ctx.reply(`🚫 Internet cortado para el IP: ${ip}`);
    } catch (err: any) {
      ctx.reply(`❌ Error: ${err.message}`);
    }
  });

  bot.command('activar', async (ctx) => {
    const ip = ctx.message.text.split(' ')[1];
    if (!ip) return ctx.reply('Uso: /activar [ip]');

    try {
      await setClientStatus(ip, true);
      db.prepare('UPDATE clients SET status = ? WHERE ip = ?').run('active', ip);
      ctx.reply(`✅ Internet activado para el IP: ${ip}`);
    } catch (err: any) {
      ctx.reply(`❌ Error: ${err.message}`);
    }
  });

  bot.command('nuevo', async (ctx) => {
    const params = ctx.message.text.split(' ');
    if (params.length < 5) return ctx.reply('Uso: /nuevo [nombre] [mac] [ip] [plan_id]');

    const [_, name, mac, ip, planId] = params;
    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as any;

    if (!plan) return ctx.reply('Plan no encontrado.');

    try {
      await provisionClient({
        name,
        mac,
        ip,
        plan: {
          download: plan.download_limit,
          upload: plan.upload_limit
        }
      });

      db.prepare('INSERT INTO clients (id, name, mac, ip, plan_id, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(Date.now().toString(), name, mac, ip, planId, 'active');

      ctx.reply(`✨ Cliente ${name} creado y provisionado con éxito.`);
    } catch (err: any) {
      ctx.reply(`❌ Error: ${err.message}`);
    }
  });

  bot.launch();
  console.log('Telegram bot started.');
}

export function restartBot() {
  if (bot) {
    // bot.stop(); // Stop might hang if not careful
  }
  initBot();
}
