import 'dotenv/config'; 
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import pg from 'pg';
import crypto from 'node:crypto'; // Para generar IDs únicos

const app = express();
const server = createServer(app);

// 1. Configuración de Socket.io
const io = new Server(server, {
  connectionStateRecovery: {}, 
  cors: {
    origin: "https://app-chatify.vercel.app", 
    methods: ['GET', 'POST'],
    credentials: true
  },
  allowEIO3: true 
});

// 2. Conexión a PostgreSQL
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
    console.log('✅ Base de datos lista.');
  } catch (err) {
    console.error('❌ Error DB:', err);
  }
};
initDB();

app.get('/', (req, res) => {
  res.send('<h1>Chatify Server Online</h1>');
});

// 4. Lógica de Socket.io
io.on('connection', async (socket) => {
  console.log('👤 Usuario conectado');

  // Recuperar mensajes antiguos al conectar
  if (!socket.recovered) {
    try {
      const result = await pool.query(
        'SELECT id, content FROM messages WHERE id > $1 ORDER BY id',
        [socket.handshake.auth.serverOffset || 0]
      );
      result.rows.forEach(row => {
        socket.emit('chat message', row.content, row.id);
      });
    } catch (e) {
      console.error('❌ Error al recuperar:', e);
    }
  }
  
  // Recibir y guardar mensaje
  socket.on('chat message', async (msg) => {
    const myOffset = crypto.randomUUID(); 
    try {
      const result = await pool.query(
        'INSERT INTO messages (content, client_offset) VALUES ($1, $2) RETURNING id',
        [msg, myOffset]
      );
      
      const lastId = result.rows[0].id;

      // ESTA LÍNEA ES LA CLAVE:
      // io.emit envía el mensaje a TODO EL MUNDO, incluido tú mismo.
      io.emit('chat message', msg, lastId); 
      
      console.log(`✉️ Re-transmitiendo: ${msg}`);
    } catch (e) {
      console.error('❌ Error al insertar:', e.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('👤 Usuario desconectado');
  });
});

// 5. Puerto para Railway
const PORT = process.env.PORT || 8080; 
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});