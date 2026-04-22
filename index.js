import 'dotenv/config'; 
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import pg from 'pg';

const app = express();
const server = createServer(app);

// Configuración del servidor Socket.io
const io = new Server(server, {
  connectionStateRecovery: {}, 
  cors: {
    // Asegúrate de que este sea el link de TU frontend en Vercel
    origin: "https://app-chatify.vercel.app", 
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Configuración de la base de datos (PostgreSQL)
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Inicialización de la tabla (Simplificada para evitar errores de UNIQUE)
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          content TEXT
      );
    `);
    console.log('✅ Base de Datos conectada y tabla lista');
  } catch (err) {
    console.error('❌ Error crítico en DB:', err);
  }
};
initDB();

app.get('/', (req, res) => {
  res.send('<h1>Chatify Server Online</h1>');
});

io.on('connection', async (socket) => {
  console.log('👤 Usuario conectado:', socket.id);

  // 1. Recuperar historial al entrar
  try {
    const result = await pool.query('SELECT id, content FROM messages ORDER BY id ASC');
    result.rows.forEach(row => {
      // Enviamos el mensaje y su ID al cliente
      socket.emit('chat message', row.content, row.id);
    });
  } catch (e) {
    console.error('❌ Error recuperando historial:', e);
  }
  
  // 2. Escuchar nuevos mensajes
  socket.on('chat message', async (msg) => {
    // Evitamos mensajes vacíos
    if (!msg || msg.trim() === '') return;

    try {
      // Insertamos solo el contenido (el ID se genera solo)
      const result = await pool.query(
        'INSERT INTO messages (content) VALUES ($1) RETURNING id',
        [msg]
      );
      
      const lastId = result.rows[0].id;

      // Gritamos el mensaje a todos los conectados (incluyendo al que lo envió)
      io.emit('chat message', msg, lastId);
      
    } catch (e) {
      console.error('❌ Error insertando mensaje:', e.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('👤 Usuario desconectado');
  });
});

// Puerto para Railway
const PORT = process.env.PORT || 3000; 
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});