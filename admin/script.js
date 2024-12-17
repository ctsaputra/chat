const socket = io('http://localhost:3000', {
    withCredentials: true,
    transports: ['websocket', 'polling']
});
let userMessages = JSON.parse(localStorage.getItem('userMessages')) || {};
let chatList = JSON.parse(localStorage.getItem('chatList')) || [];
let historyList = JSON.parse(localStorage.getItem('historyList')) || [];
let historyMessages = JSON.parse(localStorage.getItem('historyMessages')) || {};
let username = localStorage.getItem('username') || 'admin';
let selectedUser = localStorage.getItem('selectedUser') || null;

socket.emit('join', username);

document.getElementById('admin-send-button').addEventListener('click', sendMessage);

document.getElementById('admin-message-input').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

function convertLinks(text) {
    if (!text) return '';
    // Konversi URL menjadi link yang bisa diklik
    return text.replace(
        /(https?:\/\/[^\s]+)/g, 
        '<a href="$1" target="_blank">$1</a>'
    );
}

function sendMessage() {
    const message = document.getElementById('admin-message-input').value.trim();
    if (message === '') {
        alert('Pesan tidak boleh kosong.');
        return;
    }
    if (selectedUser) {
        const data = { 
            username, 
            message, 
            to: selectedUser, 
            time: new Date().toLocaleTimeString()
        };
        socket.emit('chat message', data);
        document.getElementById('admin-message-input').value = '';
        
        // Tampilkan pesan langsung tanpa menunggu event dari server
        if (!userMessages[selectedUser]) {
            userMessages[selectedUser] = [];
        }
        userMessages[selectedUser].push(data);
        saveMessages();
        displayMessage(data);
        scrollToBottom();
        
    } else {
        alert('Pilih pengguna untuk mengirim pesan.');
    }
}

