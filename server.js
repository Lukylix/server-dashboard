const server = require("http").createServer();
const cors = require("cors");

const si = require("systeminformation");

const express = require("express");
const app = express();

const PORT = process.env.PORT || 8080;
const PORTIO = process.env.PORTIO || 3001;

/*
  Express
*/
app.use(cors());

app.get("/", (req, res) => {
	res.send("Hello World!");
});

app.get("/disks", (req, res) => {
	si.fsSize().then((data) => res.send(data));
});

/*
  Socket.io
*/
const io = require("socket.io")(server, {
	transports: ["websocket", "polling"],
});

cpuPercentsCache = [];

setInterval(() => {
	// 2. every second, emit a 'cpu' event to user
	si.currentLoad().then((data) => {
		cpuPercent = data.currentLoad;
		const formatedData = {
			totalLoad: data.currentLoad,
			cpus: [],
		};
		for (let i = 0; i < data.cpus.length; i++) {
			const cpu = data.cpus[i];
			formatedData.cpus.push(cpu.load);
		}

		if (cpuPercentsCache.length > 59) cpuPercentsCache.shift();
		cpuPercentsCache.push(cpuPercent);
		io.sockets.in("cpu").emit("cpu", formatedData);
	});
	if (io.sockets.adapter.rooms.get("cpu")?.size > 0) {
		si.cpu().then((data) => {
			si.cpuCurrentSpeed().then((data2) => {
				si.processes().then((data3) => {
					io.sockets.in("cpu").emit("cpuInfo", { ...data2, ...data, process: data3 });
				});
			});
		});
	}
	if (io.sockets.adapter.rooms.get("ram")?.size > 0) {
		si.mem().then((data) => {
			io.sockets.in("ram").emit("ram", data);
		});
	}
	if (io.sockets.adapter.rooms.get("network")?.size > 0) {
		si.networkStats().then((data) => {
			io.sockets.in("network").emit("network", data);
		});
	}
}, 1000);

// 1. listen for socket connections
io.on("connection", (client) => {
	client.on("subscribe", (room) => {
		console.log("Joining room", room);
		if (room === "cpu") client.emit("cpuBase", cpuPercentsCache);

		client.join(room);
	});
});

server.listen(PORTIO, console.log(`Socket.io listening on http://localhost:${PORTIO}`));
app.listen(PORT, console.log(`Express listening on http://localhost:${PORT}`));
