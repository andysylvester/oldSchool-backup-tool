/*	serve-local.js -- serve the ./output folder so the built blog can be viewed
	at the baseUrl configured in config.json (http://localhost:8080/blog/).
	*/

const http = require ("http");
const fs = require ("fs");
const path = require ("path");

const root = path.resolve (__dirname, "output");
const port = Number (process.argv [2]) || 8080;

const types = {
	".html": "text/html", ".css": "text/css", ".js": "application/javascript",
	".json": "application/json", ".xml": "text/xml", ".png": "image/png",
	".jpg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
	".ico": "image/x-icon", ".txt": "text/plain"
	};

http.createServer (function (req, res) {
	var relpath = decodeURIComponent (req.url.split ("?") [0]);
	var f = path.join (root, relpath);
	if (!f.startsWith (root)) { //no climbing out of the output folder
		res.writeHead (403, {"Content-Type": "text/plain"});
		res.end ("Forbidden.");
		return;
		}
	fs.stat (f, function (err, stats) {
		if (!err && stats.isDirectory ()) {
			f = path.join (f, "index.html");
			}
		fs.readFile (f, function (err, data) {
			if (err) {
				res.writeHead (404, {"Content-Type": "text/plain"});
				res.end ("Not found.");
				}
			else {
				const type = types [path.extname (f).toLowerCase ()] || "application/octet-stream";
				res.writeHead (200, {"Content-Type": type + "; charset=utf-8"});
				res.end (data);
				}
			});
		});
	}).listen (port, function () {
		console.log ("Serving " + root + " at http://localhost:" + port + "/blog/");
		});
