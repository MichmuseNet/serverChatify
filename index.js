import 'dotenv/config'; 
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import pg from 'pg';

const app = express();
const server = createServer(app);

// 1. Configuración de Socket.io (CORS corregido para Vercel)
const io = new Server(server, {
  connectionStateRecovery: {}, 
  cors: {
    // Asegúrate de que esta URL sea exactamente la de tu frontend
    origin: "https://app-chatify.vercel.app", 
    methods: ['GET', 'POST'],
    credentials: true
  },
  allowEIO3: true 
});

// 2. Conexión a PostgreSQL con SSL (Necesario para Railway)
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 3. Inicialización de la Base de Datos
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          client_offset TEXT UNIQUE,
          content TEXT
      );
    `);
    console.log('✅ Tabla de mensajes lista o ya existente.');
  } catch (err) {
    console.error('❌ Error al crear la tabla:', err);
  }
};
initDB();

app.get('/', (req, res) => {
  res.send('<h1>Chatify Server Online</h1>');
});

// 4. Lógica de Socket.io
io.on('connection', async (socket) => {
  console.log('👤 Cliente conectado:', socket.id);

  // Recuperación de mensajes al conectar
  if (!socket.recovered) {
    try {
      const result = await pool.query(
        'SELECT id, content FROM messages WHERE id > $1 ORDER BY id',
        [socket.handshake.auth.serverOffset || 0]
      );
      
      for (const row of result.rows) {
        socket.emit('chat message', row.content, row.id);
      }
    } catch (e) {
      console.error('❌ Error recuperando mensajes:', e);
    }
  }
  
  // Escuchar mensajes nuevos
  socket.on('chat message', async (msg) => {
    try {
      // Simplificamos el INSERT para evitar errores con client_offset si no lo usas
      const result = await pool.query(
        'INSERT INTO messages (content) VALUES ($1) RETURNING id',
        [msg]
      );
      
      const id = result.rows[0].id;
      // Emitimos a todos los clientes
      io.emit('chat message', msg, id);
      console.log(`✉️ Mensaje guardado e id generado: ${id}`);
    } catch (e) {
      console.error('❌ Error insertando mensaje en Postgres:', e.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('👤 Cliente desconectado');
  });
});

// 5. Puerto configurado para Railway
// Usamos process.env.PORT para que Railway asigne el puerto automáticamente (ej. 8080)
const PORT = process.env.PORT || 8080; 
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});