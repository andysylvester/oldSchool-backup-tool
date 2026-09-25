# oldSchool-backup-tool

A local build setup for [drummerCms](https://github.com/scripting/drummerCms), used to build Andy Sylvester's Old School blog on Windows and upload it to `https://andysylvester.com/files/DrummerBlog/`.

drummerCms and oldSchoolBlog normally publish to Amazon S3. With this setup the blog builds into a local `output/` folder, with no AWS account needed, and you upload that folder yourself. The upstream code is unchanged; the original drummerCms README follows below.

### Requirements

Node.js (built with v24) and npm. Then run:

```
npm install
```

### Building

```
node run-local.js andysylvester              # build the blog + month archives into ./output
node serve-local.js                          # review it at http://localhost:8080/blog/
```

Upload the contents of `output/blog/` to the blog's `baseUrl`.

Other options:

```
node run-local.js andysylvester --keep-alive  # leave the drummerCms server up on :1410 afterward
node run-local.js andysylvester --no-archives # skip the month archive step
node build-archives.js andysylvester          # rebuild only the month archives (needs a prior build)
```

To force a clean rebuild, delete `output/` and `data/`.

### How it works

- **`config.json`** uses drummerCms's `specialOutlines` key to point the `andysylvester` blog at its OPML (`urlBlogOpml`) and set its public `baseUrl`. The build downloads the OPML from that URL, so to change the blog, edit and upload `blog.opml` there, then rebuild. The `blog.opml` in this repo is a copy. The original template config is kept as `config.json.template-backup`.
- **`run-local.js`** starts drummerCms and calls its `/build` endpoint. Before that, it replaces the S3 upload with a write to `./output`, skips the rssCloud ping, and serves `./templates` on port 1411 so oldSchool can fetch the template. It also works around two oldSchoolBlog v0.8.16 issues: a double callback that crashed `/build`, and `calendar.json` sometimes not being written.
- **`build-archives.js`** backfills the per-month archive pages. oldSchool only ever builds the page for the current month. `run-local.js` runs it automatically after a successful build.
- **`templates/minimal-https/`** is the stock template with its scripting.com, fargo.io and radio3.io assets pointed at their S3 buckets, which serve HTTPS. Without this the blog breaks when served over HTTPS.
- **`serve-local.js`** serves `./output` on port 8080 for review.

`output/` and `data/` (oldSchool's cache) are generated and not tracked in git.

See [HISTORY.md](HISTORY.md) for the full story, including the upstream bugs, HTTPS issues and how the output was verified.

---

# drummerCms

A shell for Old School to connect it with Drummer. Released so other outliners can hook up to Old School for blogging.

### Overview

As promised, here's the open source release of drummerCMS. It's the app that gets called when you build a blog from within Drummer. 

It's a small shell for the much larger <a href="https://github.com/scripting/oldSchoolBlog">oldSchoolBlog</a> package to connect it with Drummer. Released so other outliners can hook up to Old School for blogging.

You'll see there's not much there. It builds a config struct for the blog. It can do this because it knows where the user's blog.opml file is located. It would likely be in a different location for another product. 

The heart of the app is <a href="https://github.com/scripting/drummerCms/blob/main/drummercms.js#L40">initBlogConfig</a>. 

An example of a <a href="http://drummer.scripting.com/cluelessnewbie/blog.opml">blog.opml</a> file.

The <a href="https://github.com/scripting/drummerCms">repo</a> is open, use the <a href="https://github.com/scripting/drummerCms/issues">Issues section</a> to discuss. 

### Updates

See the <a href="worknotes.md">worknotes.md</a> page.