document.getElementById('settings-header').addEventListener('click', () => {
    const settingsList = document.getElementById('settings-list');
    settingsList.style.display = settingsList.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('set-username-btn').addEventListener('click', () => {
    showSettingsForm('username');
});

document.getElementById('set-welcome-btn').addEventListener('click', () => {
    showSettingsForm('welcome');
});

document.getElementById('set-welcome-front-btn').addEventListener('click', () => {
    showSettingsForm('welcome-front');
});

function showSettingsForm(type) {
    const messagesContainer = document.getElementById('admin-messages');
    let title, placeholder, buttonText, saveFunction;
    
    switch(type) {
        case 'username':
            title = 'Setel Username';
            placeholder = 'Masukkan username baru';
            buttonText = 'Simpan Username';
            saveFunction = saveUsername;
            break;
        case 'welcome':
            title = 'Setel Pesan Selamat Datang';
            placeholder = 'Masukkan pesan selamat datang';
            buttonText = 'Simpan Pesan';
            saveFunction = saveWelcomeMessage;
            break;
        case 'welcome-front':
            title = 'Setel Teks Welcome Depan';
            placeholder = 'Masukkan teks welcome depan';
            buttonText = 'Simpan Teks';
            saveFunction = saveWelcomeFront;
            break;
    }

    const html = `
        <div class="settings-container">
            <h2>${title}</h2>
            <textarea id="settings-input" placeholder="${placeholder}"></textarea>
            <button onclick="saveSettings('${type}')">${buttonText}</button>
        </div>
    `;

    messagesContainer.innerHTML = html;
}

function saveSettings(type) {
    const input = document.getElementById('settings-input').value.trim();
    if (!input) {
        alert('Input tidak boleh kosong');
        return;
    }

    switch(type) {
        case 'username':
            const oldUsername = username;
            
            // Update pesan di userMessages
            Object.keys(userMessages).forEach(user => {
                // Jika ada chat dengan username lama, pindahkan ke username baru
                if (user === oldUsername) {
                    userMessages[input] = userMessages[user];
                    delete userMessages[user];
                }
                
                // Update username di semua pesan
                userMessages[user].forEach(msg => {
                    // Update username di pesan
                    if (msg.username === oldUsername || msg.username === 'Admin' || msg.username === 'admin') {
                        msg.username = input;
                    }
                    // Update username dalam pesan selamat datang
                    if (msg.message && msg.message.includes('Selamat datang')) {
                        msg.message = msg.message.replace(/Admin|admin|${oldUsername}/, input);
                    }
                    // Update field 'to' jika ada
                    if (msg.to === oldUsername || msg.to === 'Admin' || msg.to === 'admin') {
                        msg.to = input;
                    }
                });
            });

            // Update history messages
            Object.keys(historyMessages).forEach(user => {
                historyMessages[user].messages.forEach(msg => {
                    if (msg.username === oldUsername || msg.username === 'Admin' || msg.username === 'admin') {
                        msg.username = input;
                    }
                    if (msg.to === oldUsername || msg.to === 'Admin' || msg.to === 'admin') {
                        msg.to = input;
                    }
                });
            });

            // Update chat list
            const index = chatList.indexOf(oldUsername);
            if (index > -1) {
                chatList[index] = input;
            }
            
            // Update username dan simpan ke localStorage
            username = input;
    localStorage.setItem('username', username);
    localStorage.setItem('userMessages', JSON.stringify(userMessages));
    localStorage.setItem('chatList', JSON.stringify(chatList));
    localStorage.setItem('historyMessages', JSON.stringify(historyMessages));
            
            // Reconnect socket dengan username baru dan broadcast ke semua client
            socket.emit('admin username change', {oldUsername, newUsername: input});
            socket.emit('join', username);
            
            alert('Username telah diubah menjadi ' + username);
            
            // Refresh tampilan
            loadChatList();
            if (selectedUser) {
                displayMessages(selectedUser);
            }
            break;
            
        case 'welcome':
            localStorage.setItem('welcomeMessage', input);
            alert('Pesan selamat datang disimpan.');
            break;
            
        case 'welcome-front':
            socket.emit('set welcome depan', input);
            localStorage.setItem('welcomeDepan', input);
            alert('Teks welcome depan telah diatur.');
            break;
    }
}

document.getElementById('admin-upload-button').addEventListener('click', () => {
    document.getElementById('admin-file-input').click();
});

document.getElementById('admin-file-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const formData = new FormData();
        formData.append('file', file);

        fetch('http://localhost:3000/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            const message = `<img src="http://localhost:3000/server${data.filePath}" alt="Image" style="max-width: 100%;">`;
            const chatData = { 
                username, 
                message, 
                to: selectedUser, 
                time: new Date().toLocaleTimeString()
            };
            socket.emit('chat message', chatData);
            displayMessage(chatData);
            saveMessage(selectedUser, chatData);
        })
        .catch(error => console.error('Error uploading file:', error));
    }
});

socket.on('connect', () => {
    console.log('Connected to server');
    socket.emit('join', username);
});

socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
});

socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    // Coba reconnect setelah 5 detik
    setTimeout(() => {
        socket.connect();
    }, 5000);
});

socket.on('chat message', (data) => {
    console.log('Received message:', data);
    
    const targetUser = data.to === username ? data.username : data.to;
    
    // Inisialisasi array pesan jika belum ada
    if (!userMessages[targetUser]) {
        userMessages[targetUser] = [];
        if (!chatList.includes(targetUser)) {
            chatList.push(targetUser);
            loadChatList();
        }
    }
    
    // Tambahkan pesan baru
    userMessages[targetUser].push(data);
    
    // Update localStorage
    localStorage.setItem('userMessages', JSON.stringify(userMessages));
    
    // Update tampilan jika chat yang aktif
    if (selectedUser === targetUser) {
        displayMessages(targetUser);
    }
    
    // Update chat list
    loadChatList();
});


socket.on('user joined', (username) => {
    console.log('User joined:', username);
    if (!chatList.includes(username)) {
        chatList.push(username);
        loadChatList();
    }
});

