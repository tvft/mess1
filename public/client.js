let ws;
let username = localStorage.getItem('username');
let reconnectAttempts = 0;

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
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log('Подключение к WebSocket:', wsUrl);
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket подключен');
        reconnectAttempts = 0;
        ws.send(JSON.stringify({
            type: 'login',
            username: username
        }));
    };
    
    ws.onmessage = (event) => {
        console.log('Получено сообщение:', event.data);
        try {
            const data = JSON.parse(event.data);
            handleMessage(data);
        } catch (e) {
            console.error('Ошибка парсинга:', e);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket ошибка:', error);
    };
    
    ws.onclose = () => {
        console.log('WebSocket закрыт, переподключение через 3 секунды...');
        setTimeout(connectWebSocket, 3000);
    };
}

function handleMessage(data) {
    console.log('Обработка сообщения:', data.type);
    switch(data.type) {
        case 'history':
            data.messages.forEach(msg => displayMessage(msg));
            break;
        case 'message':
            displayMessage(data);
            break;
        case 'file':
            displayFileMessage(data);
            break;
        case 'voice':
            displayVoiceMessage(data);
            break;
        case 'user_joined':
        case 'user_left':
            if (data.users) updateOnlineUsers(data.users);
            addSystemMessage(`${data.username} ${data.type === 'user_joined' ? 'присоединился' : 'покинул'} чат`);
            break;
    }
}

function displayMessage(msg) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.username === username ? 'sent' : 'received'}`;
    
    messageDiv.innerHTML = `
        <div class="username">${escapeHtml(msg.username)}</div>
        <div class="message-content">${escapeHtml(msg.text)}</div>
        <div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>
    `;
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function displayFileMessage(msg) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.username === username ? 'sent' : 'received'}`;
    
    messageDiv.innerHTML = `
        <div class="username">${escapeHtml(msg.username)}</div>
        <div class="message-content">
            <img src="${msg.url}" alt="image" style="max-width: 200px; border-radius: 10px;">
            <div>${msg.filename}</div>
        </div>
        <div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>
    `;
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function displayVoiceMessage(msg) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.username === username ? 'sent' : 'received'}`;
    
    messageDiv.innerHTML = `
        <div class="username">${escapeHtml(msg.username)}</div>
        <div class="message-content">
            <audio controls src="${msg.url}"></audio>
            <div>Длительность: ${msg.duration} сек</div>
        </div>
        <div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>
    `;
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateOnlineUsers(users) {
    const usersDiv = document.getElementById('onlineUsers');
    usersDiv.innerHTML = users.filter(u => u !== username).map(u => 
        `<div onclick="startCall('${u}')">📞 ${escapeHtml(u)}</div>`
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
        if (file) {
            await uploadFile(file);
        }
    };
    
    document.getElementById('voiceBtn').onclick = () => {
        document.getElementById('voiceModal').style.display = 'block';
        startRecording();
    };
    
    document.getElementById('callBtn').onclick = () => {
        const target = prompt('Введите имя пользователя для звонка:');
        if (target) startCall(target);
    };
    
    document.getElementById('videoCallBtn').onclick = () => {
        const target = prompt('Введите имя пользователя для видеозвонка:');
        if (target) startVideoCall(target);
    };
    
    // СМАЙЛИКИ
    const emojiBtn = document.getElementById('emojiBtn');
    if (emojiBtn) {
        emojiBtn.onclick = () => {
            const picker = document.getElementById('emojiPicker');
            picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
        };
    }
    
    const emojis = document.querySelectorAll('.emoji-list span');
    emojis.forEach(emoji => {
        emoji.onclick = () => {
            const input = document.getElementById('messageInput');
            input.value += emoji.textContent;
            input.focus();
            document.getElementById('emojiPicker').style.display = 'none';
        };
    });
    
    // Закрытие модальных окон
    document.querySelectorAll('.modal .modal-content button').forEach(btn => {
        if (btn.id !== 'startRecordBtn' && btn.id !== 'stopRecordBtn') {
            btn.onclick = () => {
                document.getElementById('voiceModal').style.display = 'none';
                document.getElementById('callModal').style.display = 'none';
            };
        }
    });
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (text && ws && ws.readyState === WebSocket.OPEN) {
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
    
    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'file',
                url: data.url,
                filename: data.originalName
            }));
        }
    } catch (error) {
        console.error('Ошибка загрузки файла:', error);
        alert('Ошибка загрузки файла');
    }
}

let mediaRecorder;
let audioChunks = [];

async function startRecording() {
    try {
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
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'voice',
                    url: data.url,
                    duration: Math.round(audioBlob.size / 16000)
                }));
            }
            
            document.getElementById('voiceModal').style.display = 'none';
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        document.getElementById('startRecordBtn').disabled = true;
        document.getElementById('stopRecordBtn').disabled = false;
        document.getElementById('recordStatus').textContent = 'Запись...';
        
        document.getElementById('stopRecordBtn').onclick = () => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                document.getElementById('startRecordBtn').disabled = false;
                document.getElementById('stopRecordBtn').disabled = true;
                document.getElementById('recordStatus').textContent = '';
            }
        };
    } catch (error) {
        console.error('Ошибка записи:', error);
        alert('Не удалось получить доступ к микрофону');
    }
}

// Звонки (упрощенная версия)
async function startCall(target) {
    alert(`Звонок пользователю ${target} (функция в разработке для хостинга)`);
}

async function startVideoCall(target) {
    alert(`Видеозвонок пользователю ${target} (функция в разработке для хостинга)`);
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

// Запуск при загрузке
window.addEventListener('DOMContentLoaded', init);
