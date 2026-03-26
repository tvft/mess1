let ws;
let username = localStorage.getItem('username');
let currentCall = null;
let localStream = null;
let peerConnection = null;
let audioChunks = [];

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

function init() {
    if (!username) {
        username = prompt('Введите ваше имя:', 'Пользователь_' + Math.floor(Math.random() * 1000));
        localStorage.setItem('username', username);
    }
    
    document.getElementById('currentUser').textContent = username;
    connectWebSocket();
    setupEventListeners();
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'login',
            username: username
        }));
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };
    
    ws.onclose = () => {
        setTimeout(connectWebSocket, 3000);
    };
}

function handleMessage(data) {
    switch(data.type) {
        case 'history':
            data.messages.forEach(msg => displayMessage(msg));
            break;
        case 'message':
            displayMessage(data);
            break;
        case 'file':
            displayMessage(data);
            break;
        case 'voice':
            displayMessage(data);
            break;
        case 'user_joined':
        case 'user_left':
            updateOnlineUsers(data.users);
            addSystemMessage(`${data.username} ${data.type === 'user_joined' ? 'присоединился' : 'покинул'} чат`);
            break;
        case 'call_offer':
            handleCallOffer(data);
            break;
        case 'call_answer':
            handleCallAnswer(data);
            break;
        case 'ice_candidate':
            handleIceCandidate(data);
            break;
    }
}

