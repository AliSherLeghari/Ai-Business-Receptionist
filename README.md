# AI Business Receptionist

A new browser-based PWA project using plain HTML, CSS, and JavaScript.

## Development environment

Use `/workspace/Ai-Business-Receptionist` as the working directory.
The cloud environment already provides Python 3, Node.js, Git, and Chromium.
No dependency installation, setup script, paid APIs, cloud database, Flutter,
or Android SDK is required.

Start a local preview with the saved VS Code task **Preview static project**, or:

```sh
cd /workspace/Ai-Business-Receptionist
python3 -m http.server 8000 --bind 0.0.0.0
```

Open `http://localhost:8000` locally, or use the environment's forwarded port
8000 URL. The repository currently contains no application files, so the server
shows a directory listing until `index.html` is added. Stop it with Ctrl+C.
This server is for development only.

## Testing and building

- Preview the application in a browser and use developer tools to check console
  errors, responsive layouts, and network requests.
- Once JavaScript files exist, check syntax with `node --check path/to/file.js`.
- Check changes with `git diff --check` and `git status --short`.
- No build step is needed: HTML, CSS, JavaScript, and assets are the deployment
  output. Publish only application files to a static host.
- When PWA features are implemented, test the manifest, installation, and offline
  behavior in browser developer tools. Service workers require HTTPS or localhost;
  use an HTTPS forwarded URL for remote preview.

## Saved environment settings

Editor defaults and the preview task are stored in `.vscode/`. For the cloud
environment's publish/settings screen, use:

| Setting | Value |
| --- | --- |
| Repository | `AliSherLeghari/Ai-Business-Receptionist` |
| Base branch | `main` |
| Project directory | `/workspace/Ai-Business-Receptionist` |
| Setup/install command | None; leave blank |
| Build command | None; leave blank |
| Preview command | `python3 -m http.server 8000 --bind 0.0.0.0` |
| Preview port | `8000` |
| Required secrets | None |

The `.vscode` files configure editor tasks; they do not publish or change Codex
cloud settings. Publishing the environment remains an action in the Codex UI.
