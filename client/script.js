const socket = io('http://localhost:3000', {
    withCredentials: true,
    transports: ['websocket', 'polling']
});
let username = localStorage.getItem('username') || '';
let messages = JSON.parse(localStorage.getItem('messages')) || [];
let chatOpen = JSON.parse(localStorage.getItem('chatOpen')) || false;
let inactivityTimer;
let canSendMessage = true;
let lastChatActivity = Date.now();
let adminUsername = 'Admin';

const INACTIVE_TIMEOUT = 5 * 60 * 1000;

window.onload = function() {
    const storedWelcome = localStorage.getItem('welcomeDepan');
    if (storedWelcome) {
        document.querySelector('#welcome-popup h2').textContent = storedWelcome;
    }

    // Cek apakah user sudah punya username
    username = localStorage.getItem('username');
    if (!username) {
        document.getElementById('welcome-popup').style.display = 'flex';
    } else {
        const welcomeSent = localStorage.getItem(`welcomeSent_${username}`) === 'true';
        socket.emit('join', username, welcomeSent);
        document.getElementById('welcome-popup').style.display = 'none';
        
        if (chatOpen) {
            document.getElementById('chat-box').classList.add('visible');
            startInactivityTimer();
        }
    }
    
    loadMessages();
};

function startInactivityTimer() {
    if (inactivityTimer) {
        clearInterval(inactivityTimer);
    }
    
    lastChatActivity = Date.now();
    
    inactivityTimer = setInterval(() => {
        const inactiveTime = Date.now() - lastChatActivity;
        if (chatOpen && inactiveTime >= INACTIVE_TIMEOUT && canSendMessage) {
            console.log('User inactive, closing chat...');
            closeChat();
            socket.emit('user inactive', username);
        }
    }, 1000);
}

function resetInactivityTimer() {
    lastChatActivity = Date.now();
    console.log('Activity timer reset:', new Date().toLocaleTimeString()); // Untuk debugging
}

function closeChat() {
    const messagesContainer = document.getElementById('messages');
    
    chatOpen = false;
    canSendMessage = false;
    localStorage.setItem('chatOpen', JSON.stringify(chatOpen));

    // Hapus pesan sistem yang mungkin sudah ada
    const existingSystemMessage = messagesContainer.querySelector('.system-message');
    if (existingSystemMessage) {
        existingSystemMessage.remove();
    }

    // Tambahkan pesan sistem dengan tombol restart
    const inactiveMessage = document.createElement('div');
    inactiveMessage.className = 'system-message';
    inactiveMessage.innerHTML = `
        <p>Obrolan telah ditutup karena tidak aktif selama 5 menit.</p>
        <button class="restart-chat-btn" onclick="restartChat()">Mulai obrolan lagi</button>
    `;
    
    messagesContainer.appendChild(inactiveMessage);
    scrollToBottom();
    
    // Disable input pesan
    disableMessageInput();
    
    if (inactivityTimer) {
        clearInterval(inactivityTimer);
    }
}

function disableMessageInput() {
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const uploadButton = document.getElementById('upload-button');
    
    messageInput.disabled = true;
    sendButton.disabled = true;
    uploadButton.disabled = true;
    
    messageInput.style.opacity = '0.5';
    sendButton.style.opacity = '0.5';
    uploadButton.style.opacity = '0.5';
}

function enableMessageInput() {
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const uploadButton = document.getElementById('upload-button');
    
    messageInput.disabled = false;
    sendButton.disabled = false;
    uploadButton.disabled = false;
    
    messageInput.style.opacity = '1';
    sendButton.style.opacity = '1';
    uploadButton.style.opacity = '1';
}

function restartChat() {
    const chatBox = document.getElementById('chat-box');
    const inactiveMessage = chatBox.querySelector('.system-message');
    if (inactiveMessage) {
        inactiveMessage.remove();
    }
    
    chatOpen = true;
    canSendMessage = true;
    localStorage.setItem('chatOpen', JSON.stringify(chatOpen));
    
    socket.emit('join', username, true);
    enableMessageInput();
    
    // Reset dan mulai timer baru
    resetInactivityTimer();
    startInactivityTimer();
}

document.getElementById('start-chat').addEventListener('click', () => {
    const inputUsername = document.getElementById('popup-username').value.trim();
    if (inputUsername) {
        username = inputUsername;
        localStorage.setItem('username', username);
        const welcomeSent = localStorage.getItem(`welcomeSent_${username}`) === 'true';
        socket.emit('join', username, welcomeSent);
        if (!welcomeSent) {
            localStorage.setItem(`welcomeSent_${username}`, 'true');
        }
        document.getElementById('welcome-popup').style.display = 'none';
        resetInactivityTimer(); // Tambahkan ini
        startInactivityTimer();
    } else {
        alert('Masukkan username.');
    }
});

document.getElementById('chat-icon').addEventListener('click', () => {
    const chatBox = document.getElementById('chat-box');
    chatBox.classList.toggle('visible');
    chatOpen = chatBox.classList.contains('visible');
    localStorage.setItem('chatOpen', JSON.stringify(chatOpen));
    
    if (chatOpen) {
        resetInactivityTimer(); // Reset timer saat chat dibuka
        startInactivityTimer();
    } else {
        if (inactivityTimer) {
            clearInterval(inactivityTimer);
        }
    }
});

document.getElementById('send-button').addEventListener('click', () => {
    if (!canSendMessage) {
        alert('Silakan klik "Mulai obrolan lagi" untuk melanjutkan chat');
        return;
    }
    sendMessage();
    resetInactivityTimer();
});