socket.on('inactive user', (data) => {
    if (typeof data === 'string') {
        moveToHistory(data, new Date().toLocaleString());
        return;
    }

    let message = '';
    switch(data.reason) {
        case 'timeout':
            message = 'Obrolan telah ditutup karena pengguna tidak aktif selama 5 menit.';
            break;
        case 'closed':
            message = 'Obrolan telah ditutup oleh pengguna.';
            break;
        case 'disconnected':
            message = 'Pengguna telah terputus dari obrolan.';
            break;
        default:
            message = 'Obrolan telah ditutup.';
    }

    const now = Date.now();
    const recentMessages = userMessages[data.username] || [];
    const hasDuplicateNotification = recentMessages.some(msg => {
        return msg.type === 'system-notification' && 
               msg.message === message && 
               now - new Date(msg.timestamp).getTime() < 5000;
    });

    if (!hasDuplicateNotification) {
        const systemNotification = {
            type: 'system-notification',
            message: message,
            time: new Date().toLocaleTimeString(),
            timestamp: new Date().getTime()
        };
        
        if (!userMessages[data.username]) {
            userMessages[data.username] = [];
        }
        
        userMessages[data.username].push(systemNotification);
        saveMessages();
        
        if (data.username === selectedUser) {
            displayMessages(selectedUser);
            scrollToBottom();
        }
    }

    setTimeout(() => {
        moveToHistory(data.username, data.timestamp);
    }, 1000);
});

function loadHistoryList() {
    const historyListElement = document.getElementById('history-list-items');
    historyListElement.innerHTML = '';
    
    Object.keys(historyMessages).forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        li.onclick = () => {
            selectedUser = user;
            localStorage.setItem('selectedUser', user);
            displayHistoryMessages(user);
            
            // Hapus highlight dari semua item
            document.querySelectorAll('#history-list-items li').forEach(item => {
                item.classList.remove('active');
            });
            // Highlight item yang dipilih
            li.classList.add('active');
        };
        
        historyListElement.appendChild(li);
    });
}

function saveUsername(newUsername) {
    // Update username di semua pesan
    Object.keys(userMessages).forEach(user => {
        if (user === username) {
            userMessages[newUsername] = userMessages[user];
            delete userMessages[user];
        }
        userMessages[user].forEach(msg => {
            if (msg.username === username) {
                msg.username = newUsername;
            }
            // Update username dalam pesan selamat datang
            if (msg.message && msg.message.includes('Selamat datang')) {
                msg.message = msg.message.replace(/Admin|admin|${username}/, newUsername);
            }
        });
    });

    // Update username
    username = newUsername;
    localStorage.setItem('username', username);
    localStorage.setItem('userMessages', JSON.stringify(userMessages));

    // Emit event untuk bergabung dengan username baru
    socket.emit('join', username);
    alert('Username telah diubah menjadi ' + username);

    // Refresh tampilan pesan
    if (selectedUser) {
        displayMessages(selectedUser);
    }
    loadChatList();
}

function saveWelcomeMessage(message) {
    localStorage.setItem('welcomeMessage', message);
    alert('Pesan selamat datang disimpan.');
}

function saveWelcomeFront(message) {
    socket.emit('set welcome depan', message);
    localStorage.setItem('welcomeDepan', message);
    alert('Teks welcome depan telah diatur.');
}

async function moveToHistory(username, timestamp) {
    // Hapus dari chat list UI
    const chatItem = document.getElementById(`chat-${username}`);
    if (chatItem) {
        chatItem.remove();
    }

    // Hapus dari chat list array
    const index = chatList.indexOf(username);
    if (index > -1) {
        chatList.splice(index, 1);
        localStorage.setItem('chatList', JSON.stringify(chatList));
    }

    // Pindahkan pesan ke history
    const messages = userMessages[username] || [];
    historyMessages[username] = {
        messages: messages.map(msg => ({
            ...msg,
            username: msg.username === localStorage.getItem('username') ? 'Admin' : msg.username
        })),
        timestamp: timestamp
    };

    // Hapus dari userMessages
    delete userMessages[username];

    // Simpan ke localStorage
    localStorage.setItem('userMessages', JSON.stringify(userMessages));
    localStorage.setItem('historyMessages', JSON.stringify(historyMessages));

    // Tambahkan ke history list
    if (!historyList.some(item => item.username === username)) {
        const historyItem = { username, timestamp };
        historyList.push(historyItem);
        localStorage.setItem('historyList', JSON.stringify(historyList));
        
        // Update UI history list
        const historyListElement = document.getElementById('history-list-items');
        const historyItemElement = document.createElement('li');
        historyItemElement.textContent = `${username} (${timestamp})`;
        historyItemElement.onclick = () => showHistoryChat(username);
        historyListElement.appendChild(historyItemElement);
    }

    // Reset selected user jika perlu
    if (selectedUser === username) {
        selectedUser = null;
        localStorage.removeItem('selectedUser');
        document.getElementById('admin-messages').innerHTML = '';
    }

    // Simpan perubahan ke server
    try {
        await fetch('http://localhost:3000/admin/update-chat-status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            credentials: 'include',
            body: JSON.stringify({
                username,
                status: 'history',
                timestamp
            })
        });
    } catch (err) {
        console.error('Error updating chat status:', err);
    }
}

