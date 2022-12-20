import fs from "fs";
import express from "express";
import http from "http";
import cors from "cors";
import si from "systeminformation";
import isDocker from "is-docker";
import { Server as socketIOServer } from "socket.io";

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 8080;

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

app.get("/iswsl", (req, res) => {
	fs.readFile("/proc/version", "utf8", (err, data) => {
		if (err) console.error(err);
		if (data.match(/Microsoft/gi)) return res.send({ isWsl: true });
		res.send({ isWsl: false });
	});
});

app.get("/isdocker", (req, res) => {
	res.send({ isDocker: isDocker() });
});

/*
  Socket.io
*/
const io = new socketIOServer(server, {
	transports: ["websocket", "polling"],
});

let cpuPercentsCache = [];
setInterval(() => {
	// Every second, emit a 'cpu' event to user
	si.currentLoad().then((data) => {
		const cpuPercent = data.currentLoad;
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
	if (io.sockets.adapter.rooms.get("cpuInfo")?.size > 0) {
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
	if (io.sockets.adapter.rooms.get("diskIO")?.size > 0) {
		si.disksIO().then((data) => {
			io.sockets.in("diskIO").emit("diskIO", data);
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
	client.on("unsubscribe", function (room) {
		console.log("Leaving room", room);
		client.leave(room);
	});
});

server.listen(PORT, console.log(`Server listening on port ${PORT}`));