document.getElementById('message-input').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        if (!canSendMessage) {
            alert('Silakan klik "Mulai obrolan lagi" untuk melanjutkan chat');
            return;
        }
        sendMessage();
        resetInactivityTimer();
    }
});

document.getElementById('upload-button').addEventListener('click', () => {
    if (!canSendMessage) {
        alert('Silakan klik "Mulai obrolan lagi" untuk melanjutkan chat');
        return;
    }
    document.getElementById('file-input').click();
    resetInactivityTimer();
});

document.getElementById('file-input').addEventListener('change', (event) => {
    if (!canSendMessage) {
        alert('Silakan klik "Mulai obrolan lagi" untuk melanjutkan chat');
        return;
    }
    
    const file = event.target.files[0];
    if (file) {
        const messagesContainer = document.getElementById('messages');
        const loadingEl = document.createElement('div');
        loadingEl.textContent = 'Mengupload...';
        loadingEl.className = 'loading-message';
        messagesContainer.appendChild(loadingEl);

        const formData = new FormData();
        formData.append('file', file);

        fetch('http://localhost:3000/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            loadingEl.remove();
            const message = `<img src="http://localhost:3000/server${data.filePath}" alt="Image" style="max-width: 100%;">`;
            const chatData = { 
                username, 
                message, 
                to: 'admin', 
                time: new Date().toLocaleTimeString()
            };
            socket.emit('chat message', chatData);
            displayMessage(chatData);
            saveMessage(chatData);
            resetInactivityTimer();
        })
        .catch(error => {
            loadingEl.remove();
            alert('Gagal mengupload file: ' + error.message);
            console.error('Error uploading file:', error);
        });
    }
});

function sendMessage() {
    if (!canSendMessage) {
        alert('Silakan klik "Mulai obrolan lagi" untuk melanjutkan chat');
        return;
    }
    
    const message = document.getElementById('message-input').value.trim();
    if (message === '') {
        alert('Pesan tidak boleh kosong.');
        return;
    }
    
    // Pastikan adminUsername sudah didapat
    if (!adminUsername) {
        socket.emit('get admin username');
    }
    
    const data = { 
        username, 
        message,
        to: adminUsername,
        time: new Date().toLocaleTimeString()
    };
    
    console.log('Sending message:', data); // Untuk debugging
    socket.emit('chat message', data);
    document.getElementById('message-input').value = '';
    displayMessage(data);
    saveMessage(data);
    resetInactivityTimer();
}

socket.on('admin username changed', (newAdminUsername) => {
    adminUsername = newAdminUsername;
    // Update pesan yang sudah ada
    messages = messages.map(msg => {
        if (msg.username === 'Admin' || msg.username === 'admin') {
            return { ...msg, username: newAdminUsername };
        }
        if (msg.to === 'Admin' || msg.to === 'admin') {
            return { ...msg, to: newAdminUsername };
        }
        return msg;
    });
    
    // Simpan pesan yang sudah diupdate
    localStorage.setItem('messages', JSON.stringify(messages));
    
    // Reload tampilan pesan
    loadMessages();
});


socket.on('chat message', (data) => {
    const isDuplicate = messages.some(msg => 
        msg.username === data.username && 
        msg.message === data.message && 
        msg.time === data.time
    );

    if ((data.to === username || data.username === adminUsername) && !isDuplicate) {
        displayMessage(data);
        saveMessage(data);
        resetInactivityTimer();
    }
});

socket.on('connect', () => {
    socket.emit('get admin username');
});

socket.on('admin username', (username) => {
    adminUsername = username;
});

socket.on('connect_error', (error) => {
    console.error('Koneksi error:', error);
    if (socket.io.opts.transports.indexOf('polling') === -1) {
        socket.io.opts.transports = ['polling', 'websocket'];
    }
});

socket.on('reconnect', (attemptNumber) => {
    console.log('Terhubung kembali setelah percobaan ke-', attemptNumber);
});

socket.on('reconnect_error', (error) => {
    console.error('Gagal menghubungkan kembali:', error);
});

function convertLinks(text) {
    const urlPattern = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlPattern, '<a href="$1" target="_blank">$1</a>');
}

function displayMessage(data) {
    const messagesContainer = document.getElementById('messages');
    const messageContainer = document.createElement('div');
    messageContainer.classList.add(data.username === username ? 'self' : 'other');
    messageContainer.style.marginBottom = '15px';

    const usernameElement = document.createElement('div');
    usernameElement.classList.add('username');
    usernameElement.textContent = data.username;

    const messageElement = document.createElement('div');
    messageElement.classList.add('message');

    if (/<[a-z][\s\S]*>/i.test(data.message)) {
        messageElement.innerHTML = data.message; 
    } else {
        messageElement.innerHTML = convertLinks(data.message); 
    }

    const timeElement = document.createElement('div');
    timeElement.classList.add('time');
    timeElement.textContent = data.time;

    messageContainer.appendChild(usernameElement);
    messageContainer.appendChild(messageElement);
    messageContainer.appendChild(timeElement);
    messagesContainer.appendChild(messageContainer);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function saveMessage(data) {
    const isDuplicate = messages.some(msg => 
        msg.username === data.username && 
        msg.message === data.message && 
        msg.time === data.time
    );

    if (!isDuplicate) {
        messages.push(data);
        localStorage.setItem('messages', JSON.stringify(messages));
    }
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function loadMessages() {
    const uniqueMessages = Array.from(
        new Set(messages.map(msg => JSON.stringify(msg)))
    ).map(msg => JSON.parse(msg));
    
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = '';
    
    uniqueMessages.forEach(displayMessage);
    scrollToBottom();
}

loadMessages();