function showHistoryChat(username) {
    const messagesContainer = document.getElementById('admin-messages');
    messagesContainer.innerHTML = '';
    
    if (historyMessages[username]) {
        historyMessages[username].messages.forEach(msg => {
            // Pastikan pesan dari admin ditampilkan dengan username 'Admin'
            const messageData = {
                ...msg,
                username: msg.username === localStorage.getItem('username') ? 'Admin' : msg.username
            };
            displayMessage(messageData);
        });
    }
    scrollToBottom();
}

function addChatToList(username) {
    // Cek username valid
    if (!username || username.trim() === '') {
        return;
    }

    const chatListElement = document.getElementById('chat-list-items');
    let chatItem = document.getElementById(`chat-${username}`);

    if (!chatItem) {
        chatItem = document.createElement('li');
        chatItem.id = `chat-${username}`;
        chatItem.addEventListener('click', () => {
            selectedUser = username;
            localStorage.setItem('selectedUser', username);
            displayMessages(username);
            markMessagesAsRead(username);
            updateUnreadCount(username);
            
            chatItem.classList.remove('unread');
            chatItem.style.color = '#000';
        });
        chatListElement.appendChild(chatItem);
    }

    updateUnreadCount(username);
}

function updateUnreadCount(username) {
    const chatItem = document.getElementById(`chat-${username}`);
    if (chatItem && userMessages[username]) {
        const unreadCount = userMessages[username].filter(msg => 
            !msg.read && 
            msg.username !== 'admin' && 
            msg.username !== 'Admin' &&
            msg.username !== localStorage.getItem('username')  // Mengabaikan pesan dari username saat ini
        ).length;
        
        chatItem.textContent = username;
        if (unreadCount > 0) {
            chatItem.textContent = `${username} (${unreadCount})`;
            chatItem.classList.add('unread');
            chatItem.style.color = '#ff0000';
        } else {
            chatItem.classList.remove('unread');
            chatItem.style.color = '#000';
        }
    }
}

function markMessagesAsRead(username) {
    if (userMessages[username]) {
        let hasUnreadMessages = false;
        userMessages[username].forEach(msg => {
            if (!msg.read && 
                msg.username !== 'admin' && 
                msg.username !== 'Admin' &&
                msg.username !== localStorage.getItem('username')) {
                msg.read = true;
                hasUnreadMessages = true;
            }
        });
        
        if (hasUnreadMessages) {
            // Simpan ke localStorage
            localStorage.setItem('userMessages', JSON.stringify(userMessages));
            // Simpan ke server
            saveMessagesToServer(username);
        }
        
        updateUnreadCount(username);
    }
}

function displayMessages(user) {
    const messagesContainer = document.getElementById('admin-messages');
    messagesContainer.innerHTML = '';

    if (!userMessages[user] || !Array.isArray(userMessages[user])) {
        return;
    }

    userMessages[user].forEach(data => {
        const messageWrapper = document.createElement('div');
        messageWrapper.classList.add('message-wrapper');
        messageWrapper.classList.add(data.username === username ? 'sent' : 'received');

        // Username di luar box
        const usernameDiv = document.createElement('div');
        usernameDiv.classList.add('username');
        usernameDiv.textContent = data.username === username ? 'Anda' : data.username;
        messageWrapper.appendChild(usernameDiv);

        // Box pesan
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        messageDiv.textContent = data.message;
        messageWrapper.appendChild(messageDiv);

        // Waktu di luar box
        const timeDiv = document.createElement('div');
        timeDiv.classList.add('time');
        timeDiv.textContent = data.time;
        messageWrapper.appendChild(timeDiv);

        messagesContainer.appendChild(messageWrapper);
    });

    scrollToBottom();
}

