const express = require("express");
const { Client, LocalAuth, RemoteAuth } = require("whatsapp-web.js");
const fs = require("fs");
const app = express();
const cors = require('cors');
const port = 3009;
const mongoose = require("mongoose");
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const MessageLog = require('./messageSchema');
const RepliedLog = require('./RepliedSchema');
const { MongoStore } = require("wwebjs-mongo");
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
const MONGO_URI =
  "mongodb://43.205.173.201:50017/Suvit-Quality-Prod";
let store;

let options = {
  user: 'QualityAdminDevelopment',
  pass: 'BHYHHQqhumDVx5BrXv7ucVPgLDpA538464tzZda7NmhhCe',
}

mongoose.connect(MONGO_URI, options).then(() => {
  console.log("hello connected mongoDB");
  store = new MongoStore({ mongoose: mongoose });
});

const whitelist = ['http://localhost:3000', 'http://192.168.20.102:3000'];
let corsOptions = function (req, callback) {
  let corsOptions;
  if (whitelist.indexOf(req.header('Origin')) !== -1) {
    corsOptions = { origin: true } // reflect (enable) the requested origin in the CORS response
  } else {
    corsOptions = { origin: false } // disable CORS for this request
    // console.log('corsOptions', corsOptions)
  }
  callback(null, corsOptions);
};
app.use(cors(corsOptions));

app.get("/", (req, res) => {
  res.send("<h1>Hello world</h1>");
});

server.listen(port, () => {
  console.log("listening on *:", port);
});
const allSessionsObject = {};
const createWhatsappSession = async (id, socket) => {
  try {

    await new Promise(resolve => setTimeout(resolve, 5000));

    const client = new Client({
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ]
      },
      webVersionCache: {
        type: "remote",
        remotePath:
          "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
      },
      authStrategy: new RemoteAuth({
        clientId: id,
        store: store,
        backupSyncIntervalMs: 300000,
      }),
    });

    client && console.log('==========> client is created',);
    // QR code event
    client.on("qr", (qr) => {
      console.log("QR RECEIVED", qr);
      io.sockets.emit("qr", { qr });
    });

    // Authentication event
    client.on("authenticated", () => {
      console.log("AUTHENTICATED");
    });

    // Ready event
    client.on("ready", () => {
      console.log("Client is ready!", id);
      allSessionsObject[id] = client;
      // update query of our db
      io.sockets.emit("ready", { id, message: "Client is ready!" });
    });

    // Disconnected event
    client.on("disconnected", (reason) => {
      //remvoe session from our db
      console.log("Client disconnected:", reason);
    });

    // Authentication failure event
    client.on("auth_failure", (msg) => {
      console.error("Authentication failure:", msg);
    });

    // Client error event
    client.on("error", (err) => {
      console.error("Client error:", err);
    });

    client.on("remote_session_saved", () => {
      console.log("remote_session_saved");
      socket.emit("remote_session_saved", {
        message: "remote_session_saved",
      });
    });

    // Message event
    client.on('message', async (msg) => {
      if (msg.hasMedia && msg.hasQuotedMsg) {
        let parentIds = await MessageLog.find({ sessionId: id, messageId: msg._data.quotedMsg.id.id }).select('messageId sessionId').lean();
        let parentIdsArr = parentIds.map(({ messageId }) => messageId) || [];

        console.log('==========> parentIdsArr', parentIds, id);
        if (parentIdsArr && parentIdsArr.length > 0 && parentIdsArr.includes(msg._data.quotedMsg.id.id) && id == parentIds[0].sessionId) {
          try {
            const media = await msg.downloadMedia();
            let filename = media.filename || 'img.png'
            filename = filename.split('.').join('-' + Date.now() + '.');
            fs.writeFile(
              "./upload/" + filename,
              media.data,
              "base64",
              function (err) {
                if (err) {
                  console.log(err);
                }
              }
            );

            console.log('==========> file downloaded',);
          } catch (error) {
            console.error('media Error:', error);
          }
        }
      }

      // console.log('==========> msg', msg);
      io.sockets.emit("getMessage", { id, message: msg });
    });
    // Initialize the client
    client.initialize().catch(error => console.error('initialize Error:', error))
  } catch (error) {
    console.log('==========> error', error);
  }
};


io.on("connection", (socket) => {

  console.log("a user connected", socket?.id);
  socket.on("disconnect", () => {
    console.log("user disconnected");
  });

  socket.on("connected", (data) => {
    console.log("connected to the server", data);
    // emit hello
    socket.emit("hello", "Hello from server");
  });

  socket.on("createSession", (data) => {
    console.log(data);
    const { id } = data;
    createWhatsappSession(id, socket);
  });

  socket.on("sendMessage", async (data) => {
    console.log("sendMessage", data);
    const { sessionId, media, caption = 'this is my caption', number = "916355859435@c.us" } = data;
    try {
      const client = allSessionsObject[sessionId];
      // let isRegisterd = await client.isRegisteredUser(number)
      // if (isRegisterd) {

      const ack = await client.sendMessage(number, caption);
      if (ack) {

        const acknowledgment = new MessageLog({
          userId: sessionId,
          sessionId: sessionId,
          from: ack.from,
          to: ack.to,
          messageId: ack.id.id,
          deviceType: ack.deviceType,
          body: ack.body,
          _data: ack._data,
          id: ack.id,
        });
        await acknowledgment.save();
      }
      console.log('==========> ack', ack);
      socket.emit("sendMessages", {
        ack,
      });
      // } else {
      //   console.log(number + ' not Registerd');
      // }
    } catch (error) {
      console.error('sendMessage Error:', error);
    }
  });

  socket.on("getAllChats", async (data) => {
    console.log("getAllChats", data);
    const { id } = data;
    const client = allSessionsObject[id];
    const allChats = await client.getChats();
    socket.emit("allChats", {
      allChats,
    });
  });
});