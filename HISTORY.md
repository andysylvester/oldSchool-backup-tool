# Local build history

Working notes for running `drummerCms` locally on Windows to build Andy Sylvester's
Old School blog from a self-hosted `blog.opml`, for upload to
`https://andysylvester.com/files/DrummerBlog/`.

Upstream `worknotes.md` is Dave Winer's and is left untouched. This file covers only
the local setup.

Environment: Windows 11, node v24.18.1, npm 11.16.0, drummerCms v0.5.1,
oldschoolblog v0.8.16.

---

## 2026-09-24 — initial local build

### Goal

Build a weblog from `https://andysylvester.com/files/DrummerBlog/blog.opml`, with the
same look as `https://oldschool.scripting.com/frank.mcpherson@gmail.com/`.

### What the app does

`drummercms.js` is a shell around `oldschoolblog`. It starts an HTTP server on port
1410 and builds a blog when you hit `GET /build?blog=<name>`. Two things blocked a
plain run:

1. **The OPML URL is derived, not configured.** `oldschoolBuild` builds it as
   `drummerHome + blogName + "/blog.opml"`. The only way to point it at an arbitrary
   URL is the `specialOutlines` config key (drummercms.js:158).
2. **All output goes to Amazon S3.** `oldschool.publishFile` calls `s3.newObject` for
   every page, feed and item. With no AWS account nothing gets written anywhere.

### Changes

**`config.json`** — replaced the copied template with the minimum needed. Original
kept as `config.json.template-backup`.

```json
"specialOutlines": {
    "andysylvester": {
        "urlBlogOpml": "https://andysylvester.com/files/DrummerBlog/blog.opml",
        "basePath": "/blog/",
        "baseUrl": "https://andysylvester.com/files/DrummerBlog/"
    }
}
```

Note that `config.json` is read twice — once into drummerCms's own config, and again
by `oldschoolblog`'s `readConfig`, which merges the same keys into its config. A
`blogs` key here would be picked up by oldSchool; we deliberately don't set one, so
that `initBlogConfig` takes the branch that calls `oldschool.initBlog` and
initialises `dataForBlogs`. Pre-defining `blogs` skips that and crashes `publishBlog`.

**`run-local.js`** (new) — launcher. Swaps `daves3.newObject` for a filesystem write
into `./output`, then loads `drummercms.js` normally and calls its real `/build`
endpoint. Also stubs `daverss.cloudPing`.

**`serve-local.js`** (new) — serves `./output` on port 8080 for local review.

**`templates/minimal-https/`** (new) — HTTPS-safe copy of the stock template. See
below.

**`build-archives.js`** (new) — builds the per-month index pages. `run-local.js`
calls it automatically after a successful build; it's also runnable standalone. See
below.

### Generated, not source

- `output/` — 350 files, the built blog. This is what gets uploaded.
- `data/` — oldSchool's local cache (`pages/`, `days/`, `items/`, `debug/`,
  `wordpress/`). Safe to delete; forces a full rebuild.

---

## Upstream bugs worked around

**`oldschoolblog` v0.8.16 double-callback.** In `publishRssFeed`, both `pubRss`
(oldschool.js:1499) and `pubFacebookRss` (oldschool.js:1466) invoke the shared
callback, so the tail of `publishBlog` runs twice and drummerCms sends the `/build`
response twice — `ERR_HTTP_HEADERS_SENT`, process dies. The build itself completes
first; only the exit is affected. `run-local.js` makes the second response a no-op
rather than editing `node_modules`.

**`calendar.json` never written by the build.** The page references it as
`urlCalendar`, but `publishBlog` doesn't write it — oldSchool leaves it to a
once-per-second background timer started in `init` (oldschool.js:2162). The launcher
was exiting before the timer fired. `run-local.js` now waits ~3s and reports whether
the file landed. Output went from 323 to 324 files.

**`copyAllHeadElements` is a no-op.** drummercms.js:56 assigns each head element to
itself. Harmless in practice — `opmlHead` reaches the page through oldSchool's own
path — but it does nothing.

---

## HTTPS / upload issues

First upload to `https://andysylvester.com/files/DrummerBlog/` produced a wall of
`ERR_CONNECTION_RESET` and mixed-content errors. Three separate causes.

### 1. scripting.com and fargo.io don't serve HTTPS

The stock template loads ~20 assets with protocol-relative URLs
(`//scripting.com/...`). Served over `http://localhost` those resolve to HTTP and
work; served over HTTPS they don't exist. Verified:

