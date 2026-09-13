const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");

dotenv.config();

const Message = require("./models/Message");

const app = express();

app.use(cors());
app.use(express.json());

/* =========================
   FILE UPLOAD SETUP
========================= */

const storage = multer.diskStorage({
 destination: (req, file, cb) => {
  cb(null, "uploads");
 },
 filename: (req, file, cb) => {
  cb(null, Date.now() + "-" + file.originalname);
 }
});

const upload = multer({ storage });

app.use("/uploads", express.static("uploads"));

/* =========================
   FILE UPLOAD API
========================= */

app.post("/upload", upload.single("file"), (req, res) => {

 res.json({
  file: req.file.filename
 });

});

/* =========================
   CHAT HISTORY API
========================= */

app.get("/messages/:user1/:user2", async (req, res) => {

 const { user1, user2 } = req.params;

 try {

  const messages = await Message.find({
   $or: [
    { sender: user1, receiver: user2 },
    { sender: user2, receiver: user1 }
   ]
  }).sort({ timestamp: 1 });

  res.json(messages);

 } catch (error) {

  res.status(500).json({ error: "Error fetching messages" });

 }

});

/* =========================
   MONGODB CONNECTION
========================= */

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

/* =========================
   SOCKET SERVER
========================= */

const server = http.createServer(app);

const io = new Server(server, {
 cors: {
  origin: "*"
 }
});

/* =========================
   ONLINE USERS
========================= */

let onlineUsers = {};

/* =========================
   SOCKET EVENTS
========================= */

io.on("connection", (socket) => {

 console.log("User Connected:", socket.id);

 /* USER JOIN */

 socket.on("join", (username) => {

  socket.username = username;

  onlineUsers[username] = socket.id;

  io.emit("online_users", Object.keys(onlineUsers));

 });

 /* PRIVATE MESSAGE */

 socket.on("private_message", async (data) => {

  try {

   const msg = new Message(data);

   await msg.save();

   const receiverSocket = onlineUsers[data.receiver];

   if (receiverSocket) {
    io.to(receiverSocket).emit("receive_private_message", data);
   }

  } catch (error) {
   console.log(error);
  }

 });

 /* GROUP MESSAGE */

 socket.on("group_message", async (data) => {

  try {

   const msg = new Message(data);

   await msg.save();

   io.emit("receive_group_message", data);

  } catch (error) {
   console.log(error);
  }

 });

 /* USER DISCONNECT */

 socket.on("disconnect", () => {

  console.log("User Disconnected:", socket.id);

  for (let user in onlineUsers) {

   if (onlineUsers[user] === socket.id) {
    delete onlineUsers[user];
   }

  }

  io.emit("online_users", Object.keys(onlineUsers));

 });

});

/* =========================
   SERVER START
========================= */

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {

 console.log(`Server running on port ${PORT}`);

});