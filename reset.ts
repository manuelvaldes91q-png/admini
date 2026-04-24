import Database from 'better-sqlite3';
import fs from 'fs';

const DB_PATH = 'isp_manager.db';

console.log('🧹 Iniciando reset de la aplicación...');

if (fs.existsSync(DB_PATH)) {
  try {
    const db = new Database(DB_PATH);
    db.exec(`
      DROP TABLE IF EXISTS settings;
      DROP TABLE IF EXISTS clients;
      DROP TABLE IF EXISTS plans;
    `);
    console.log('✅ Base de datos limpiada correctamente.');
  } catch (err) {
    console.error('❌ Error al limpiar la base de datos:', err);
    console.log('Intentando borrar el archivo directamente...');
    fs.unlinkSync(DB_PATH);
    console.log('✅ Archivo borrado.');
  }
} else {
  console.log('ℹ️ No se encontró ninguna base de datos previa.');
}

console.log('\n🚀 Listo. La próxima vez que inicies la app se creará todo desde cero.');
console.log('Comando sugerido: npm run build && npm run start');
