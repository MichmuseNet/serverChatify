import 'dotenv/config'; // Importante para leer el archivo .env
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import pg from 'pg';

const app = express();
const server = createServer(app);

// 1. Configuración de Socket.io (CORS corregido para Vercel)
// 1. Configuración de Socket.io (CORS corregido para Vercel)
const io = new Server(server, {
  connectionStateRecovery: {}, 
  cors: {
    // CAMBIO: Quita el "*" y pon tu URL de Vercel exacta
    origin: "https://app-chatify.vercel.app", 
    methods: ['GET', 'POST'],
    credentials: true
  },
  // Añadimos esto para asegurar que acepte la conexión
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
// Usamos una función autoejecutable porque 'await' fuera de async puede dar problemas en algunas versiones
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          client_offset TEXT UNIQUE,
          content TEXT
      );
    `);
    console.log('Tabla de mensajes lista o ya existente.');
  } catch (err) {
    console.error('Error al crear la tabla:', err);
  }
};
initDB();

app.get('/', (req, res) => {
  res.send('<h1>Chatify Server Online</h1>');
});

// 4. Lógica de Socket.io
io.on('connection', async (socket) => {
  console.log('Cliente conectado:', socket.id);

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
      console.error('Error recuperando mensajes:', e);
    }
  }
  
  socket.on('chat message', async (msg) => {
    try {
      const result = await pool.query(
        'INSERT INTO messages (content) VALUES ($1) RETURNING id',
        [msg]
      );
      io.emit('chat message', msg, result.rows[0].id);
    } catch (e) {
      console.error('Error insertando mensaje:', e);
    }
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado');
  });
});

// 5. Puerto configurado para Railway
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
