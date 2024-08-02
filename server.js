const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config({ path: "./config.env" });
const connectDatabase = require('./database');

process.on("uncaughtException", (err) => {
  console.log(err);
  console.log("UNCAUGHT Exception! Shutting down ...");
  process.exit(1);
});

const app = require("./app");

const http = require("http");
const server = http.createServer(app);

const { Server } = require("socket.io");
const { promisify } = require("util");
const User = require("./models/user");
const FriendRequest = require("./models/friendRequest");
const OneToOneMessage = require("./models/OneToOneMessage");
const AudioCall = require("./models/audioCall");
const VideoCall = require("./models/videoCall");

// ------------------BOT---------------- //
const fs = require('fs');
// const { NlpManager } = require('node-nlp');
const { trainNLP, processRequest } = require('./trainNLP');
const detectIntent = require('./DialogFlow');

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

connectDatabase();

const port = process.env.PORT || 5000;

server.listen(port, () => {
  console.log(`App running on port ${port} ...`);
});

io.on("connection", async (socket) => {
  const user_id = socket.handshake.query["user_id"];

  console.log(`User ${user_id} connected ${socket.id}`);

  if (user_id != null && Boolean(user_id)) {
    try {
      await User.findByIdAndUpdate(user_id, {
        socket_id: socket.id,
        status: "Online",
      });
    } catch (e) {
      console.log(e);
    }
  }





  let participants;
  participants = await User.findById({
    _id: user_id
  })
    .select('firstName lastName email _id status');

  participants = [].concat(participants);

  const notify_user = await OneToOneMessage.find({
    participants: { $all: [user_id] }
  }).populate({
    path: "participants",
    select: "socket_id",
    match: { status: "Online", _id: { $ne: user_id } },
  })

  notify_user.forEach(conversation => {
    if (conversation.participants && conversation.participants.length > 0) {
      const _id = conversation._id;
      const messages = conversation.messages;

      conversation.participants.forEach(participant => {
        io.to(participant.socket_id).emit("user_On_Off", { _id, participants, messages });
      })
    }
  });

  const conversations = async () => {
    const existing_conversations = await OneToOneMessage.find({
      participants: { $all: [user_id] },
    }).populate({
      path: "participants",
      select: "firstName lastName avatar _id email status",
      match: { _id: { $ne: user_id } }
    });

    return existing_conversations;
  }

  socket.emit("get_direct_conversations", await conversations());





  // socket.on("user_On_Off", async ({ user_id }) => {
  //   let participants;
  //   participants = await User.findById({
  //     _id: user_id
  //   })
  //     .select('firstName lastName email _id status');

  //   participants = [].concat(participants);

  //   const notify_user = await OneToOneMessage.find({
  //     participants: { $all: [user_id] }
  //   }).populate({
  //     path: "participants",
  //     select: "socket_id",
  //     match: { status: "Online", _id: { $ne: user_id } },
  //   })

  //   notify_user.forEach(conversation => {
  //     if (conversation.participants && conversation.participants.length > 0) {
  //       const _id = conversation._id;
  //       const messages = conversation.messages;

  //       conversation.participants.forEach(participant => {
  //         io.to(participant.socket_id).emit("user_On_Off", { _id, participants, messages });
  //       })
  //     }
  //   });
  // });

  // socket.on("get_direct_conversations", async({user_id},callback)=>{
  //   const existing_conversations = await OneToOneMessage.find({
  //     participants: { $all: [user_id] },
  //   }).populate({
  //     path: "participants",
  //     select: "firstName lastName avatar _id email status",
  //     match: { _id: { $ne: user_id } }
  //   });

  //   callback(existing_conversations);
  // });





  socket.on('offer', (offer) => {
    socket.broadcast.emit('offer', offer);
  });

  socket.on('answer', (answer) => {
    socket.broadcast.emit('answer', answer);
  });

  socket.on('ice_candidate', (candidate) => {
    socket.broadcast.emit('ice_candidate', candidate);
  });





  socket.on("friend_request", async (data) => {
    const to = await User.findById(data.to).select("socket_id");
    const from = await User.findById(data.from).select("socket_id");

    await FriendRequest.create({
      sender: data.from,
      recipient: data.to,
    });
    // emit event request received to recipient
    io.to(to?.socket_id).emit("new_friend_request", {
      message: "New friend request received",
    });
    io.to(from?.socket_id).emit("request_sent", {
      message: "Request Sent successfully!",
    });
  });

  socket.on("accept_request", async (data) => {
    // accept friend request => add ref of each other in friends array
    const request_doc = await FriendRequest.findById(data.request_id);

    const sender = await User.findById(request_doc.sender);
    const receiver = await User.findById(request_doc.recipient);

    sender.friends.push(request_doc.recipient);
    receiver.friends.push(request_doc.sender);

    await receiver.save({ new: true, validateModifiedOnly: true });
    await sender.save({ new: true, validateModifiedOnly: true });

    await FriendRequest.findByIdAndDelete(data.request_id);

    // delete this request doc
    // emit event to both of them

    // emit event request accepted to both
    io.to(sender?.socket_id).emit("request_accepted", {
      message: "Friend Request Accepted",
    });
    io.to(receiver?.socket_id).emit("request_accepted", {
      message: "Friend Request Accepted",
    });
  });

  socket.on("start_conversation", async (data) => {
    const { to, from } = data;
    // check if there is any existing conversation

    const existing_conversations = await OneToOneMessage.find({
      participants: { $size: 2, $all: [to, from] },
    }).populate({
      path: "participants",
      select: "firstName lastName _id email status",
      match: { _id: { $nin: from } }
    });

    if (existing_conversations.length === 0) {
      let new_chat = await OneToOneMessage.create({
        participants: [to, from],
      });

      new_chat = await OneToOneMessage.findById(new_chat)
        .populate({
          path: "participants",
          select: "firstName lastName _id email status",
          match: { _id: { $nin: from } }
        });

      socket.emit("start_chat", new_chat, false);
    }
    else {
      socket.emit("start_chat", existing_conversations[0], true);
    }
  });

  socket.on("get_messages", async (data, callback) => {
    try {
      const result = await OneToOneMessage.findById(data.conversation_id).select("messages");

      if (result && result.messages) {
        const { messages } = result;
        callback(messages);
      } else {
        callback([]);
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("text_message", async (data) => {
    const { message, conversation_id, from, to, type } = data;

    const to_user = await User.findById(to);
    const from_user = await User.findById(from);

    const new_message = {
      to: to,
      from: from,
      type: type,
      created_at: Date.now(),
      text: message,
    };

    const chat = await OneToOneMessage.findById(conversation_id);
    chat.messages.push(new_message);

    await chat.save({ new: true, validateModifiedOnly: true });

    io.to(to_user?.socket_id).emit("new_message", {
      conversation_id,
      message: new_message,
    });

    // io.to(from_user?.socket_id).emit("new_message", {
    //   conversation_id,
    //   message: new_message,
    // });
  });

  // handle Media/Document Message
  socket.on("file_message", (data) => {
    console.log("Received message:", data);

    // data: {to, from, text, file}

    // Get the file extension
    const fileExtension = path.extname(data.file.name);

    // Generate a unique filename
    const filename = `${Date.now()}_${Math.floor(
      Math.random() * 1000
    )}${fileExtension}`;

    // upload file to AWS s3

    // create a new conversation if its dosent exists yet or add a new message to existing conversation

    // save to db

    // emit incoming_message -> to user

    // emit outgoing_message -> from user
  });


  // -------------- BOT ------------ //

  socket.on("bot_request_message", async (data) => {
    // const modelFilePath = 'model.nlp';
    // manager.load(modelFilePath);

    // const manager = new NlpManager({ languages: ['en'] });

    const nlpModelExists = fs.existsSync('model.nlp');

    if (!nlpModelExists) {
      await trainNLP();
    }

    (async () => {
      try {
        // const response = await manager.process('en', data.message);
        const response = await processRequest(data.message);
        const responseData = {
          incoming: true,
          outgoing: false,
          message: response,
        };

        if (responseData.message) {
          return socket.emit("bot_response_message", responseData);
        }

        responseData.message = await detectIntent('en', data.message, 'abcd1234')

        socket.emit("bot_response_message", responseData);
      } catch (err) {
        const responseData = {
          incoming: true,
          outgoing: false,
          message: "Sorry, I couldn't get it.",
        };

        socket.emit("bot_response_message", responseData);
      }
    })();

  });


  // -------------- HANDLE AUDIO CALL SOCKET EVENTS ----------------- //

  // handle start_audio_call event
  socket.on("start_audio_call", async (data) => {
    const { from, to, roomID } = data;

    const to_user = await User.findById(to);
    const from_user = await User.findById(from);

    console.log("to_user", to_user);

    // send notification to receiver of call
    io.to(to_user?.socket_id).emit("audio_call_notification", {
      from: from_user,
      roomID,
      streamID: from,
      userID: to,
      userName: to,
    });
  });

  // handle audio_call_not_picked
  socket.on("audio_call_not_picked", async (data) => {
    console.log(data);
    // find and update call record
    const { to, from } = data;

    const to_user = await User.findById(to);

    await AudioCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Missed", status: "Ended", endedAt: Date.now() }
    );

    // TODO => emit call_missed to receiver of call
    io.to(to_user?.socket_id).emit("audio_call_missed", {
      from,
      to,
    });
  });

  // handle audio_call_accepted
  socket.on("audio_call_accepted", async (data) => {
    const { to, from } = data;

    const from_user = await User.findById(from);

    // find and update call record
    await AudioCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Accepted" }
    );

    // TODO => emit call_accepted to sender of call
    io.to(from_user?.socket_id).emit("audio_call_accepted", {
      from,
      to,
    });
  });

  // handle audio_call_denied
  socket.on("audio_call_denied", async (data) => {
    // find and update call record
    const { to, from } = data;

    await AudioCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Denied", status: "Ended", endedAt: Date.now() }
    );

    const from_user = await User.findById(from);
    // TODO => emit call_denied to sender of call

    io.to(from_user?.socket_id).emit("audio_call_denied", {
      from,
      to,
    });
  });

  // handle user_is_busy_audio_call
  socket.on("user_is_busy_audio_call", async (data) => {
    const { to, from } = data;
    // find and update call record
    await AudioCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Busy", status: "Ended", endedAt: Date.now() }
    );

    const from_user = await User.findById(from);
    // TODO => emit on_another_audio_call to sender of call
    io.to(from_user?.socket_id).emit("on_another_audio_call", {
      from,
      to,
    });
  });

  // --------------------- HANDLE VIDEO CALL SOCKET EVENTS ---------------------- //

  // handle start_video_call event
  socket.on("start_video_call", async (data) => {
    const { from, to, roomID } = data;

    console.log(data);

    const to_user = await User.findById(to);
    const from_user = await User.findById(from);

    console.log("to_user", to_user);

    // send notification to receiver of call
    io.to(to_user?.socket_id).emit("video_call_notification", {
      from: from_user,
      roomID,
      streamID: from,
      userID: to,
      userName: to,
    });
  });

  // handle video_call_not_picked
  socket.on("video_call_not_picked", async (data) => {
    console.log(data);
    // find and update call record
    const { to, from } = data;

    const to_user = await User.findById(to);

    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Missed", status: "Ended", endedAt: Date.now() }
    );

    // TODO => emit call_missed to receiver of call
    io.to(to_user?.socket_id).emit("video_call_missed", {
      from,
      to,
    });
  });

  // handle video_call_accepted
  socket.on("video_call_accepted", async (data) => {
    const { to, from } = data;

    const from_user = await User.findById(from);

    // find and update call record
    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Accepted" }
    );

    // TODO => emit call_accepted to sender of call
    io.to(from_user?.socket_id).emit("video_call_accepted", {
      from,
      to,
    });
  });

  // handle video_call_denied
  socket.on("video_call_denied", async (data) => {
    // find and update call record
    const { to, from } = data;

    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Denied", status: "Ended", endedAt: Date.now() }
    );

    const from_user = await User.findById(from);
    // TODO => emit call_denied to sender of call

    io.to(from_user?.socket_id).emit("video_call_denied", {
      from,
      to,
    });
  });

  // handle user_is_busy_video_call
  socket.on("user_is_busy_video_call", async (data) => {
    const { to, from } = data;
    // find and update call record
    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Busy", status: "Ended", endedAt: Date.now() }
    );

    const from_user = await User.findById(from);
    // TODO => emit on_another_video_call to sender of call
    io.to(from_user?.socket_id).emit("on_another_video_call", {
      from,
      to,
    });
  });

  // -------------- HANDLE SOCKET DISCONNECTION ----------------- //

  socket.on("end", async (data) => {
    let participants;

    if (data.user_id) {
      // await User.findByIdAndUpdate(data.user_id, { status: "Offline" });
      participants = await User.findOneAndUpdate(
        { _id: data.user_id },
        { $set: { status: "Offline" } },
        { new: true, select: 'firstName lastName email _id status' }
      );
    }
    participants = [].concat(participants);

    socket.disconnect(0);
    console.log("closing");

    // broadcast to all conversation rooms of this user that this user is offline (disconnected)

    const existing_conversations = await OneToOneMessage.find({
      participants: { $all: [user_id] }
    }).populate({
      path: "participants",
      select: "socket_id",
      match: { status: "Online" },
      // match: { _id: {$ne : user_id } }
    })
    // .select("participants -_id");
    // participants: { $size: 2, $all: [to, from] },

    existing_conversations.forEach(conversation => {
      if (conversation.participants && conversation.participants.length > 0) {
        const _id = conversation._id;
        const messages = conversation.messages;

        conversation.participants.forEach(participant => {
          io.to(participant.socket_id).emit("user_On_Off", { _id, participants, messages });
        })

        // io.to(conversation.participants[0].socket_id).emit("user_Offline", { _id, participants, messages });
      }
    });
  });
});

process.on("unhandledRejection", (err) => {
  console.log(err);
  console.log("UNHANDLED REJECTION! Shutting down ...");
  server.close(() => {
    process.exit(1);
  });
});
