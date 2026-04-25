import * as vscode from 'vscode';
import { GrassViewProvider } from './grassViewProvider';
import { GrassState } from './grassState';
import { getRandomMessage, getFirstTouchMessage, getUiStrings } from './messages';

const NOTIF_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 1 day

export function activate(context: vscode.ExtensionContext): void {
  const state = new GrassState(context);
  const provider = new GrassViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(GrassViewProvider.viewType, provider)
  );

  // Send state when view becomes visible
  const sendState = () => {
    const lang = vscode.workspace.getConfiguration('vscodeGrass').get<string>('messageLanguage', 'en');
    provider.postMessage({ type: 'state', data: state.serialize(), ui: getUiStrings(lang) });
  };

  // Handle messages from webview
  provider.setMessageHandler((raw) => {
    const message = raw as { type: string };
    const lang = vscode.workspace.getConfiguration('vscodeGrass').get<string>('messageLanguage', 'en');
    const ui = getUiStrings(lang);

    switch (message.type) {
      case 'ready':
        sendState();
        break;
      case 'touch': {
        const isFirst = state.touchCount === 0;
        const currentStage = state.getStage();
        state.touch();
        if (isFirst) {
          vscode.window.showInformationMessage(getFirstTouchMessage(lang));
        } else {
          vscode.window.showInformationMessage(getRandomMessage(lang, currentStage, state.touchCount));
        }
        sendState();
        break;
      }
      case 'water': {
        const remaining = state.waterCooldownRemaining();
        if (remaining > 0) {
          const secs = Math.ceil(remaining / 1000);
          const display = secs >= 60 ? `${Math.ceil(secs / 60)}min` : `${secs}s`;
          vscode.window.showWarningMessage(ui.stillRefilling.replace('{display}', display));
        } else {
          provider.postMessage({ type: 'water' });
        }
        break;
      }
      case 'mow':
        provider.postMessage({ type: 'mow' });
        break;
      case 'waterDone':
        state.water();
        sendState();
        break;
      case 'waterBlocked':
        break;
      case 'mowDone':
        state.mow();
        sendState();
        break;
      case 'analyticsToggled': {
        const msg2 = raw as { type: string; open: boolean };
        state.setAnalyticsOpen(msg2.open);
        break;
      }
      case 'resetTouchCount':
        state.resetTouchCount();
        sendState();
        break;
      case 'devReset':
        state.reset();
        sendState();
        break;
      case 'devKill':
        state.kill();
        sendState();
        break;
      case 'visitor': {
        const msg = raw as { type: string; animal: string };
        state.recordVisitor(msg.animal);
        break;
      }
      case 'setSeasonOverride': {
        const msg = raw as { type: string; month: number | null };
        state.setSeasonOverride(msg.month);
        sendState();
        break;
      }
    }
  });

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('vscode-grass.water', () => {
      const lang2 = vscode.workspace.getConfiguration('vscodeGrass').get<string>('messageLanguage', 'en');
      const ui2 = getUiStrings(lang2);
      const remaining = state.waterCooldownRemaining();
      if (remaining > 0) {
        const secs = Math.ceil(remaining / 1000);
        const display = secs >= 60 ? `${Math.ceil(secs / 60)}min` : `${secs}s`;
        vscode.window.showWarningMessage(ui2.stillRefilling.replace('{display}', display));
        return;
      }
      provider.postMessage({ type: 'water' });
    }),

    vscode.commands.registerCommand('vscode-grass.mow', () => {
      provider.postMessage({ type: 'mow' });
    }),

    vscode.commands.registerCommand('vscode-grass.toggleAnalytics', () => {
      provider.postMessage({ type: 'toggleAnalytics' });
    }),

    // DEV ONLY — uncomment + add to package.json commands to enable
    // vscode.commands.registerCommand('vscode-grass.setStage', async () => {
    //   const stage = await vscode.window.showQuickPick(
    //     ['sprout', 'short', 'normal', 'tall', 'jungle', 'dead'],
    //     { placeHolder: 'Select stage' }
    //   );
    //   if (stage) {
    //     state.setStage(stage as any);
    //     sendState();
    //   }
    // }),

    vscode.commands.registerCommand('vscode-grass.resetTouchCount', () => {
      const lang2 = vscode.workspace.getConfiguration('vscodeGrass').get<string>('messageLanguage', 'en');
      const ui2 = getUiStrings(lang2);
      state.resetTouchCount();
      sendState();
      vscode.window.showInformationMessage(ui2.touchCountReset);
    }),

    vscode.commands.registerCommand('vscode-grass.reset', async () => {
      const lang2 = vscode.workspace.getConfiguration('vscodeGrass').get<string>('messageLanguage', 'en');
      const ui2 = getUiStrings(lang2);
      const answer = await vscode.window.showWarningMessage(
        ui2.resetConfirmMsg,
        { modal: true },
        ui2.resetConfirmBtn
      );
      if (answer === ui2.resetConfirmBtn) {
        state.reset();
        sendState();
      }
    })
  );

  // Passive notifications - check on startup and every hour
  const checkNotifications = () => {
    const enabled = vscode.workspace.getConfiguration('vscodeGrass').get<boolean>('enableNotifications', true);
    if (!enabled) return;

    const now = Date.now();
    if (now - state.lastNotified < NOTIF_COOLDOWN_MS) return;

    const daysSinceWatered = (now - state.lastWatered) / (1000 * 60 * 60 * 24);
    const stage = state.getStage();

    const notifLang = vscode.workspace.getConfiguration('vscodeGrass').get<string>('messageLanguage', 'en');
    const notifUi = getUiStrings(notifLang);
    if (daysSinceWatered > 3) {
      vscode.window.showWarningMessage(notifUi.grassThirsty, notifUi.waterItBtn).then(sel => {
        if (sel === notifUi.waterItBtn) vscode.commands.executeCommand('vscode-grass.water');
      });
      state.markNotified();
    } else if (stage === 'jungle') {
      vscode.window.showWarningMessage(notifUi.lawnOutOfControl, notifUi.mowBtn).then(sel => {
        if (sel === notifUi.mowBtn) vscode.commands.executeCommand('vscode-grass.mow');
      });
      state.markNotified();
    }
  };

  checkNotifications();
  const notifInterval = setInterval(checkNotifications, 60 * 60 * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(notifInterval) });

  // Push state updates to webview periodically so stage changes are visible without user interaction
  const dev = vscode.workspace.getConfiguration('vscodeGrass').get<boolean>('devMode', false);
  const stateInterval = setInterval(sendState, dev ? 1000 : 5000);
  context.subscriptions.push({ dispose: () => clearInterval(stateInterval) });
}

export function deactivate(): void {}
