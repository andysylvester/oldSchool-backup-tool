/*	run-local.js -- run drummerCms with its output going to a local folder.

	drummerCms/oldSchool normally publish every page, feed and item to Amazon S3.
	This launcher redirects those writes to ./output, so the blog can be built
	without an AWS account. It also stubs out the rssCloud ping, since there's no
	point announcing a feed that hasn't been uploaded yet.

	A successful build is followed by build-archives.js, which backfills the
	per-month index pages oldSchool only ever builds for the current month.

	Usage: node run-local.js [blogName] [--keep-alive] [--no-archives]

	With --keep-alive the drummerCms server stays up on port 1410 afterward, so
	you can rebuild at any time with http://localhost:1410/build?blog=<blogName>.
	*/

const fs = require ("fs");
const path = require ("path");
const http = require ("http");
const https = require ("https");
const s3 = require ("daves3");
const rss = require ("daverss");
const archives = require ("./build-archives.js");

const args = process.argv.slice (2);
const flKeepAlive = args.includes ("--keep-alive");
const flArchives = !args.includes ("--no-archives");
const blogName = args.filter (function (s) {return (s [0] != "-");}) [0] || "andysylvester";
const outputFolder = path.resolve (__dirname, "output");
const templateFolder = path.resolve (__dirname, "templates");
const port = 1410;
const templatePort = 1411;

function localPath (s3path) {
	return (path.join (outputFolder, s3path.replace (/^\/+/, "")));
	}

s3.newObject = function (thePath, data, type, acl, callback, metadata) {
	const f = localPath (thePath);
	fs.mkdir (path.dirname (f), {recursive: true}, function (err) {
		if (err) {
			callback (err);
			}
		else {
			fs.writeFile (f, data, function (err) {
				callback (err, {localPath: f});
				});
			}
		});
	};

rss.cloudPing = function (urlServer, urlFeed, callback) {
	callback (undefined, {statusCode: 200}, "local build, ping skipped");
	};

/*	oldSchool v0.8.16 has a double-callback bug in publishRssFeed -- both pubRss
	and pubFacebookRss invoke its callback, so the tail of publishBlog runs twice
	and drummerCms tries to send the /build response twice, which throws
	ERR_HTTP_HEADERS_SENT and kills the process. Make the second response a no-op.
	*/
const ServerResponse = http.ServerResponse;
const origWriteHead = ServerResponse.prototype.writeHead;
const origEnd = ServerResponse.prototype.end;
ServerResponse.prototype.writeHead = function () {
	if (this.headersSent) {
		return (this);
		}
	return (origWriteHead.apply (this, arguments));
	};
ServerResponse.prototype.end = function () {
	if (this.writableEnded) {
		return (this);
		}
	return (origEnd.apply (this, arguments));
	};

/*	oldSchool fetches the template over HTTP, so serve ./templates locally --
	config.defaultTemplate points here. Building from Drummer itself instead
	needs a publicly reachable urlTemplate.
	*/
const templateServer = http.createServer (function (req, res) {
	const f = path.join (templateFolder, decodeURIComponent (req.url.split ("?") [0]));
	if (!f.startsWith (templateFolder)) {
		res.writeHead (403);
		res.end ("Forbidden.");
		return;
		}
	fs.readFile (f, function (err, data) {
		if (err) {
			res.writeHead (404);
			res.end ("Not found.");
			}
		else {
			res.writeHead (200, {"Content-Type": "text/html; charset=utf-8"});
			res.end (data);
			}
		});
	});
templateServer.listen (templatePort, function () {
	console.log ("run-local: serving templates at http://localhost:" + templatePort + "/");
	});

require ("./drummercms.js"); //starts the server on config.port

function get (urlpath, callback) {
	http.get ({host: "localhost", port, path: urlpath}, function (res) {
		var body = "";
		res.on ("data", function (d) {body += d;});
		res.on ("end", function () {callback (undefined, res.statusCode, body);});
		}).on ("error", function (err) {
			callback (err);
			});
	}

function waitForServer (ctTries, callback) {
	get ("/version", function (err) {
		if (err) {
			if (ctTries <= 0) {
				callback (err);
				}
			else {
				setTimeout (function () {waitForServer (ctTries - 1, callback);}, 500);
				}
			}
		else {
			callback ();
			}
		});
	}

waitForServer (30, function (err) {
	if (err) {
		console.log ("run-local: the server never came up -- " + err.message);
		process.exit (1);
		}
	console.log ("run-local: building " + blogName + " into " + outputFolder);
	get ("/build?blog=" + encodeURIComponent (blogName), function (err, statusCode, body) {
		if (err) {
			console.log ("run-local: err.message == " + err.message);
			process.exit (1);
			}
		console.log ("run-local: /build returned " + statusCode);
		console.log (body.substr (0, 2000));
		/*	calendar.json isn't written by publishBlog -- oldSchool leaves it to a
			once-a-second background timer started in init (oldschool.js:2162), so
			give that timer a few ticks before going on or the file never lands.
			*/
		setTimeout (function () {
			ensureCalendar (function () {
				finish (statusCode);
				});
			}, 3000);
		});
	});

/*	oldSchool rewrites calendar.json only when it differs from the copy already
	at baseUrl (readCalendarJson, oldschool.js:196). Once the blog is uploaded
	and current it stops writing one, so a fresh ./output would be missing a file
	every page references. Not written means the uploaded copy is already right,
	so fetch that one to keep the bundle complete.
	*/
function ensureCalendar (callback) {
	const f = localPath ("/blog/calendar.json");
	if (fs.existsSync (f)) {
		console.log ("run-local: calendar.json written.");
		callback ();
		return;
		}
	const jstruct = JSON.parse (fs.readFileSync (path.resolve (__dirname, "config.json"), "utf8"));
	const url = jstruct.specialOutlines [blogName].baseUrl + "calendar.json";
	https.get (url, function (res) {
		if (res.statusCode != 200) {
			res.resume ();
			console.log ("run-local: calendar.json MISSING -- " + url + " returned " + res.statusCode + ".");
			callback ();
			return;
			}
		var body = "";
		res.on ("data", function (d) {body += d;});
		res.on ("end", function () {
			fs.mkdirSync (path.dirname (f), {recursive: true});
			fs.writeFileSync (f, body);
			console.log ("run-local: calendar.json unchanged upstream, copied from " + url);
			callback ();
			});
		}).on ("error", function (err) {
			console.log ("run-local: calendar.json MISSING -- couldn't fetch " + url + " (" + err.message + ").");
			callback ();
			});
	}

function finish (statusCode) {
	var flOk = (statusCode == 200);
	/*	oldSchool builds an archive page only for the current month, so backfill
		the months that have posts -- see build-archives.js. It reads the day
		cache in data/ and the archive page this build just wrote, so it has to
		run here, after the build.
		*/
	if (flOk && flArchives) {
		try {
			const ct = archives.buildArchives (blogName, false);
			console.log ("run-local: built " + ct + " month index pages.");
			}
		catch (archiveError) {
			console.log ("run-local: month archives failed -- " + archiveError.message);
			flOk = false;
			}
		}
	if (flKeepAlive) {
		console.log ("run-local: server still up -- rebuild with http://localhost:" + port + "/build?blog=" + blogName);
		return;
		}
	templateServer.close ();
	process.exit (flOk ? 0 : 1);
	}