function displayMessage(data) {
    const messagesContainer = document.getElementById('admin-messages');
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', data.username === username ? 'sent' : 'received');
    
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');
    
    // Tambah username jika pesan dari user lain
    if (data.username !== username) {
        const usernameDiv = document.createElement('div');
        usernameDiv.classList.add('username');
        usernameDiv.textContent = data.username;
        messageContent.appendChild(usernameDiv);
    }
    
    // Handle pesan dengan gambar
    if (data.message.includes('<img')) {
        messageContent.innerHTML = data.message;
    } else {
        const messageText = document.createElement('div');
        messageText.classList.add('message-text');
        messageText.textContent = data.message;
        messageContent.appendChild(messageText);
    }
    
    const timeDiv = document.createElement('div');
    timeDiv.classList.add('message-time');
    timeDiv.textContent = data.time;
    messageContent.appendChild(timeDiv);
    
    messageDiv.appendChild(messageContent);
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

// Tambahkan fungsi untuk menampilkan popup
function showImagePopup(imageSrc) {
    // Hapus popup yang mungkin sudah ada
    const existingPopup = document.querySelector('.image-popup-overlay');
    if (existingPopup) {
        existingPopup.remove();
    }

    // Buat elemen popup
    const popup = document.createElement('div');
    popup.className = 'image-popup-overlay';
    popup.style.display = 'flex';
    
    const content = document.createElement('div');
    content.className = 'image-popup-content';
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-popup';
    closeBtn.innerHTML = '×';
    closeBtn.onclick = () => popup.remove();
    
    const img = document.createElement('img');
    img.src = imageSrc;
    
    content.appendChild(closeBtn);
    content.appendChild(img);
    popup.appendChild(content);
    
    // Tambahkan event untuk menutup popup saat klik di luar gambar
    popup.onclick = (e) => {
        if (e.target === popup) {
            popup.remove();
        }
    };
    
    document.body.appendChild(popup);
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('admin-messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function saveMessage(username, data) {
    if (!userMessages[username]) {
        userMessages[username] = [];
    }
    userMessages[username].push(data);
    saveMessages();
}

function saveMessages() {
    localStorage.setItem('userMessages', JSON.stringify(userMessages));
    
    // Auto-save ke server
    fetch('http://localhost:3000/admin/save-chat-data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': 'http://127.0.0.1:3001'
        },
        credentials: 'include',
        body: JSON.stringify({
            userMessages,
            chatList,
            historyMessages
        })
    }).catch(err => console.error('Error auto-saving:', err));
}

function saveChatList() {
    localStorage.setItem('chatList', JSON.stringify(chatList));
}

function loadMessages() {
    if (selectedUser && userMessages[selectedUser]) {
        const messagesContainer = document.getElementById('admin-messages');
        messagesContainer.innerHTML = '';
        userMessages[selectedUser].forEach(displayMessage);
        scrollToBottom();
    }
}

function loadChatList() {
    const chatListElement = document.getElementById('chat-list-items');
    chatListElement.innerHTML = '';
    
    chatList.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        
        // Tambahkan jumlah pesan belum dibaca jika ada
        const unreadCount = userMessages[user] ? 
            userMessages[user].filter(msg => !msg.read && msg.username !== username).length : 0;
            
        if (unreadCount > 0) {
            li.textContent += ` (${unreadCount})`;
            li.classList.add('unread');
        }
        
        li.onclick = () => {
            selectedUser = user;
            localStorage.setItem('selectedUser', user);
            
            // Tandai semua pesan sebagai telah dibaca
            if (userMessages[user]) {
                userMessages[user].forEach(msg => msg.read = true);
                localStorage.setItem('userMessages', JSON.stringify(userMessages));
            }
            
            displayMessages(user);
            loadChatList(); // Refresh list untuk update unread count
            
            // Hapus highlight dari semua item
            document.querySelectorAll('#chat-list-items li').forEach(item => {
                item.classList.remove('active');
            });
            // Highlight item yang dipilih
            li.classList.add('active');
        };
        
        if (user === selectedUser) {
            li.classList.add('active');
        }
        
        chatListElement.appendChild(li);
    });
}

