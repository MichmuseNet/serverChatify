import 'dotenv/config'; 
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import pg from 'pg';

const app = express();
const server = createServer(app);

const io = new Server(server, {
  connectionStateRecovery: {}, 
  cors: {
    origin: process.env.FRONTEND_URL || "https://app-chatify.vercel.app", 
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const initDB = async () => {
  try {

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          content TEXT NOT NULL,
          username VARCHAR(50) NOT NULL,
          room VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log(' PostgreSQL: Tabla "messages" lista con persistencia de rooms');
  } catch (err) {
    console.error('Error crítico en DB:', err);
  }
};
initDB();

app.get('/', (req, res) => {
  res.send('<h1>Chatify Server Online - Ticket CHAT-001 Active</h1>');
});

io.on('connection', (socket) => {
  console.log('👤 Nuevo usuario conectado:', socket.id);

  socket.on('join room', async ({ username, room }) => {
    socket.join(room);
    console.log(`** ${username} se unió a la sala: ${room}`);

    try {
      const result = await pool.query(
        'SELECT id, content, username, room, created_at FROM messages WHERE room = $1 ORDER BY created_at ASC',
        [room]
      );
      
      socket.emit('load messages', result.rows);
    } catch (e) {
      console.error('Error al cargar historial de sala:', e);
    }
  });

  socket.on('chat message', async (messageData) => {
    const { content, username, room } = messageData;

    if (!content || content.trim() === '') return;

    try {
      const result = await pool.query(
        'INSERT INTO messages (content, username, room) VALUES ($1, $2, $3) RETURNING *',
        [content, username, room]
      );
      
      const savedMessage = result.rows[0];

      io.to(room).emit('chat message', savedMessage);
      
    } catch (e) {
      console.error('Error al guardar mensaje:', e.message);
    }
  });

  socket.on('leave room', ({ room }) => {
    console.log(`🚪 Socket ${socket.id} abandonó la sala: ${room}`);
    socket.leave(room);
  });

  socket.on('disconnect', () => {
    console.log('👤 Usuario desconectado');
  });
});

const PORT = process.env.PORT || 3000; 
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`Rooms disponibles: General, Tech Talk, Random, Gaming`);
});