function displayMessage(msg) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.username === username ? 'sent' : 'received'}`;
    
    let content = '';
    if (msg.type === 'text') {
        content = `<div class="message-content">${escapeHtml(msg.text)}</div>`;
    } else if (msg.type === 'file') {
        content = `
            <div class="message-content">
                <img src="${msg.url}" alt="image" style="max-width: 300px">
                <div>${msg.filename}</div>
            </div>
        `;
    } else if (msg.type === 'voice') {
        content = `
            <div class="message-content">
                <audio controls src="${msg.url}"></audio>
                <div>Длительность: ${msg.duration} сек</div>
            </div>
        `;
    }
    
    messageDiv.innerHTML = `
        <div class="username">${escapeHtml(msg.username)}</div>
        ${content}
        <div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>
    `;
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateOnlineUsers(users) {
    const usersDiv = document.getElementById('onlineUsers');
    usersDiv.innerHTML = users.filter(u => u !== username).map(u => 
        `<div onclick="startCall('${u}', false)">${escapeHtml(u)}</div>`
    ).join('');
}

function setupEventListeners() {
    document.getElementById('sendBtn').onclick = sendMessage;
    document.getElementById('messageInput').onkeypress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };
    
    document.getElementById('fileBtn').onclick = () => {
        document.getElementById('fileInput').click();
    };
    
    document.getElementById('fileInput').onchange = async (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            await uploadFile(file);
        }
    };
    
    document.getElementById('voiceBtn').onclick = () => {
        document.getElementById('voiceModal').style.display = 'block';
    };
    
    document.getElementById('callBtn').onclick = () => {
        const target = prompt('Введите имя пользователя для звонка:');
        if (target) startCall(target, false);
    };
    
    document.getElementById('videoCallBtn').onclick = () => {
        const target = prompt('Введите имя пользователя для видеозвонка:');
        if (target) startCall(target, true);
    };
    
    // СМАЙЛИКИ
    const emojiBtn = document.getElementById('emojiBtn');
    if (emojiBtn) {
        emojiBtn.onclick = (e) => {
            e.stopPropagation();
            const picker = document.getElementById('emojiPicker');
            if (picker) {
                picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
            }
        };
    }
    
    document.addEventListener('click', (e) => {
        const picker = document.getElementById('emojiPicker');
        const emojiBtn = document.getElementById('emojiBtn');
        if (picker && emojiBtn && !picker.contains(e.target) && e.target !== emojiBtn) {
            picker.style.display = 'none';
        }
    });
    
    const emojis = document.querySelectorAll('.emoji-list span');
    emojis.forEach(emoji => {
        emoji.onclick = () => {
            const input = document.getElementById('messageInput');
            if (input) {
                input.value += emoji.textContent;
                input.focus();
                const picker = document.getElementById('emojiPicker');
                if (picker) picker.style.display = 'none';
            }
        };
    });
    
    setupVoiceRecording();
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (text) {
        ws.send(JSON.stringify({
            type: 'message',
            text: text
        }));
        input.value = '';
    }
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/upload', {
        method: 'POST',
        body: formData
    });
    
    const data = await response.json();
    ws.send(JSON.stringify({
        type: 'file',
        url: data.url,
        filename: data.originalName
    }));
}

function setupVoiceRecording() {
    let mediaRecorder;
    let audioChunks = [];
    
    document.getElementById('startRecordBtn').onclick = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('file', audioBlob, 'voice.webm');
            
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            ws.send(JSON.stringify({
                type: 'voice',
                url: data.url,
                duration: Math.round(audioBlob.size / 16000)
            }));
            
            document.getElementById('voiceModal').style.display = 'none';
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        document.getElementById('startRecordBtn').disabled = true;
        document.getElementById('stopRecordBtn').disabled = false;
        document.getElementById('recordStatus').textContent = 'Запись...';
    };
    
    document.getElementById('stopRecordBtn').onclick = () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            document.getElementById('startRecordBtn').disabled = false;
            document.getElementById('stopRecordBtn').disabled = true;
            document.getElementById('recordStatus').textContent = '';
        }
    };
}

async function startCall(target, isVideo) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: isVideo,
            audio: true
        });
        
        document.getElementById('localVideo').srcObject = localStream;
        document.getElementById('callModal').style.display = 'block';
        
        peerConnection = new RTCPeerConnection(configuration);
        
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        peerConnection.ontrack = (event) => {
            document.getElementById('remoteVideo').srcObject = event.streams[0];
        };
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send(JSON.stringify({
                    type: 'ice_candidate',
                    target: target,
                    candidate: event.candidate
                }));
            }
        };
        
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        ws.send(JSON.stringify({
            type: 'call_offer',
            target: target,
            offer: offer,
            isVideo: isVideo
        }));
        
        document.getElementById('callStatus').textContent = `Звонок ${target}...`;
    } catch (error) {
        console.error('Ошибка звонка:', error);
    }
}

function handleCallOffer(data) {
    if (confirm(`${data.from} звонит вам. Ответить?`)) {
        answerCall(data);
    }
}

async function answerCall(data) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: data.isVideo,
            audio: true
        });
        
        document.getElementById('localVideo').srcObject = localStream;
        document.getElementById('callModal').style.display = 'block';
        
        peerConnection = new RTCPeerConnection(configuration);
        
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        peerConnection.ontrack = (event) => {
            document.getElementById('remoteVideo').srcObject = event.streams[0];
        };
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send(JSON.stringify({
                    type: 'ice_candidate',
                    target: data.from,
                    candidate: event.candidate
                }));
            }
        };
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        ws.send(JSON.stringify({
            type: 'call_answer',
            target: data.from,
            answer: answer
        }));
        
        document.getElementById('callStatus').textContent = `Разговор с ${data.from}`;
    } catch (error) {
        console.error('Ошибка ответа:', error);
    }
}

function handleCallAnswer(data) {
    if (peerConnection) {
        peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        document.getElementById('callStatus').textContent = 'Соединение установлено';
    }
}

function handleIceCandidate(data) {
    if (peerConnection) {
        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addSystemMessage(text) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message received';
    messageDiv.innerHTML = `
        <div class="message-content" style="background: #f0f0f0; text-align: center;">
            <em>${escapeHtml(text)}</em>
        </div>
    `;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Запуск при загрузке страницы
window.addEventListener('DOMContentLoaded', init);