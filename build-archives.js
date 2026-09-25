/*	build-archives.js -- build a month index page for every month that has posts.

	oldSchool's publishMonthArchivePage (oldschool.js:1344) opens with
	"var now = new Date ()" and builds exactly one page per run -- the current
	calendar month. There's no loop over the months that have posts and no
	backfill, so a one-shot local build produces a single (usually empty) archive
	page. On the live service these pages accumulate only because the server has
	been running for years, writing each month's page while it was the current
	month. Nothing in config turns this on; there is no setting for it.

	This fills in the rest, once a build has run:

	  - The day bodies are already on disk. data/pages/<blog>/YYYY/MM/DD.html is
	    exactly what oldSchool reads through blogData.htmlArchive, and a month
	    page is just those days newest-first, each wrapped in divArchivePageDay.

	  - The page shell comes from the one archive page oldSchool did build this
	    run. Reusing it means the surrounding template, metadata and config block
	    are byte-identical to the real code path rather than reconstructed, so
	    only the title, the canonical URL and the body need changing.

	oldSchool has no year-index code at all, and the live service returns 404 for
	year URLs, so this builds month pages only.

	run-local.js calls buildArchives itself once a build succeeds. Run standalone
	to rebuild just the archives: node build-archives.js [blogName]
	*/

const fs = require ("fs");
const path = require ("path");

exports.buildArchives = buildArchives;

const outputFolder = path.resolve (__dirname, "output");
const templateFile = path.resolve (__dirname, "templates", "minimal-https", "index.html");

const monthNames = ["January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December"];

function readConfig (blogName) {
	const jstruct = JSON.parse (fs.readFileSync (path.resolve (__dirname, "config.json"), "utf8"));
	const theOutline = jstruct.specialOutlines [blogName];
	if (theOutline === undefined) {
		throw new Error ("config.json has no specialOutlines entry for \"" + blogName + "\".");
		}
	return (theOutline);
	}

/*	The two [%bodytext%] macros sit between literal chunks of the template that
	appear nowhere else (they carry divSpacerCell and divFooter). Deriving the
	anchors from the template rather than hardcoding them keeps this working if
	the template is edited.
	*/
function getBodyAnchors () {
	const parts = fs.readFileSync (templateFile, "utf8").split (/\[%(\w+)%\]/);
	const anchors = [];
	for (var i = 1; i < parts.length; i += 2) {
		if (parts [i] == "bodytext") {
			anchors.push ({before: parts [i - 1], after: parts [i + 1]});
			}
		}
	if (anchors.length == 0) {
		throw new Error ("no [%bodytext%] macro in " + templateFile);
		}
	return (anchors);
	}

function replaceBetween (pagetext, anchor, newtext) {
	const start = pagetext.indexOf (anchor.before);
	if (start < 0) {
		throw new Error ("couldn't find the template text before [%bodytext%] in the reference page.");
		}
	const bodyStart = start + anchor.before.length;
	const bodyEnd = pagetext.indexOf (anchor.after, bodyStart);
	if (bodyEnd < 0) {
		throw new Error ("couldn't find the template text after [%bodytext%] in the reference page.");
		}
	return (pagetext.substring (0, bodyStart) + newtext + pagetext.substring (bodyEnd));
	}

function getPageTitle (pagetext) {
	const match = pagetext.match (/<title>([\s\S]*?)<\/title>/);
	if (match === null) {
		throw new Error ("the reference page has no <title>.");
		}
	return (match [1]);
	}

function replaceAll (s, find, replaceWith) {
	return (s.split (find).join (replaceWith));
	}

/*	Walk data/pages/<blog>/YYYY/MM/ and collect the days each month has. The
	cache holds DD.html beside a DD/ folder of item pages, so take files only.
	*/
