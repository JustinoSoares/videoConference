document.addEventListener('DOMContentLoaded', () => {
    // Elementos DOM
    const roomIdInput = document.getElementById('roomId');
    const userNameInput = document.getElementById('userName');
    const joinBtn = document.getElementById('joinBtn');
    const createBtn = document.getElementById('createBtn');
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const muteBtn = document.getElementById('muteBtn');
    const videoBtn = document.getElementById('videoBtn');
    const shareBtn = document.getElementById('shareBtn');
    const statusDiv = document.getElementById('status');
    const errorDiv = document.getElementById('error');
  
    // Variáveis de estado
    let localStream;
    let peerConnection;
    let roomId;
    let socket;
    let currentUserId;
    let currentUserName;
    let isMuted = false;
    let isVideoOff = false;
  
    // Mostrar status
    function showStatus(message) {
      statusDiv.textContent = message;
      console.log(message);
    }
  
    // Mostrar erro
    function showError(message) {
      errorDiv.textContent = message;
      console.error(message);
      setTimeout(() => errorDiv.textContent = '', 5000);
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
        showStatus('Obtendo acesso à câmera e microfone...');
        localStream = await navigator.mediaDevices.getUserMedia({ 
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          }, 
          audio: true 
        });
        localVideo.srcObject = localStream;
        showStatus('Mídia local obtida com sucesso');
        return true;
      } catch (err) {
        showError('Erro ao acessar mídia: ' + err.message);
        return false;
      }
    }
  
    // Criar conexão peer-to-peer
    function createPeerConnection() {
      showStatus('Criando conexão peer-to-peer...');
      const configuration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
      };
  
      peerConnection = new RTCPeerConnection(configuration);
  
      // Adicionar stream local
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
  
      // Receber stream remoto
      peerConnection.ontrack = (event) => {
        showStatus('Recebendo stream remoto...');
        if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== event.streams[0].id) {
          remoteVideo.srcObject = event.streams[0];
          showStatus('Conexão estabelecida com sucesso!');
          enableControls();
        }
      };
  
      // Tratar ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
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
  
      // Tratar mudanças de estado
      peerConnection.onconnectionstatechange = () => {
        showStatus('Estado da conexão: ' + peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
          enableControls();
        }
      };
  
      peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState;
        showStatus('Estado ICE: ' + state);
        
        if (state === 'failed') {
          peerConnection.restartIce();
        } else if (state === 'disconnected') {
          setTimeout(() => {
            if (peerConnection.iceConnectionState === 'disconnected') {
              showError('Conexão perdida. Tentando reconectar...');
              reconnect();
            }
          }, 2000);
        }
      };
  
      peerConnection.onnegotiationneeded = async () => {
        showStatus('Negociação necessária...');
        try {
          await createOffer();
        } catch (err) {
          showError('Erro na negociação: ' + err.message);
        }
      };
    }
  
    // Reconectar
    function reconnect() {
      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }
      if (socket) {
        socket.emit('join-room', roomId, currentUserName);
      }
    }
  
    // Criar oferta
    async function createOffer() {
      if (!peerConnection) {
        createPeerConnection();
      }
  
      if (peerConnection.signalingState !== 'stable') {
        showStatus('Aguardando estado estável...');
        return;
      }
  
      try {
        showStatus('Criando oferta...');
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: 1,
          offerToReceiveVideo: 1
        });
        
        await peerConnection.setLocalDescription(offer);
        showStatus('Oferta criada com sucesso');
        
        socket.emit('signal', {
          to: roomId,
          from: currentUserId,
          signal: {
            type: 'offer',
            sdp: offer.sdp
          }
        });
      } catch (err) {
        showError('Erro ao criar oferta: ' + err.message);
        throw err;
      }
    }
  
    // Tratar sinal recebido
    async function handleSignal({ from, signal }) {
      if (!peerConnection) {
        createPeerConnection();
      }
  
      try {
        if (signal.type === 'offer') {
          if (peerConnection.signalingState !== 'stable') {
            showStatus('Ignorando oferta - estado não estável');
            return;
          }
  
          showStatus('Recebendo oferta de ' + from);
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
          showStatus('Resposta enviada para ' + from);
  
        } else if (signal.type === 'answer') {
          if (peerConnection.signalingState !== 'have-local-offer') {
            showStatus('Ignorando resposta - estado inválido');
            return;
          }
  
          showStatus('Recebendo resposta de ' + from);
          await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
  
        } else if (signal.type === 'candidate') {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (err) {
            showError('Erro ao adicionar ICE candidate: ' + err.message);
          }
        }
      } catch (err) {
        showError('Erro ao processar sinal: ' + err.message);
      }
    }
  
    // Inicializar Socket.io
    function initSocket() {
      socket = io();
  
      socket.on('connect', () => {
        currentUserId = socket.id;
        showStatus('Conectado ao servidor (ID: ' + currentUserId + ')');
      });
  
      socket.on('user-connected', ({ id, name }) => {
        if (id !== currentUserId) {
          showStatus(name + ' entrou na sala');
          if (!peerConnection) {
            createPeerConnection();
          }
        }
      });
  
      socket.on('existing-users', (users) => {
        if (users.length > 0) {
          showStatus('Conectando com ' + users.length + ' usuário(s) na sala...');
          if (!peerConnection) {
            createPeerConnection();
          }
        }
      });
  
      socket.on('signal', handleSignal);
  
      socket.on('user-disconnected', ({ id, name }) => {
        showStatus(name + ' saiu da sala');
        if (peerConnection) {
          peerConnection.close();
          peerConnection = null;
        }
        remoteVideo.srcObject = null;
      });
  
      socket.on('error', (message) => {
        showError(message);
      });
  
      socket.on('disconnect', () => {
        showStatus('Desconectado do servidor. Tentando reconectar...');
        setTimeout(() => {
          if (socket.disconnected) {
            initSocket();
          }
        }, 1000);
      });
    }
  
    // Entrar ou criar sala
    async function joinOrCreateRoom(isCreate) {
      currentUserName = userNameInput.value.trim();
      roomId = roomIdInput.value.trim();
  
      if (!currentUserName) {
        showError('Por favor, digite seu nome');
        return;
      }
  
      if (!isCreate && !roomId) {
        showError('Por favor, digite o ID da sala');
        return;
      }
  
      if (isCreate && !roomId) {
        roomId = Math.random().toString(36).substring(2, 8);
        roomIdInput.value = roomId;
      }
  
      showStatus((isCreate ? 'Criando' : 'Entrando na') + ' sala ' + roomId + '...');
  
      // Obter mídia local
      const mediaSuccess = await initLocalMedia();
      if (!mediaSuccess) return;
  
      // Iniciar socket
      initSocket();
  
      // Entrar na sala
      socket.emit('join-room', roomId, currentUserName);
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
      try {
        if (!localStream) return;
  
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack.readyState === 'ended') {
          // Se o compartilhamento foi encerrado, voltar para a câmera
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          const newVideoTrack = stream.getVideoTracks()[0];
          
          localStream.removeTrack(videoTrack);
          localStream.addTrack(newVideoTrack);
          localVideo.srcObject = localStream;
          
          if (peerConnection) {
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(newVideoTrack);
          }
          
          shareBtn.textContent = 'Compartilhar Tela';
          showStatus('Voltando para a câmera...');
        } else {
          // Iniciar compartilhamento de tela
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
            video: {
              displaySurface: 'browser',
              width: 1280,
              height: 720
            },
            audio: false
          });
          
          const screenTrack = screenStream.getVideoTracks()[0];
          localStream.removeTrack(videoTrack);
          localStream.addTrack(screenTrack);
          localVideo.srcObject = localStream;
          
          if (peerConnection) {
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(screenTrack);
          }
          
          shareBtn.textContent = 'Parar Compartilhamento';
          showStatus('Compartilhando tela...');
          
          // Quando o usuário para o compartilhamento
          screenTrack.onended = () => {
            toggleScreenShare();
          };
        }
      } catch (err) {
        showError('Erro no compartilhamento: ' + err.message);
      }
    }
  
    // Event listeners
    joinBtn.addEventListener('click', () => joinOrCreateRoom(false));
    createBtn.addEventListener('click', () => joinOrCreateRoom(true));
    muteBtn.addEventListener('click', toggleMute);
    videoBtn.addEventListener('click', toggleVideo);
    shareBtn.addEventListener('click', toggleScreenShare);
  });