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
    origin: process.env.FRONTEND_URL || 'https://app-chatify.vercel.app',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
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
    console.log('PostgreSQL: Tabla "messages" lista con persistencia de rooms');
  } catch (err) {
    console.error('Error crítico en DB:', err);
  }
};

initDB();

app.get('/', (req, res) => {
  res.send('<h1>Chatify Server Online - Ticket CHAT-005 Active</h1>');
});

io.on('connection', (socket) => {
  console.log('👤 Nuevo usuario conectado:', socket.id);

  socket.on('join room', async ({ username, room }) => {
    if (!room) return;

    const previousUser = connectedUsers.get(socket.id);
    if (previousUser?.room && previousUser.room !== room) {
      socket.leave(previousUser.room);
      emitUsersByRoom(previousUser.room);
    }

    socket.join(room);
    connectedUsers.set(socket.id, {
      id: socket.id,
      username: username || 'Anónimo',
      room
    });

    console.log(`${username || 'Anónimo'} se unió a la sala: ${room}`);
    emitUsersByRoom(room);

    try {
      const result = await pool.query(
        `SELECT id, content, username, room, created_at FROM messages WHERE room = $1 ORDER BY created_at ASC`,
        [room]
      );
      socket.emit('load messages', result.rows);
    } catch (e) {
      console.error('Error al cargar historial:', e);
    }
  });

  socket.on('leave room', ({ room }) => {
    if (!room) return;
    socket.leave(room);
    connectedUsers.delete(socket.id);
    emitUsersByRoom(room);
  });

  socket.on('chat message', async (messageData) => {
    const { content, username, room } = messageData;
    if (!content || content.trim() === '' || !room) return;

    try {
      const result = await pool.query(
        `INSERT INTO messages (content, username, room) VALUES ($1, $2, $3) RETURNING *`,
        [content.trim(), username || 'Anónimo', room]
      );
      io.to(room).emit('chat message', result.rows[0]);
    } catch (e) {
      console.error('Error al guardar mensaje:', e);
    }
  });

  socket.on('typing', (data) => {
    socket.to(data.room).emit('user_typing', {
      username: data.username,
      room: data.room
    });
  });

  socket.on('stop_typing', (data) => {
    socket.to(data.room).emit('user_stop_typing', {
      room: data.room
    });
  });


  socket.on('disconnect', (reason) => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      socket.to(user.room).emit('user_stop_typing', { room: user.room });
      connectedUsers.delete(socket.id);
      emitUsersByRoom(user.room);
    }
    console.log('Usuario desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});