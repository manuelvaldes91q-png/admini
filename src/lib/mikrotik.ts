import { RouterOSAPI } from 'node-routeros';
import db from './db.js';

interface MTConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  interface: string;
}

function getMTConfig(): MTConfig {
  const host = db.prepare('SELECT value FROM settings WHERE key = ?').get('mt_host') as any;
  const port = db.prepare('SELECT value FROM settings WHERE key = ?').get('mt_port') as any;
  const user = db.prepare('SELECT value FROM settings WHERE key = ?').get('mt_user') as any;
  const pass = db.prepare('SELECT value FROM settings WHERE key = ?').get('mt_pass') as any;
  const iface = db.prepare('SELECT value FROM settings WHERE key = ?').get('mt_interface') as any;

  return {
    host: host?.value || '',
    port: parseInt(port?.value || '8728'),
    user: user?.value || '',
    pass: pass?.value || '',
    interface: iface?.value || 'SALIDA',
  };
}

export async function connectMT() {
  const config = getMTConfig();
  if (!config.host || !config.user) {
    throw new Error('MikroTik configuration is missing.');
  }

  const client = new RouterOSAPI({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.pass,
  });

  return client;
}

export async function provisionClient(clientData: { name: string; mac: string; ip: string; plan: { download: string; upload: string } }) {
  const client = await connectMT();
  try {
    await client.connect();

    // 1. DHCP Lease
    const leases = await client.write('/ip/dhcp-server/lease/print', [`?mac-address=${clientData.mac}`]);
    
    if (leases.length > 0) {
      const leaseId = leases[0]['.id'];
      await client.write('/ip/dhcp-server/lease/set', [
        `=.id=${leaseId}`,
        `=address=${clientData.ip}`,
        `=comment=${clientData.name}`
      ]);
      await client.write('/ip/dhcp-server/lease/make-static', [`=.id=${leaseId}`]);
    } else {
      await client.write('/ip/dhcp-server/lease/add', [
        `=address=${clientData.ip}`,
        `=mac-address=${clientData.mac}`,
        `=comment=${clientData.name}`
      ]);
    }

    // 2. ARP Entry
    const arpList = await client.write('/ip/arp/print', [`?address=${clientData.ip}`]);
    const mtConfig = getMTConfig();
    if (arpList.length > 0) {
      await client.write('/ip/arp/set', [
        `=.id=${arpList[0]['.id']}`,
        `=mac-address=${clientData.mac}`,
        `=comment=${clientData.name}`,
        `=interface=${mtConfig.interface}`,
        '=disabled=no'
      ]);
    } else {
      await client.write('/ip/arp/add', [
        `=address=${clientData.ip}`,
        `=mac-address=${clientData.mac}`,
        `=comment=${clientData.name}`,
        `=interface=${mtConfig.interface}`,
        '=disabled=no'
      ]);
    }

    // 3. Simple Queue
    const queueList = await client.write('/queue/simple/print', [`?name=${clientData.name}`]);
    const maxLimit = `${clientData.plan.upload}/${clientData.plan.download}`;

    if (queueList.length > 0) {
      await client.write('/queue/simple/set', [
        `=.id=${queueList[0]['.id']}`,
        `=target=${clientData.ip}`,
        `=max-limit=${maxLimit}`
      ]);
    } else {
      await client.write('/queue/simple/add', [
        `=name=${clientData.name}`,
        `=target=${clientData.ip}`,
        `=max-limit=${maxLimit}`
      ]);
    }

    return true;
  } finally {
    client.close();
  }
}

export async function setClientStatus(ip: string, active: boolean) {
  const client = await connectMT();
  try {
    await client.connect();
    const arpEntry = await client.write('/ip/arp/print', [`?address=${ip}`]);
    if (arpEntry.length > 0) {
      await client.write('/ip/arp/set', [
        `=.id=${arpEntry[0]['.id']}`,
        `=disabled=${active ? 'no' : 'yes'}`
      ]);
      return true;
    }
    throw new Error('ARP entry not found for IP: ' + ip);
  } finally {
    client.close();
  }
}

export async function updateClientSpeed(name: string, ip: string, upload: string, download: string) {
  const client = await connectMT();
  try {
    await client.connect();
    const queueList = await client.write('/queue/simple/print', [`?name=${name}`]);
    const maxLimit = `${upload}/${download}`;

    if (queueList.length > 0) {
      await client.write('/queue/simple/set', [
        `=.id=${queueList[0]['.id']}`,
        `=target=${ip}`,
        `=max-limit=${maxLimit}`
      ]);
      return true;
    }
    throw new Error('Queue not found for client: ' + name);
  } finally {
    client.close();
  }
}

export async function removeClient(name: string, ip: string, mac: string) {
  const client = await connectMT();
  try {
    await client.connect();

    // 1. Remove Simple Queue
    const queueList = await client.write('/queue/simple/print', [`?name=${name}`]);
    if (queueList.length > 0) {
      await client.write('/queue/simple/remove', [`=.id=${queueList[0]['.id']}`]);
    }

    // 2. Remove ARP entry
    const arpList = await client.write('/ip/arp/print', [`?address=${ip}`]);
    if (arpList.length > 0) {
      await client.write('/ip/arp/remove', [`=.id=${arpList[0]['.id']}`]);
    }

    // 3. Remove DHCP Lease
    const leaseList = await client.write('/ip/dhcp-server/lease/print', [`?mac-address=${mac}`]);
    if (leaseList.length > 0) {
      await client.write('/ip/dhcp-server/lease/remove', [`=.id=${leaseList[0]['.id']}`]);
    }

    return true;
  } catch (err) {
    console.error('Failed to remove client from MikroTik:', err);
    throw err;
  } finally {
    client.close();
  }
}

export async function getSyncData() {
  const client = await connectMT();
  try {
    await client.connect();
    const leases = await client.write('/ip/dhcp-server/lease/print');
    const arp = await client.write('/ip/arp/print');
    const queues = await client.write('/queue/simple/print');

    return { leases, arp, queues };
  } finally {
    client.close();
  }
}
