# Shagbaor Hycent Amool — personal website

The words on this website live in `content.json`. You change them in a
simple form-based editor at **/admin**. You never need to touch the code.

## One-time setup (about 15 minutes)

1. **Create a GitHub account** at github.com (for example, username `shagbaor`).
2. **Create a repository** named exactly `YOUR-USERNAME.github.io`
   (for example `shagbaor.github.io`). Set it to **Public**.
3. **Add your username to the editor settings.** Open `admin/config.yml` in
   any text editor and replace `YOUR-GITHUB-USERNAME` with your username.
   It appears 3 times. This is the only file edit you ever need to make.
4. **Upload the files.** In the new repository, click **Add file → Upload files**.
   Drag in everything inside this folder (`index.html`, `content.json`,
   `README.md` and the `admin` and `images` folders). Click **Commit changes**.
5. **Turn on GitHub Pages.** Go to **Settings → Pages**. Under *Build and
   deployment*, choose **Deploy from a branch**, then **main** and **/(root)**, and click **Save**.
   After a minute or two, your site is live at `https://YOUR-USERNAME.github.io`.

## Editing the site from now on

1. Go to `https://YOUR-USERNAME.github.io/admin/`.
2. Click **Sign In Using Access Token**. The dialog links to a GitHub page
   where you create the token. Create it, copy it, paste it into the dialog and sign in.
   Your browser remembers it, so you only do this once per device.
3. Open **Website → Website content** and make your changes:
   - **Edit** any text directly.
   - **Add** items (a new job, award, talk or link) with the *Add* buttons.
   - **Remove** an item or section with its ✕ button.
   - **Reorder** items or sections by dragging the handle.
   - **Hide** an item or section with its toggle. It stays saved but doesn't appear on the site.
   - **Add a new section** with *Sections → Add Sections*. Pick a layout:
     research feature, timeline, project cards, columns, table, links or plain text.
   - **Add a photo** under *Top of page → Portrait photo*.
4. Click **Save**. The site updates within a minute or two.

Text formatting in the editor: `**bold**`, `*italic*`, `[link text](https://…)`.
Leave a blank line between paragraphs.

## Good to know

- **Hidden isn't private.** Hidden items don't show on the page, but they
  are still in the public `content.json` file. Keep anything confidential off
  the site until it's ready to share.
- **Section links.** "Reading as" buttons highlight sections by their *Link ID*
  (for example `research`). If you rename a Link ID, update it there too.
- **Custom domain.** Buy a domain (e.g. `shagbaor.com`), then add it under
  **Settings → Pages → Custom domain** and follow GitHub's DNS instructions.
- **Previewing on your computer.** Double-clicking `index.html` shows a
  "needs a web server" note. That's expected: the site loads `content.json`,
  which browsers only allow over the web. Check changes on the live site instead.
