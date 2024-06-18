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
const MessageLog = require('./MessageSchema');
const RepliedLog = require('./RepliedSchema');

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
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

server.listen(port, () => {
  console.log("listening on *:", port);
});
const allSessionsObject = {};
const createWhatsappSession = async (id, socket) => {
  try {
    const connectedClient = allSessionsObject[id];
    if (connectedClient) {
      try {
        const state = await connectedClient.getState();
        if (state == 'CONNECTED') {
          return true;
        }
      } catch (error) {
        if ((error.message).includes('Session closed')) {
          if (connectedClient) {
            connectedClient.destroy()
            const folderPath = path.join(__dirname, `./.wwebjs_auth/session-${id}`);
            fs.rm(folderPath, { recursive: true, force: true }, (err) => {
              if (err) {
                console.log(`Error deleting folder: ${err.message}`);
              } else {
                console.log('Folder deleted successfully');
              }
            });
            let reason = 'You have been disconnected from WhatsApp due to a session being closed. Please reconnect after some time!'
            return reason
          } else {
            const folderPath = path.join(__dirname, `./.wwebjs_auth/session-${id}`);
            fs.rm(folderPath, { recursive: true, force: true }, (err) => {
              if (err) {
                console.log(`Error deleting folder`, err.message);
              } else {
                console.log('Folder deleted successfully');
              }
            });
            let reason = 'You have been disconnected from WhatsApp due to a session being closed. Please reconnect after some time!'
            return reason
          }
        }

      }
    }

    const client = new Client({
      puppeteer: {
        headless: true,
        handleSIGINT: false,
        args: [
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-setuid-sandbox',
          '--no-first-run',
          '--no-sandbox',
          '--no-zygote',
          '--deterministic-fetch',
          '--disable-features=IsolateOrigins',
          '--disable-site-isolation-trials',
        ]
      },
      qrMaxRetries: 3,
      webVersionCache: {
        type: "remote",
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
      },
      authStrategy: new LocalAuth({
        clientId: id,
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

    client.on('loading_screen', async (percent, message) => {
      console.log('LOADING SCREEN', percent, message);
    });

    // Ready event
    client.on("ready", () => {
      console.log("Client is ready!", id);
      allSessionsObject[id] = client;
      io.sockets.emit("ready", { id, message: "Client is ready!" });
    });

    // Disconnected event
    client.on("disconnected", async (reason) => {
      await client.destroy()
      if (reason == 'NAVIGATION') {
        const folderPath = path.join(__dirname, `./.wwebjs_auth/session-${id}`);
        fs.rm(folderPath, { recursive: true, force: true }, (err) => {
          if (err) {
            console.log(`Error deleting folder: ${err.message}`);
          } else {
            console.log('Folder deleted successfully');
          }
        });
      }
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

    client.on("message_ack", async (msg, ack) => {
      try {
        await WhatsappMessage.updateOne({ messageId: msg.id.id }, { $set: { ack: msg.ack } }).exec();
        socket.emit("sendMessages", {
          msg,
        });
      } catch (error) {
        console.log('==========> message_ack', error);
      }
    });

    client.on("change_state", async (state) => {
      console.log("change_state", state);
    });

    client.on("message_create", async (msg) => {
      // console.log("message_create", msg);
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

      console.log('==========> msg', msg);
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
    const { sessionId, media, caption = 'this is my caption', numbers = ["916355859435@c.us"] } = data;
    try {
      const client = allSessionsObject[sessionId];
      if (!client) {
        let reason = 'You have been disconnected from WhatsApp due to a session being closed. Please reconnect again.'
        io.sockets.emit("whatsappDisconnected", { reason });
        return false;
      }
      let failedToSend = [];
      let successToSend = [];
      const contacts = await client.getContacts();

      await Promise.all(
        numbers.map(async (number) => {
          const isContactNumber = contacts && contacts.some(contact => contact.number && contact.number.includes(number));
          if (isContactNumber) {
            try {
              let numberId = `91${number}@c.us`
              const ack = await client.sendMessage(numberId, `${caption}`);
              if (ack) {
                const acknowledgment = {
                  userId: sessionId,
                  sessionId: sessionId,
                  from: ack.from,
                  to: ack.to,
                  messageId: ack.id.id,
                  deviceType: ack.deviceType,
                  body: ack.body,
                  _data: ack._data,
                  id: ack.id,
                };
                await MessageLog(acknowledgment).save();
                successToSend.push({ messageId: acknowledgment.messageId })

              }
            } catch (sendError) {
              clientDetail.reason = `Failed to send message to ${clientDetail.mobile}: ${sendError.message}`;
              failedToSend.push(clientDetail);
            }
          } else {
            clientDetail.reason = `The mobile number (${clientDetail.mobile}) is either not on your contact list or does not exist.`
            failedToSend.push(clientDetail)
          }

        }));
      socket.emit("sendMessages", {
        failedToSend, successToSend
      });
      // }
      // } else {
      //   console.log(number + ' not Registerd');
      // }
    } catch (error) {
      console.error('sendMessage Error:', error);
    }
  });



  socket.on("getAllChats", async (data) => {
    try {
      console.log("getAllChats", data);
      const { id } = data;
      const client = allSessionsObject[id];
      const state = await client.getState()
      const allChats = await client.getChats();
      socket.emit("allChats", {
        allChats, contacts,
        state
      });
    } catch (error) {
      console.error('Error getAllChats messages:', error);
    }
  });
});