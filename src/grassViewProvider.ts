import * as vscode from 'vscode';
import * as crypto from 'crypto';

export class GrassViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'vscodeGrass.grassView';

  private _view?: vscode.WebviewView;
  private _messageHandler?: (message: unknown) => void;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')]
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    // Wire up handler registered before the view was ready
    if (this._messageHandler) {
      webviewView.webview.onDidReceiveMessage(this._messageHandler);
    }

    // State will be sent when webview posts 'ready'
  }

  private _getHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('hex');

    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css')
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${cssUri}" rel="stylesheet">
  <title>VS Code Grass</title>
</head>
<body>
  <div id="header">
    <div id="dev-panel" class="dev-panel" style="display:none">
      <span class="dev-label">DEV</span>
      <button id="dev-butterfly">🦋</button>
      <button id="dev-snail">🐌</button>
      <button id="dev-goat">🐐</button>
      <button id="dev-cow">🐄</button>
      <button id="dev-unicorn">🦄</button>
      <button id="dev-reset-touch" title="Reset touch count">👆0</button>
      <button id="dev-kill" title="Kill the grass">💀</button>
      <select id="dev-season">
        <option value="">🌍 real</option>
        <option value="2">🌸 spring</option>
        <option value="6">☀️ summer</option>
        <option value="9">🍂 autumn</option>
        <option value="11">❄️ winter</option>
      </select>
    </div>
    <div id="analytics-panel" class="analytics-panel" style="display:none"></div>
  </div>
  <div class="grass-scene">
    <div id="water-cooldown" class="water-cooldown" style="display:none"></div>
    <div id="grass-root" class="grass-container" tabindex="0" aria-label="Virtual lawn, click to touch grass" role="button"></div>
  </div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }

  public postMessage(message: unknown): void {
    this._view?.webview.postMessage(message);
  }

  public setMessageHandler(handler: (message: unknown) => void): void {
    this._messageHandler = handler;
    // If view is already up, wire immediately
    if (this._view) {
      this._view.webview.onDidReceiveMessage(handler);
    }
  }
}