function cleanupStorage() {
    // Bersihkan chat list dari username kosong
    const cleanChatList = chatList.filter(username => {
        return username && 
               username.trim() !== '' && 
               userMessages[username] && 
               userMessages[username].length > 0;
    });
    
    chatList.length = 0;
    chatList.push(...cleanChatList);
    localStorage.setItem('chatList', JSON.stringify(cleanChatList));
    
    // Bersihkan pesan dari username kosong
    Object.keys(userMessages).forEach(key => {
        if (!key || 
            key.trim() === '' || 
            !userMessages[key] || 
            userMessages[key].length === 0) {
            delete userMessages[key];
        }
    });
    
    localStorage.setItem('userMessages', JSON.stringify(userMessages));
}

async function initializeAdmin() {
    try {
        // Ambil username admin
        const usernameResponse = await fetch('http://localhost:3000/admin/username', {
            credentials: 'include'
        });
        if (usernameResponse.ok) {
            const data = await usernameResponse.json();
            username = data.username;
            localStorage.setItem('username', username);
        }

        // Ambil data chat
        const chatDataResponse = await fetch('http://localhost:3000/admin/chat-data', {
            credentials: 'include'
        });
        if (chatDataResponse.ok) {
            const data = await chatDataResponse.json();
            
            // Update data
            userMessages = data.userMessages || {};
            chatList = data.chatList || [];
            historyMessages = data.historyMessages || {};
            
            // Simpan ke localStorage
            localStorage.setItem('userMessages', JSON.stringify(userMessages));
            localStorage.setItem('chatList', JSON.stringify(chatList));
            localStorage.setItem('historyMessages', JSON.stringify(historyMessages));
        }

        // Join socket room
        socket.emit('join', username);
        
        // Update UI
        loadChatList();
        loadHistoryList();
        if (selectedUser) {
            displayMessages(selectedUser);
        }

    } catch (err) {
        console.error('Error initializing admin:', err);
        handleInitError();
    }
}

function handleInitError() {
    username = localStorage.getItem('username') || 'admin';
    userMessages = JSON.parse(localStorage.getItem('userMessages')) || {};
    chatList = JSON.parse(localStorage.getItem('chatList')) || [];
    historyMessages = JSON.parse(localStorage.getItem('historyMessages')) || {};
    
    loadChatList();
    loadHistoryList();
    socket.emit('join', username);
}

async function initAdminUsername() {
    try {
        const response = await fetch('http://localhost:3000/admin/username');
        const data = await response.json();
        username = data.username;
        localStorage.setItem('username', username);
        
        // Emit join setelah mendapatkan username
        socket.emit('join', username);
        
        // Update tampilan jika perlu
        loadChatList();
        if (selectedUser) {
            displayMessages(selectedUser);
        }
    } catch (err) {
        console.error('Error fetching admin username:', err);
        username = localStorage.getItem('username') || 'admin';
    }
}

setInterval(() => {
    // Simpan ke localStorage
    localStorage.setItem('userMessages', JSON.stringify(userMessages));
    localStorage.setItem('chatList', JSON.stringify(chatList));
    localStorage.setItem('historyMessages', JSON.stringify(historyMessages));
    
    // Simpan ke server
    saveChatDataToServer();
}, 10000);

async function saveChatDataToServer() {
    try {
        const response = await fetch('http://localhost:3000/admin/save-chat-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                userMessages,
                chatList,
                historyMessages
            })
        });

        if (!response.ok) {
            throw new Error('Failed to save data');
        }
    } catch (err) {
        console.error('Error saving data:', err);
    }
}

window.addEventListener('beforeunload', async () => {
    try {
        await saveChatDataToServer();
    } catch (err) {
        console.error('Error saving chat data before unload:', err);
    }
});

window.onload = async function() {
    await initializeAdmin();
    cleanupStorage();
    loadMessages();
    loadChatList();
    loadHistoryList();
};