function getMonths (cacheFolder) {
	const months = {};
	if (!fs.existsSync (cacheFolder)) {
		throw new Error ("no page cache at " + cacheFolder + " -- run run-local.js first.");
		}
	fs.readdirSync (cacheFolder).forEach (function (year) {
		if (!/^\d{4}$/.test (year)) {
			return;
			}
		const yearFolder = path.join (cacheFolder, year);
		if (!fs.statSync (yearFolder).isDirectory ()) {
			return;
			}
		fs.readdirSync (yearFolder).forEach (function (month) {
			if (!/^\d{2}$/.test (month)) {
				return;
				}
			const monthFolder = path.join (yearFolder, month);
			if (!fs.statSync (monthFolder).isDirectory ()) {
				return;
				}
			const days = fs.readdirSync (monthFolder).filter (function (f) {
				return (/^\d{2}\.html$/.test (f) && fs.statSync (path.join (monthFolder, f)).isFile ());
				});
			if (days.length > 0) {
				months [year + "/" + month] = days.sort ().reverse (); //newest first
				}
			});
		});
	return (months);
	}

function getMonthBody (cacheFolder, year, month, days) {
	var htmltext = "";
	days.forEach (function (f) {
		const dayText = fs.readFileSync (path.join (cacheFolder, year, month, f), "utf8");
		htmltext += "<div class=\"divArchivePageDay\">" + dayText + "</div>";
		});
	return (htmltext);
	}

/*	Returns the number of pages written. Throws if the build hasn't run yet, or
	if the reference page doesn't match the template.
	*/
function buildArchives (blogName, flVerbose = true) {
	const blogConfig = readConfig (blogName);
	const baseUrl = blogConfig.baseUrl;
	const blogFolder = path.join (outputFolder, blogConfig.basePath.replace (/^\/+/, ""));
	const cacheFolder = path.resolve (__dirname, "data", "pages", blogName);
	const anchors = getBodyAnchors ();

	//the archive page oldSchool built this run, used as the shell
	const now = new Date ();
	const refRelpath = now.getFullYear () + "/" + String (now.getMonth () + 1).padStart (2, "0") + "/index.html";
	const refFile = path.join (blogFolder, refRelpath);
	if (!fs.existsSync (refFile)) {
		throw new Error ("no reference page at " + refFile + " -- run \"node run-local.js " + blogName + "\" first.");
		}
	const refText = fs.readFileSync (refFile, "utf8");
	const refTitle = getPageTitle (refText);
	const refUrl = baseUrl + refRelpath;

	const months = getMonths (cacheFolder);
	const keys = Object.keys (months).sort ();
	if (keys.length == 0) {
		throw new Error ("no months found in " + cacheFolder);
		}

	var ctWritten = 0;
	keys.forEach (function (key) {
		const year = key.split ("/") [0], month = key.split ("/") [1];
		const days = months [key];
		const relpath = year + "/" + month + "/index.html";
		const pagetitle = refTitle.replace (/: [A-Za-z]+ \d{4}$/, "") + ": " + monthNames [Number (month) - 1] + " " + year;

		var pagetext = refText;
		//title, og:title, twitter:title and configJson's metadata.title all carry
		//the same string, so one replace covers them; og:site_name is the blog
		//title alone and is left alone.
		pagetext = replaceAll (pagetext, refTitle, pagetitle);
		pagetext = replaceAll (pagetext, refUrl, baseUrl + relpath);
		const body = getMonthBody (cacheFolder, year, month, days);
		anchors.forEach (function (anchor) {
			pagetext = replaceBetween (pagetext, anchor, body);
			});

		const f = path.join (blogFolder, year, month, "index.html");
		fs.mkdirSync (path.dirname (f), {recursive: true});
		fs.writeFileSync (f, pagetext);
		if (flVerbose) {
			console.log ("published: " + relpath + " (" + days.length + " day" + (days.length == 1 ? "" : "s") + ")");
			}
		ctWritten++;
		});

	return (ctWritten);
	}

if (require.main === module) {
	try {
		const ct = buildArchives (process.argv [2] || "andysylvester");
		console.log ("build-archives: wrote " + ct + " month index pages.");
		}
	catch (err) {
		console.log ("build-archives: " + err.message);
		process.exit (1);
		}
	}
