import 'dotenv/config'; 
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import pg from 'pg';
import crypto from 'node:crypto';

const app = express();
const server = createServer(app);

const io = new Server(server, {
  connectionStateRecovery: {}, 
  cors: {
    origin: "https://app-chatify.vercel.app", 
    methods: ['GET', 'POST'],
    credentials: true
  },
  allowEIO3: true 
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
          client_offset TEXT UNIQUE,
          content TEXT
      );
    `);
    console.log('✅ DB Lista');
  } catch (err) {
    console.error('❌ Error DB:', err);
  }
};
initDB();

app.get('/', (req, res) => {
  res.send('Server Online');
});

io.on('connection', async (socket) => {
  console.log('👤 Usuario conectado');

  // Recuperar historial al entrar
  try {
    const result = await pool.query('SELECT id, content FROM messages ORDER BY id ASC');
    result.rows.forEach(row => {
      socket.emit('chat message', row.content, row.id);
    });
  } catch (e) {
    console.error('❌ Error recuperando:', e);
  }
  
  socket.on('chat message', async (msg) => {
    const myOffset = crypto.randomUUID(); 
    try {
      const result = await pool.query(
        'INSERT INTO messages (content, client_offset) VALUES ($1, $2) RETURNING id',
        [msg, myOffset]
      );
      // Gritamos el mensaje a todos (incluyéndote)
      io.emit('chat message', msg, result.rows[0].id);
    } catch (e) {
      console.error('❌ Error insertando:', e.message);
    }
  });
});

const PORT = process.env.PORT || 8080; 
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server en puerto ${PORT}`);
});