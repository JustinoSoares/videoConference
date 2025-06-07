const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rota principal
app.get('/', (req, res) => {
  //res.sendFile(path.join(__dirname, 'public', 'index.html'));
  return res.json({
    message: "My"  })
});

// Configuração do Socket.io
io.on('connection', (socket) => {
    console.log('Novo usuário conectado:', socket.id);
  
    socket.on('join-room', (roomId, userId) => {
      socket.join(roomId);
      console.log(`Usuário ${userId} entrou na sala ${roomId}`);
      
      // Notifica os outros usuários na sala
      socket.to(roomId).emit('user-connected', userId);
      
      // Quando recebemos um sinal de um usuário, encaminhamos para o destinatário
      socket.on('signal', ({ to, from, signal }) => {
        console.log(`Enviando sinal de ${from} para ${to}`);
        io.to(to).emit('signal', { from, signal });
      });
  
      socket.on('disconnect', () => {
        console.log(`Usuário ${userId} desconectado`);
        socket.to(roomId).emit('user-disconnected', userId);
      });
    });
  });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});