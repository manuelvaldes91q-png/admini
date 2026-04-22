# ISP Master - Gestión de Clientes MikroTik

Sistema de gestión de clientes para ISPs con aprovisionamiento automático y monitoreo de tráfico en tiempo real.

## Características
- **Dashboard estilo Grafana**: Interfaz técnica y profesional.
- **Auto-Sync**: Sincronización automática con MikroTik (Leases, ARP, Colas).
- **Control de Acceso**: Bloqueo/unbloqueo vía ARP Binding.
- **Monitoreo de Tráfico**: Visualización de consumo en tiempo real por cliente.
- **Bots de Telegram**: Integración opcional.

## Guía de Instalación en VPS

### 1. Preparar el Entorno
Asegúrate de tener Node.js 20+ instalado.
```bash
# Actualizar sistema e instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Clonar e Instalar
```bash
git clone https://github.com/manuelvaldes91q-png/admini.git
cd admini
npm install
```

### 3. Configurar Variables de Entorno
Crea un archivo `.env`:
```bash
PORT=3001
NODE_ENV=production
GEMINI_API_KEY=tu_clave_de_seguridad
```

### 4. Compilar el Frontend
```bash
npm run build
```

### 5. Iniciar con PM2 (Recomendado)
```bash
sudo npm install -g pm2
pm2 start server.ts --name "isp-admin" --interpreter ./node_modules/.bin/tsx
pm2 save
pm2 startup
```

### 6. Configurar Firewall
```bash
sudo ufw allow 3001
```

## Credenciales por Defecto
- **Usuario**: `admin`
- **Contraseña**: `admin123`
*(Cámbialas inmediatamente en la sección de Ajustes dentro del panel)*.
