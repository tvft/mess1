let ws;
let username = localStorage.getItem('username');

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

function updateOnlineUsers(users) {
    const usersDiv = document.getElementById('onlineUsers');
    usersDiv.innerHTML = users.filter(u => u !== username).map(u => 
        `<div>${escapeHtml(u)}</div>`
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

window.addEventListener('DOMContentLoaded', init);