```
FAIL  https://scripting.com/code/includes/bootstrap.css
200   http://scripting.com/code/includes/bootstrap.css
FAIL  https://fargo.io/.../medium-editor.js
```

jQuery failing is what produced `$ is not defined`.

Fix: the origin S3 buckets do serve HTTPS. `templates/minimal-https/index.html`
rewrites every reference to `//s3.amazonaws.com/scripting.com/...` and
`//s3.amazonaws.com/fargo.io/...`. All 11 distinct assets confirmed 200 over HTTPS.

This is the same approach the reference blog uses — Frank McPherson's template
(`https://shared.frankmcpherson.net/html/newtemplate.html`) is the stock template
with exactly these substitutions.

oldSchool fetches the template over HTTP, so `run-local.js` serves `./templates` on
port 1411 and `config.defaultTemplate` points at
`http://localhost:1411/minimal-https/index.html`.

### 2. baseUrl was still localhost

`baseUrl` was `http://localhost:8080/blog/` for local review, so every permalink was
baked with it — 229 dead links in the first upload. Not visible in the console,
because they're navigation links rather than subresources. Now
`https://andysylvester.com/files/DrummerBlog/`.

### 3. radio3.io has lapsed

The stock template loads `//radio3.io/code/pagestyles.css`. That domain now redirects
to `debet168.com` — someone else controls it. Only CSS here, but worth knowing.
`templates/minimal-https/` points at
`//s3.amazonaws.com/radio3.io/code/pagestyles.css`, which still works. Frank's
template still has the live `radio3.io` URL.

---

## Month archive pages

A local build produced only one archive page — an empty `2026/09/index.html` — and
no year pages at all. This is not a missing setting; there is no setting for it.

`publishMonthArchivePage` (oldschool.js:1344) opens with `var now = new Date ()` and
builds exactly one page per run, for the current calendar month. No loop over the
months that have posts, no backfill. On the live service the pages accumulate only
because the server has run for years, writing each month's page while it was the
current month. Verified against the live copy of this blog:

```
404  2021/08     <- posts exist, but no build ran during that month
404  2022/01     <- same
200  2023/08     <- the last two months of activity
200  2023/09
404  2023/10     <- after posting stopped
```

Year index pages don't exist in Old School at all — no year-archive code in the
library, and the live service 404s on year URLs for every blog checked. 0.8.16 is
the latest on npm, so there's no upgrade that adds either.

**`build-archives.js`** fills in the month pages after a build. The ingredients are
already on disk: `data/pages/<blog>/YYYY/MM/DD.html` is exactly what oldSchool reads
through `blogData.htmlArchive`, and a month page is those days newest-first, each
wrapped in `divArchivePageDay`.

For the page shell it reuses the one archive page oldSchool did build this run, so
the template, metadata and config block are byte-identical to the real code path
rather than reconstructed. Only three things change: the title, the `og:url`, and the
body. The `[%bodytext%]` macro appears **twice** in the template (`divTabContent` and
`divDayContainer`) and both copies must be replaced; the anchors are derived from the
template at runtime rather than hardcoded.

Produces 26 month pages. Checked against the live `2023/09` page: same title string,
same day order, same doubled body, and an identical structural marker set apart from
four blogroll elements (`divSidebar`, `divSpacerCell`, `divBlogrollContainer`,
`idBlogrollContainer`) that the current template has and the 2023-vintage one didn't.
Rendered side by side in Chrome — indistinguishable.

Note: viewing the live archive page over HTTPS shows it completely unstyled, because
it uses the stock template. Same root cause as the upload problem below.

It exports `buildArchives (blogName, flVerbose)` and `run-local.js` calls it once the
build returns 200, so one command does the whole job. `--no-archives` skips the step.

---

## calendar.json only gets written when it changes

After chaining, a clean rebuild started reporting `calendar.json MISSING`, having
written it before. Not a regression — `readCalendarJson` (oldschool.js:196) fetches
`baseUrl + calendar.json` and only marks the calendar dirty if what it publishes
differs. Now that the blog is uploaded and the live copy is current, oldSchool
correctly decides there's nothing to write, and a fresh `./output` ends up without a
file every page references through `urlCalendar`.

