const fs = require("fs");
const marked = require("marked");
const ejs = require("ejs");

const config = require("./config.js");

function stripBOM(s) {
  if (s && s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s;
}

function htmlEscape(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function xmlEscape(s) {
  return htmlEscape(s).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function generateFeed(posts, cfg) {
  if (posts.length === 0) return "";
  const items = posts.map((p) => {
    const url = `${cfg.base_url}/${p.filename}`;
    return [
      "  <entry>",
      `    <title>${xmlEscape(p.title)}</title>`,
      `    <link href="${url}"/>`,
      `    <id>${url}</id>`,
      `    <updated>${p.date}T00:00:00Z</updated>`,
      "  </entry>",
    ].join("\n");
  });
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>${xmlEscape(cfg.title)}</title>`,
    `  <link href="${cfg.base_url}/feed.xml" rel="self"/>`,
    `  <link href="${cfg.base_url}"/>`,
    `  <updated>${posts[0].date}T00:00:00Z</updated>`,
    `  <id>${cfg.base_url}</id>`,
    `  <author><name>${xmlEscape(cfg.title)}</name></author>`,
    ...items,
    "</feed>",
    "",
  ].join("\n");
}

function build() {
  console.log("building...");
  const start = Date.now();

  try { fs.rmSync("public", { recursive: true, force: true }); } catch {}
  fs.mkdirSync("public", { recursive: true });
  fs.copyFileSync("templates/style.css", "public/style.css");

  let filenames;
  try {
    filenames = fs
      .readdirSync("articles")
      .filter((f) => f.endsWith(".md"))
      .sort();
  } catch {
    filenames = [];
  }

  if (filenames.length === 0) {
    console.log("warning: no .md files found in articles/");
    return;
  }

  const posts = [];
  for (const fn of filenames) {
    const m = fn.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) {
      console.log(`  skip ${fn} (filename must start with YYYY-MM-DD)`);
      continue;
    }

    let content;
    try {
      content = fs.readFileSync(`articles/${fn}`, "utf-8");
    } catch (err) {
      console.log(`  skip ${fn} (${err.message})`);
      continue;
    }

    content = stripBOM(content);

    const lines = content.replace(/\r\n/g, "\n").split("\n");
    let title = "";
    const titleMatch = lines[0] && lines[0].match(/^# (.+)/);
    if (titleMatch) {
      title = titleMatch[1];
      lines.shift();
    }
    const md = lines.join("\n");

    let html;
    try {
      html = marked.parse(md);
    } catch (err) {
      console.log(`  skip ${fn} (markdown error: ${err.message})`);
      continue;
    }

    if (!title) {
      title = fn
        .slice(12)
        .replace(/\.md$/, "")
        .replace(/[-_]/g, " ");
    }

    posts.push({
      filename: fn.replace(/\.md$/, ".html"),
      date: `${m[1]}-${m[2]}-${m[3]}`,
      year: parseInt(m[1], 10),
      month: parseInt(m[2], 10),
      day: parseInt(m[3], 10),
      title,
      content: html,
    });
    console.log(`  + ${fn}`);
  }

  if (posts.length === 0) {
    console.log("no valid posts");
    return;
  }

  posts.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    if (a.month !== b.month) return b.month - a.month;
    return b.day - a.day;
  });

  let indexTpl, articleTpl;
  try {
    indexTpl = fs.readFileSync("templates/index.html", "utf-8");
    articleTpl = fs.readFileSync("templates/article.html", "utf-8");
  } catch (err) {
    console.error("failed to load templates:", err.message);
    return;
  }

  const renderArticle = ejs.compile(articleTpl);
  const renderIndex = ejs.compile(indexTpl);

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const navParts = [];
    if (i < posts.length - 1) {
      navParts.push(
        `<a href="${posts[i + 1].filename}">&laquo; ${posts[i + 1].title}</a>`,
      );
    }
    if (i > 0) {
      navParts.push(
        `<a href="${posts[i - 1].filename}">${posts[i - 1].title} &raquo;</a>`,
      );
    }
    const nav =
      navParts.length > 0
        ? `<nav class="pager">${navParts.join(" | ")}</nav>`
        : "";

    const html = renderArticle({
      title: post.title,
      date: post.date,
      content: post.content,
      site_title: config.title,
      subtitle: config.subtitle || "",
      nav,
      count: config.count || "",
    });
    fs.writeFileSync(`public/${post.filename}`, html, "utf-8");
    console.log(`  -> ${post.filename}`);
  }

  const yearGroups = [];
  let curYear = null;
  let curItems = [];
  let openCnt = 3;
  for (const post of posts) {
    if (post.year !== curYear) {
      if (curYear !== null) {
        const open = openCnt > 0 ? " open" : "";
        openCnt--;
        yearGroups.push(
          `<details${open}><summary>${curYear}</summary><ul>${curItems.join("")}</ul></details>`,
        );
      }
      curYear = post.year;
      curItems = [];
    }
    curItems.push(
      `<li><a href="${post.filename}">${post.title}</a> <small>${post.date}</small></li>`,
    );
  }
  if (curYear !== null) {
    const open = openCnt > 0 ? " open" : "";
    yearGroups.push(
      `<details${open}><summary>${curYear}</summary><ul>${curItems.join("")}</ul></details>`,
    );
  }

  let linksHtml = "";
  if (config.links && config.links.length > 0) {
    const items = config.links.map(
      (l) => `<li><a href="${l.url}">${l.title}</a></li>`,
    );
    linksHtml = `<ul>${items.join("")}</ul>`;
  }

  const now = new Date();
  const buildTime = now.toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  const elapsed = ((now - start) / 1000).toFixed(2);

  const indexHtml = renderIndex({
    title: config.title,
    subtitle: config.subtitle || "",
    posts: yearGroups.join("\n"),
    links_section: linksHtml,
    post_count: posts.length,
    build_time: buildTime,
    build_duration: elapsed,
    count: config.count || "",
  });
  fs.writeFileSync("public/index.html", indexHtml, "utf-8");
  console.log("  -> index.html");

  const feed = generateFeed(posts, config);
  if (feed) {
    fs.writeFileSync("public/feed.xml", feed, "utf-8");
    console.log("  -> feed.xml");
  }

  console.log(`done - ${posts.length} article(s) in ${elapsed}s`);
}

build();
