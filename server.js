const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let onlineUsers = 0;
let waitingUsers = []; // Người dùng đang chờ ghép đôi
let activeRooms = {}; // Danh sách các phòng và thông tin liên quan

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    onlineUsers++;
    io.emit('userCount', onlineUsers); // Cập nhật số người online

    console.log(`User connected: ${socket.id}`);
    
    // Khi người dùng nhấn nút "Match"
    socket.on('match', () => {
        if (waitingUsers.length > 0) {
            // Có người đang chờ, ghép đôi
            const matchedUser = waitingUsers.shift();
            const roomName = matchedUser.room || `room-${matchedUser.id}`;
            socket.join(roomName);
            matchedUser.socket.join(roomName);

            // Cập nhật phòng đang hoạt động
            activeRooms[roomName] = [matchedUser.socket, socket];
            socket.room = roomName;

            // Thông báo matched
            io.to(roomName).emit('startChat', 'Matched! Start chatting.');

            console.log(`Matched room: ${roomName}`);
        } else {
            // Không có ai chờ, tạo phòng mới
            const roomName = `room-${socket.id}`;
            socket.join(roomName);
            socket.room = roomName;
            waitingUsers.push({ id: socket.id, socket, room: roomName });

            socket.emit('waitingForMatch', 'Waiting for another user...');
            console.log(`Waiting for match: ${socket.id}`);
        }
    });

    // Xử lý tin nhắn
    socket.on('message', (msg) => {
        const roomName = socket.room;
        if (roomName) {
            let sender = 'user'; // Mặc định là người gửi là user
            // Kiểm tra xem người gửi là người đã được ghép đôi hay chưa
            if (activeRooms[roomName]) {
                const usersInRoom = activeRooms[roomName];
                if (usersInRoom[0].id === socket.id) {
                    sender = 'matched'; // Người ghép đôi
                }
            }

            // Gửi tin nhắn đến room với thông tin sender (người gửi)
            io.to(roomName).emit('chat message', msg, sender);
        }
    });

    // Xử lý khi nhấn nút "Exit"
    socket.on('exit', () => {
        const roomName = socket.room;
        if (roomName) {
            // Gửi thông báo cả hai người rời phòng
            io.to(roomName).emit('chat message', 'Both users have exited the chat.', 'system');

            // Xóa phòng khỏi danh sách
            if (activeRooms[roomName]) {
                activeRooms[roomName].forEach(userSocket => {
                    userSocket.leave(roomName);
                    userSocket.emit('returnToHome', 'You have exited the chat.');
                });
                delete activeRooms[roomName];
            }
        }

        // Loại bỏ socket khỏi danh sách chờ
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
        socket.leave(roomName);
        socket.room = null;
        console.log(`User exited: ${socket.id}`);
    });

    // Xử lý ngắt kết nối
    socket.on('disconnect', () => {
        onlineUsers--;
        io.emit('userCount', onlineUsers); // Cập nhật số người online

        // Xóa socket khỏi danh sách chờ
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);

        console.log(`User disconnected: ${socket.id}`);
    });
});

// Khởi động server
server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
