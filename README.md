# luak

A minimal static site generator for blogging. Converts Markdown articles into HTML pages.

## Usage

```bash
npm install
node luak.js
```

Output goes to `public/`.

## Config

Edit `config.js` to set site title, subtitle, base URL, and links.

## Templates

- `templates/article.html` — EJS template for article pages
- `templates/index.html` — EJS template for the homepage
- `templates/style.css` — site stylesheet

## Articles

Write Markdown files in `articles/` named `YYYY-MM-DD-slug.md`.

## License

MIT
