// Substitua todo o conteúdo do main.js por este código:

document.addEventListener('DOMContentLoaded', () => {
    // Elementos DOM
    const roomIdInput = document.getElementById('roomId');
    const joinBtn = document.getElementById('joinBtn');
    const createBtn = document.getElementById('createBtn');
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const muteBtn = document.getElementById('muteBtn');
    const videoBtn = document.getElementById('videoBtn');
    const shareBtn = document.getElementById('shareBtn');
  
    // Variáveis de estado
    let localStream;
    let peerConnection;
    let roomId;
    let socket;
    let isMuted = false;
    let isVideoOff = false;
    let currentUserId;
  
    // Inicializar Socket.io
    function initSocket() {
      socket = io("https://8b81-102-214-36-208.ngrok-free.app");
  
      socket.on('connect', () => {
        currentUserId = socket.id;
        console.log('Conectado com ID:', currentUserId);
        enableControls();
      });
  
      socket.on('user-connected', (userId) => {
        console.log('Usuário remoto conectado:', userId);
        if (userId !== currentUserId) {
          createPeerConnection();
        }
      });
  
      socket.on('user-disconnected', (userId) => {
        console.log('Usuário remoto desconectado:', userId);
        if (peerConnection) {
          peerConnection.close();
          peerConnection = null;
        }
        remoteVideo.srcObject = null;
      });
  
      socket.on('signal', ({ from, signal }) => {
        if (from !== currentUserId) {
          handleSignal(signal);
        }
      });
    }
  
    // Habilitar controles
    function enableControls() {
      muteBtn.disabled = false;
      videoBtn.disabled = false;
      shareBtn.disabled = false;
    }
  
    // Inicializar mídia local
    async function initLocalMedia() {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });
        localVideo.srcObject = localStream;
        console.log('Stream local obtido com sucesso');
      } catch (err) {
        console.error('Erro ao acessar mídia:', err);
        alert('Não foi possível acessar a câmera/microfone. Verifique as permissões.');
      }
    }
  
    // Criar conexão peer-to-peer
    function createPeerConnection() {
      const configuration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      };
  
      peerConnection = new RTCPeerConnection(configuration);
  
      // Adicionar stream local
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
  
      // Receber stream remoto
      peerConnection.ontrack = (event) => {
        console.log('Recebendo stream remoto');
        remoteVideo.srcObject = event.streams[0];
      };
  
      // Tratar ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Enviando ICE candidate');
          socket.emit('signal', { 
            to: roomId, 
            from: currentUserId, 
            signal: {
              type: 'candidate',
              candidate: event.candidate
            }
          });
        }
      };
  
      // Se somos o segundo usuário a entrar, criamos uma oferta
      createOffer();
    }
  
    // Criar oferta
    async function createOffer() {
      try {
        console.log('Criando oferta...');
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('signal', { 
          to: roomId, 
          from: currentUserId, 
          signal: {
            type: 'offer',
            sdp: offer.sdp
          }
        });
      } catch (err) {
        console.error('Erro ao criar oferta:', err);
      }
    }
  
    // Tratar sinal recebido
    async function handleSignal(signal) {
      try {
        if (signal.type === 'offer') {
          console.log('Recebida oferta, criando resposta...');
          if (!peerConnection) {
            createPeerConnection();
          }
          await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          
          socket.emit('signal', { 
            to: roomId, 
            from: currentUserId, 
            signal: {
              type: 'answer',
              sdp: answer.sdp
            }
          });
        } else if (signal.type === 'answer') {
          console.log('Recebida resposta...');
          await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
        } else if (signal.type === 'candidate') {
          console.log('Recebido ICE candidate...');
          await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (err) {
        console.error('Erro ao processar sinal:', err);
      }
    }
  
    // Entrar ou criar sala
    async function joinOrCreateRoom(isCreate) {
      roomId = roomIdInput.value || Math.random().toString(36).substring(2, 8);
      
      if (isCreate) {
        roomIdInput.value = roomId;
      }
      
      await initLocalMedia();
      initSocket();
      
      socket.emit('join-room', roomId, currentUserId);
      
      // Desabilitar botões até a conexão ser estabelecida
      muteBtn.disabled = true;
      videoBtn.disabled = true;
      shareBtn.disabled = true;
    }
  
    // Alternar áudio
    function toggleMute() {
      if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        audioTracks.forEach(track => {
          track.enabled = !track.enabled;
        });
        isMuted = !isMuted;
        muteBtn.textContent = isMuted ? 'Desmutar' : 'Mutar';
      }
    }
  
    // Alternar vídeo
    function toggleVideo() {
      if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        videoTracks.forEach(track => {
          track.enabled = !track.enabled;
        });
        isVideoOff = !isVideoOff;
        videoBtn.textContent = isVideoOff ? 'Ligar Vídeo' : 'Desligar Vídeo';
      }
    }
  
    // Compartilhar tela
    async function toggleScreenShare() {
      // Implementação do compartilhamento de tela (opcional)
      alert('Funcionalidade de compartilhamento de tela não implementada nesta versão');
    }
  
    // Event listeners
    joinBtn.addEventListener('click', () => joinOrCreateRoom(false));
    createBtn.addEventListener('click', () => joinOrCreateRoom(true));
    muteBtn.addEventListener('click', toggleMute);
    videoBtn.addEventListener('click', toggleVideo);
    shareBtn.addEventListener('click', toggleScreenShare);
  });