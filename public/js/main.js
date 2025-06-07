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
  
    // Configurações
    let localStream;
    let remoteStream;
    let peerConnection;
    let roomId;
    let isMuted = false;
    let isVideoOff = false;
    let isScreenSharing = false;
    let socket;
  
    // Inicializar Socket.io
    function initSocket() {
      socket = io();
  
      socket.on('user-connected', (userId) => {
        console.log('Usuário conectado:', userId);
        createPeerConnection();
      });
  
      socket.on('user-disconnected', (userId) => {
        console.log('Usuário desconectado:', userId);
        if (peerConnection) {
          peerConnection.close();
        }
        remoteVideo.srcObject = null;
      });
  
      socket.on('signal', (from, signal) => {
        if (from !== socket.id) {
          if (signal.type === 'offer') {
            handleOffer(signal);
          } else if (signal.type === 'answer') {
            handleAnswer(signal);
          } else if (signal.type === 'candidate') {
            handleCandidate(signal);
          }
        }
      });
    }
  
    // Inicializar mídia local
    async function initLocalMedia() {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });
        localVideo.srcObject = localStream;
      } catch (err) {
        console.error('Erro ao acessar mídia:', err);
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
        remoteVideo.srcObject = event.streams[0];
      };
  
      // Tratar ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('signal', roomId, socket.id, {
            type: 'candidate',
            candidate: event.candidate
          });
        }
      };
    }
  
    // Criar oferta
    async function createOffer() {
      try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('signal', roomId, socket.id, {
          type: 'offer',
          sdp: offer.sdp
        });
      } catch (err) {
        console.error('Erro ao criar oferta:', err);
      }
    }
  
    // Tratar oferta recebida
    async function handleOffer(offer) {
      if (!peerConnection) {
        createPeerConnection();
      }
      
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit('signal', roomId, socket.id, {
          type: 'answer',
          sdp: answer.sdp
        });
      } catch (err) {
        console.error('Erro ao tratar oferta:', err);
      }
    }
  
    // Tratar resposta recebida
    async function handleAnswer(answer) {
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error('Erro ao tratar resposta:', err);
      }
    }
  
    // Tratar ICE candidate recebido
    async function handleCandidate(candidate) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Erro ao tratar ICE candidate:', err);
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
      
      socket.emit('join-room', roomId, socket.id);
      
      if (isCreate) {
        createPeerConnection();
      }
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
      if (!isScreenSharing) {
        try {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
            video: true,
            audio: true 
          });
          
          // Substituir a track de vídeo
          const videoTrack = screenStream.getVideoTracks()[0];
          const sender = peerConnection.getSenders().find(s => 
            s.track.kind === 'video'
          );
          
          if (sender) {
            sender.replaceTrack(videoTrack);
          }
          
          // Atualizar stream local
          localStream.getVideoTracks().forEach(track => track.stop());
          localStream.removeTrack(localStream.getVideoTracks()[0]);
          localStream.addTrack(videoTrack);
          localVideo.srcObject = localStream;
          
          // Configurar para parar o compartilhamento quando o usuário parar
          videoTrack.onended = () => {
            toggleScreenShare();
          };
          
          isScreenSharing = true;
          shareBtn.textContent = 'Parar Compartilhamento';
        } catch (err) {
          console.error('Erro ao compartilhar tela:', err);
        }
      } else {
        // Voltar para a câmera
        try {
          const cameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: true 
          });
          
          const videoTrack = cameraStream.getVideoTracks()[0];
          const sender = peerConnection.getSenders().find(s => 
            s.track.kind === 'video'
          );
          
          if (sender) {
            sender.replaceTrack(videoTrack);
          }
          
          // Atualizar stream local
          localStream.getVideoTracks().forEach(track => track.stop());
          localStream.removeTrack(localStream.getVideoTracks()[0]);
          localStream.addTrack(videoTrack);
          localVideo.srcObject = localStream;
          
          isScreenSharing = false;
          shareBtn.textContent = 'Compartilhar Tela';
        } catch (err) {
          console.error('Erro ao voltar para a câmera:', err);
        }
      }
    }
  
    // Event listeners
    joinBtn.addEventListener('click', () => joinOrCreateRoom(false));
    createBtn.addEventListener('click', () => joinOrCreateRoom(true));
    muteBtn.addEventListener('click', toggleMute);
    videoBtn.addEventListener('click', toggleVideo);
    shareBtn.addEventListener('click', toggleScreenShare);
  });