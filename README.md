# Israel Allen, personal site

Live at **https://lukeanthony.co**. A hand-written, multi-page, static site: a home page with a text-drawn crystal, About, Work (with an interactive timeline), Resume, a 3D Lab, a 38-second ASCII film and Contact. No frameworks, no libraries, no build step, no cookies and no analytics.

## What's here

| Path | What it is |
| --- | --- |
| `index.html`, `about.html`, `work.html`, `resume.html`, `lab.html`, `film.html`, `contact.html` | The pages |
| `privacy.html`, `terms.html`, `accessibility.html`, `credits.html` | The legal and information pages (also as `.md` files) |
| `assets/css/` | Styles (`site.css` for the site, `film.css` for the film) |
| `assets/js/` | `core.js` (theme, menu, console), `glyph.js` and `scene-*.js` (the text art), `lab3d.js` (WebGL), `work.js` (timeline), `film.js` |
| `assets/img/` | Images and icons |
| `assets/Israel_Allen_Resume.pdf` | The downloadable resume |
| `CNAME`, `.nojekyll`, `robots.txt`, `sitemap.xml`, `404.html` | Publishing files |

## Run it on your computer

The 3D lab loads images, and browsers block that when you double-click a file. Run a tiny local server instead:

```
python3 -m http.server 8000
```

(on Windows, `py -m http.server 8000`), then open http://localhost:8000. The scripts in `tools/` do this for you.

## Publish it (GitHub Pages and lukeanthony.co)

1. On GitHub, create a **public**, empty repository named `izzyallen876.github.io`.
2. Push this folder to it (`tools/push-to-github.sh`, GitHub Desktop, or drag the files into the web uploader).
3. In the repository go to **Settings, Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`. Under **Custom domain** enter `lukeanthony.co` and save. Do this before changing DNS.
4. At your domain registrar, add these records for `lukeanthony.co`:
   - four **A** records: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - four **AAAA** records (optional, for IPv6): `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - one **CNAME** record: `www` pointing to `izzyallen876.github.io`
5. DNS can take up to 24 hours. When GitHub finishes its check, tick **Enforce HTTPS**.

## Before you publish

- Fill in `ASSETS.md` for the two third-party images, or replace them. This is the one legal item that can't be done for you.
- Check that each lab, employer and program on the Work and Resume pages is happy to be named publicly.
- Decide whether the email address on the site is the one you want to keep using after you graduate.

## Changing things

- Work history lives in `work.html` and `resume.html`. If you add a role, also add it to the `ROLES` list at the top of `assets/js/work.js` so it appears on the timeline.
- To regenerate the PDF resume, open `resume.html`, press **Print**, and save as PDF into `assets/Israel_Allen_Resume.pdf`.
- Update the "last updated" date in `privacy.html`, `terms.html` and `accessibility.html` if you change them.

## Licenses

Code is MIT. Text and design are all rights reserved. See `NOTICE.md` for the full map, `LICENSE`, `LICENSE-CONTENT.md` and `ASSETS.md`.

## Contact

israel.l.allen.28@dartmouth.edu