`run-local.js` handles it: if the build didn't write one, it fetches the copy at
`baseUrl` — which is by definition the current one, since that's what oldSchool just
compared against — so the upload bundle stays complete. On a first-ever build the
fetch fails, the calendar starts empty, every day marks it dirty and oldSchool writes
it itself, so that path doesn't arise.

---

## Header image — resolved

The header banner rendered as a solid black bar on the first HTTPS upload. The value
came from `urlHeaderImage` in `blog.opml`'s head, and `getValueFromOpmlHead` makes the
OPML value win over `config.defaultHeaderImage`, so it couldn't be fixed from config —
it had to change in the OPML:

```xml
<urlHeaderImage>https://s3.amazonaws.com/scripting.com/images/2021/05/10/pissaro.png</urlHeaderImage>
```

Worth remembering how this presented: **it produced no console error.** A CSS
`background-image` that fails to load is silent. The console was completely clean
while the banner was plainly broken; the failure only showed up in the network log as
a 503 on `https://scripting.com/images/2021/05/10/pissaro.png` (Chrome auto-upgrades
the HTTP URL, and scripting.com has no HTTPS). When something looks wrong but the
console is clean, check the network panel.

Changed in `blog.opml`, rebuilt and re-uploaded. Live page now carries the S3 URL in
both the banner and `og:image`, and it returns 200.

---

## Verification done

- Structural diff of generated `index.html` against the reference blog: identical
  class/id sets, except three content-driven classes (`divInlineImage`, `imgInline`,
  `spRenderedMarkdown`) that only appear because Frank's posts contain inline images
  and markdown items.
- All `[%...%]` template macros resolved; none left unexpanded.
- Rendered in Chrome: header band, Blog/About tabs, day headings, titled items, `#`
  permalinks all correct.
- About tab fetches `drummer.land/sylvester.andy@gmail.com/about.opml` live and
  renders.
- Item permalinks render standalone (`/blog/2023/09/17/215338.html`).
- Console clean after the HTTPS template swap.
- No `localhost` links and no HTTP-only subresources in the output. The only
  `localhost` string left is `urlTemplate` in the page's inert metadata block; the
  client `code.js` never reads it.

### Confirmed on the live site

After the final upload, against `https://andysylvester.com/files/DrummerBlog/`:

- All 31 page subresources (scripts, stylesheets, fonts, header image) return 200
  over HTTPS. Zero failures.
- All 34 published files reachable — 28 index pages (home + 26 month archives + the
  current month), `calendar.json`, `rss.xml`, `rss.json`, `index.json`,
  `homepage.html`, `fb/rss.xml`.
- Live copies of the home page, three month archives, a day page, an item permalink,
  `calendar.json` and `rss.xml` are byte-identical to the local build.
- Earlier browser pass (before the header-image fix): console clean, tabs working,
  About tab loading `about.opml` live, month archives rendering newest-first.

Two requests sit permanently pending in the browser:
`s3.amazonaws.com/scripting.com/code/blogroll/blogroll.{js,css}`. They aren't
referenced by these pages — `blogroll.js` from code.scripting.com requests them
itself. Both return 200 when fetched directly, and with no blogroll configured there
is no visible effect.

---

## Notes for next time

**Blogroll sidebar.** Frank has an "Other Blogs" sidebar; this blog doesn't. That's
not the template — it's four head elements in his `blog.opml` that pass through
verbatim into the page's `opmlHead`, where `blogroll.js` picks them up:

```
"blogrollUsername": "fjmnotes",
"blogrollServer": "https://feedland.com",
"blogrollTitle": "Other Blogs",
"blogrollCategory": "blogger",
```

The container div (`divBlogrollContainer`) is already in the generated pages, just
empty. Adding those four to `blog.opml` with your own FeedLand username and category
should populate it — the passthrough was confirmed working.

**Building from Drummer directly** rather than locally needs a publicly reachable
`urlTemplate`. Upload `templates/minimal-https/index.html` to your own site and set
`urlTemplate` in `blog.opml`'s head, the way Frank does.

**Commands**

```
node run-local.js andysylvester              # build + month archives into ./output
node serve-local.js                          # review at http://localhost:8080/blog/

node run-local.js andysylvester --keep-alive # build, leave server up on :1410
node run-local.js andysylvester --no-archives # skip the month archive step
node build-archives.js andysylvester         # rebuild just the archives
rm -rf output data                           # force a clean rebuild
```

`build-archives.js` reads the day cache in `data/` and the archive page the build
just wrote, so standalone runs need a `run-local.js` build to have happened first.
