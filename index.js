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
    origin: [process.env.FRONTEND_URL, 'http://localhost:5173'].filter(Boolean), 
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const connectedUsers = new Map();

const getUsersByRoom = (room) => {
  return Array.from(connectedUsers.values()).filter((user) => user.room === room);
};

const emitUsersByRoom = (room) => {
  const users = getUsersByRoom(room);
  io.to(room).emit('room users', users);
};

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
    console.log('✅ Base de datos verificada y lista');
  } catch (err) {
    console.error('❌ Error en DB:', err);
  }
};

initDB();

app.get('/', (req, res) => {
  res.send('<h1>Chatify Server Online</h1>');
});

io.on('connection', (socket) => {
  console.log('👤 Usuario conectado:', socket.id);

  socket.on('join room', async ({ username, room }) => {
    if (!room) return;
    socket.join(room);
    connectedUsers.set(socket.id, { id: socket.id, username: username || 'Anónimo', room });
    
    emitUsersByRoom(room);

    try {
    
      const result = await pool.query(
        `SELECT id, content, username, room, created_at FROM messages WHERE room = $1 ORDER BY created_at ASC`,
        [room]
      );
      socket.emit('load messages', result.rows);
    } catch (e) { 
      console.error('❌ Error historial:', e.message); 
    }
  });

  socket.on('chat message', async (messageData) => {
    const { content, username, room } = messageData;
    if (!content || !room) return;
    try {

      const result = await pool.query(
        `INSERT INTO messages (content, username, room) VALUES ($1, $2, $3) RETURNING *`,
        [content.trim(), username || 'Anónimo', room]
      );
      io.to(room).emit('chat message', result.rows[0]);
    } catch (e) { 
      console.error('❌ Error mensaje:', e.message); 
    }
  });

  
  socket.on('typing', (data) => {
    io.to(data.room).emit('user_typing', {
      username: data.username,
      room: data.room,
      senderId: data.senderId
    });
  });

  socket.on('stop_typing', (data) => {
    io.to(data.room).emit('user_stop_typing', {
      room: data.room,
      senderId: data.senderId
    });
  });

  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      io.to(user.room).emit('user_stop_typing', { room: user.room, senderId: socket.id });
      connectedUsers.delete(socket.id);
      emitUsersByRoom(user.room);
    }
    console.log('👋 Usuario desconectado');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor activo en puerto ${PORT}`);
});