const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rastreamento de salas
const rooms = {};

io.on('connection', (socket) => {
  console.log('Novo usuário conectado:', socket.id);

  socket.on('join-room', (roomId, userName) => {
    try {
      if (!roomId || !userName) {
        throw new Error('Room ID e User Name são obrigatórios');
      }

      // Entrar na sala
      socket.join(roomId);
      
      // Registrar usuário na sala
      if (!rooms[roomId]) {
        rooms[roomId] = [];
      }
      
      const userInfo = { id: socket.id, name: userName };
      rooms[roomId].push(userInfo);

      console.log(`Usuário ${userName} entrou na sala ${roomId}`);
      
      // Notificar a sala sobre o novo usuário
      socket.to(roomId).emit('user-connected', userInfo);

      // Enviar lista de usuários existentes para o novo membro
      const otherUsers = rooms[roomId].filter(user => user.id !== socket.id);
      socket.emit('existing-users', otherUsers);

    } catch (error) {
      console.error('Erro ao entrar na sala:', error.message);
      socket.emit('error', error.message);
    }

    // Lidar com desconexão
    socket.on('disconnect', () => {
      if (roomId && rooms[roomId]) {
        const index = rooms[roomId].findIndex(user => user.id === socket.id);
        if (index !== -1) {
          const disconnectedUser = rooms[roomId][index];
          console.log(`Usuário ${disconnectedUser.name} saiu da sala ${roomId}`);
          
          // Remover usuário da sala
          rooms[roomId].splice(index, 1);
          
          // Notificar a sala
          io.to(roomId).emit('user-disconnected', disconnectedUser);

          // Limpar sala se estiver vazia
          if (rooms[roomId].length === 0) {
            delete rooms[roomId];
          }
        }
      }
    });
  });

  // Roteamento de sinais WebRTC
  socket.on('signal', ({ to, from, signal }) => {
    io.to(to).emit('signal', { from, signal });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});