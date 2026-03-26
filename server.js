const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let users = new Map();
let messages = [];

// Создаем папку для загрузок
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + file.originalname;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.static('public'));
app.use('/uploads', express.static(uploadDir));

app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({
        filename: req.file.filename,
        url: `/uploads/${req.file.filename}`,
        originalName: req.file.originalname
    });
});

wss.on('connection', (ws) => {
    let userId = null;
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            switch(message.type) {
                case 'login':
                    userId = message.username;
                    users.set(ws, { username: userId, isOnline: true });
                    
                    ws.send(JSON.stringify({
                        type: 'history',
                        messages: messages.slice(-50)
                    }));
                    
                    broadcast({
                        type: 'user_joined',
                        username: userId,
                        users: Array.from(users.values()).map(u => u.username)
                    });
                    break;
                    
                case 'message':
                    const msg = {
                        id: Date.now(),
                        type: 'text',
                        username: userId,
                        text: message.text,
                        timestamp: new Date().toISOString()
                    };
                    messages.push(msg);
                    broadcast(msg);
                    break;
                    
                case 'file':
                    const fileMsg = {
                        id: Date.now(),
                        type: 'file',
                        username: userId,
                        url: message.url,
                        filename: message.filename,
                        timestamp: new Date().toISOString()
                    };
                    messages.push(fileMsg);
                    broadcast(fileMsg);
                    break;
                    
                case 'voice':
                    const voiceMsg = {
                        id: Date.now(),
                        type: 'voice',
                        username: userId,
                        url: message.url,
                        duration: message.duration,
                        timestamp: new Date().toISOString()
                    };
                    messages.push(voiceMsg);
                    broadcast(voiceMsg);
                    break;
            }
        } catch (e) {
            console.error('Ошибка обработки сообщения:', e);
        }
    });
    
    ws.on('close', () => {
        if (userId) {
            broadcast({
                type: 'user_left',
                username: userId,
                users: Array.from(users.values()).map(u => u.username)
            });
            users.delete(ws);
        }
    });
});

function broadcast(data) {
    const dataStr = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(dataStr);
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Мессенджер запущен на порту ${PORT}`);
    console.log(`Папка загрузок: ${uploadDir}`);
});
