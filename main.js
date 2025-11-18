const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios'); // ★ 追加
const validator = require('./validator'); // セキュリティ検証用

// デバッグモード（環境変数で制御）
const DEBUG = process.env.NODE_ENV !== 'production';
const log = (...args) => DEBUG && console.log(...args);
const logError = (...args) => console.error(...args); // エラーは常に出力

let win;
let settingsWin;
let tray;
// ★ まずは OFF（=false）で検証しやすく
let clickThrough = false;

function createWindow() {
  win = new BrowserWindow({
    width: 520,
    height: 320,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // ローカルファイルアクセスのためsandboxを無効化
      webSecurity: true, // セキュリティ有効化
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('index.html');

  // 常に最前面に維持（レベルを最高に設定）
  win.setAlwaysOnTop(true, 'screen-saver');

  // フォーカスを失っても最前面を維持
  win.on('blur', () => {
    if (win && !win.isDestroyed()) {
      win.setAlwaysOnTop(true, 'screen-saver');
    }
  });

  setIgnoreMouseEvents(clickThrough);
}

function setIgnoreMouseEvents(enabled) {
  if (!win) return;
  win.setIgnoreMouseEvents(enabled, { forward: true });
}

function registerGlobalShortcuts(shortcuts = DEFAULT_SHORTCUTS) {
  // 既存のショートカットをすべて解除
  globalShortcut.unregisterAll();

  // トグル（開始/停止）
  if (shortcuts.toggleStartStop) {
    const ok = globalShortcut.register(shortcuts.toggleStartStop, () => {
      if (win && win.webContents) {
        win.webContents.send('toggle-start-stop');
      }
    });
    if (!ok) {
      logError(`[globalShortcut] ${shortcuts.toggleStartStop} の登録に失敗しました`);
    } else {
      log(`[globalShortcut] ${shortcuts.toggleStartStop} 登録済み (開始/停止)`);
    }
  }

  // フェーズショートカット
  const phases = [
    { key: shortcuts.phase1, sec: 0,          name: '午前フェーズ (0:00)' },
    { key: shortcuts.phase2, sec: 4 * 60 + 30, name: '午前収縮 (4:30)' },
    { key: shortcuts.phase3, sec: 7 * 60 + 30, name: '午後フェーズ (7:30)' },
    { key: shortcuts.phase4, sec: 11 * 60,     name: '午後収縮 (11:00)' }
  ];

  phases.forEach(p => {
    if (p.key) {
      const registered = globalShortcut.register(p.key, () => {
        if (win && win.webContents) {
          win.webContents.send('start-from-phase', p.sec);
        }
      });
      if (registered) {
        log(`[globalShortcut] ${p.key} 登録済み (${p.name})`);
      } else {
        logError(`[globalShortcut] ${p.key} の登録に失敗しました`);
      }
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '最前面に移動',
      click: () => {
        if (win && !win.isDestroyed()) {
          win.setAlwaysOnTop(true, 'screen-saver');
          win.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: '背景画像を設定',
      click: () => createSettingsWindow()
    },
    { type: 'separator' },
    {
      label: 'フェーズから開始',
      submenu: [
        {
          label: '0:00 - 午前フェーズ (Ctrl+1)',
          click: () => {
            if (win && win.webContents) {
              win.webContents.send('start-from-phase', 0);
            }
          }
        },
        {
          label: '4:30 - 午前収縮 (Ctrl+2)',
          click: () => {
            if (win && win.webContents) {
              win.webContents.send('start-from-phase', 4 * 60 + 30);
            }
          }
        },
        {
          label: '7:30 - 午後フェーズ (Ctrl+3)',
          click: () => {
            if (win && win.webContents) {
              win.webContents.send('start-from-phase', 7 * 60 + 30);
            }
          }
        },
        {
          label: '11:00 - 午後収縮 (Ctrl+4)',
          click: () => {
            if (win && win.webContents) {
              win.webContents.send('start-from-phase', 11 * 60);
            }
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: clickThrough ? 'クリック透過をOFF' : 'クリック透過をON',
      click: () => {
        clickThrough = !clickThrough;
        setIgnoreMouseEvents(clickThrough);
        createTray();
      }
    },
    { type: 'separator' },
    { label: '終了', click: () => app.quit() }
  ]);

  tray.setToolTip('Overlay Timer');
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(async () => {
  createWindow();

  // 保存された設定を読み込んでショートカットキーを登録
  const savedSettings = loadBackgroundSettings();
  const shortcuts = savedSettings?.shortcuts || DEFAULT_SHORTCUTS;
  registerGlobalShortcuts(shortcuts);

  createTray();

  // 保存された背景設定を適用
  if (win && win.webContents) {
    win.webContents.on('did-finish-load', () => {
      log('[Main] Window finished loading');
      if (savedSettings) {
        log('[Main] Applying saved settings on startup:', savedSettings);
        win.webContents.send('apply-background', savedSettings);
      }
    });
  }

  // VOICEVOXパスが設定されていれば自動起動
  if (savedSettings?.voicevoxPath) {
    log('[Main] Auto-launching VOICEVOX from:', savedSettings.voicevoxPath);
    const result = await launchVoicevox(savedSettings.voicevoxPath);
    if (result.success) {
      log('[Main] VOICEVOX auto-launch successful');
      // 設定ウィンドウが開いていればVOICEVOX準備完了を通知
      if (settingsWin && !settingsWin.isDestroyed()) {
        settingsWin.webContents.send('voicevox-ready');
      }
    } else {
      log('[Main] VOICEVOX auto-launch failed:', result.error);
    }
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();

  // VOICEVOXプロセスをクリーンアップ
  if (voicevoxProcess && !voicevoxProcess.killed) {
    log('[VOICEVOX] Cleaning up process');
    try {
      voicevoxProcess.kill();
    } catch (e) {
      logError('[VOICEVOX] Failed to kill process:', e);
    }
  }
});

/* =========================
   設定ウィンドウ
   ========================= */

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }

  settingsWin = new BrowserWindow({
    width: 1500,
    height: 750,
    title: '背景画像設定',
    resizable: false,
    minimizable: true,
    maximizable: false,
    alwaysOnTop: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  settingsWin.loadFile('settings.html');
  settingsWin.setMenu(null);

  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}

// 設定ファイルのパス
const settingsPath = path.join(app.getPath('userData'), 'background-settings.json');

// レンダラーから設定ウィンドウを開くリクエスト
ipcMain.on('open-settings', () => {
  createSettingsWindow();
});

// デフォルトのショートカットキー
const DEFAULT_SHORTCUTS = {
  toggleStartStop: 'CommandOrControl+S',
  phase1: 'CommandOrControl+1',
  phase2: 'CommandOrControl+2',
  phase3: 'CommandOrControl+3',
  phase4: 'CommandOrControl+4'
};

// VOICEVOX実行ファイルのデフォルトパス
const DEFAULT_VOICEVOX_PATH = 'C:\\Program Files\\VOICEVOX\\VOICEVOX.exe';

// 設定の読み込み
function loadBackgroundSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const rawSettings = JSON.parse(data);

      // ショートカットキーがない場合はデフォルト値を設定
      if (!rawSettings.shortcuts) {
        rawSettings.shortcuts = DEFAULT_SHORTCUTS;
      }

      // セキュリティ検証を実施
      const settings = validator.validateSettings(rawSettings);
      log('[Settings] Validated settings loaded');

      return settings;
    }
  } catch (e) {
    logError('[Settings] Load error:', e);

    // バックアップファイルを試行
    const backupPath = settingsPath + '.backup';
    if (fs.existsSync(backupPath)) {
      try {
        const backupData = fs.readFileSync(backupPath, 'utf8');
        const settings = JSON.parse(backupData);
        log('[Settings] Restored from backup');

        // バックアップから復元成功したら本体を上書き
        fs.writeFileSync(settingsPath, backupData);
        return settings;
      } catch (backupError) {
        logError('[Settings] Backup restore failed:', backupError);
      }
    }

    // エラーダイアログ表示
    if (settingsWin && !settingsWin.isDestroyed()) {
      dialog.showErrorBox(
        '設定ファイルエラー',
        '設定ファイルの読み込みに失敗しました。\nデフォルト設定で起動します。'
      );
    }
  }
  return null;
}

// 設定の保存
function saveBackgroundSettings(settings) {
  try {
    const jsonData = JSON.stringify(settings, null, 2);

    // 既存の設定ファイルをバックアップ
    if (fs.existsSync(settingsPath)) {
      const backupPath = settingsPath + '.backup';
      fs.copyFileSync(settingsPath, backupPath);
    }

    // 新しい設定を保存
    fs.writeFileSync(settingsPath, jsonData);
    log('[Settings] Saved successfully');
    return true;
  } catch (e) {
    logError('[Settings] Save error:', e);

    // エラーダイアログ表示
    if (settingsWin && !settingsWin.isDestroyed()) {
      dialog.showErrorBox(
        '保存エラー',
        `設定の保存に失敗しました。\n\n${e.message}`
      );
    }
    return false;
  }
}

// IPCハンドラー: フォント選択
ipcMain.handle('select-font', async () => {
  const result = await dialog.showOpenDialog({
    title: 'フォントファイルを選択',
    filters: [
      { name: 'フォント', extensions: ['ttf', 'otf'] }
    ],
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const originalPath = result.filePaths[0];

    // 拡張子の検証
    const allowedFontExtensions = ['ttf', 'otf'];
    if (!validator.validateFileExtension(originalPath, allowedFontExtensions)) {
      logError('[Font] Invalid file extension');
      return null;
    }

    const ext = path.extname(originalPath);
    const fontFileName = 'custom-font' + ext;
    const fontPath = path.join(app.getPath('userData'), fontFileName);

    try {
      // フォントファイルをコピー
      fs.copyFileSync(originalPath, fontPath);
      log('[Font] Copied to:', fontPath);
      return fontPath;
    } catch (e) {
      logError('[Font] Copy error:', e);
      return null;
    }
  }
  return null;
});

// IPCハンドラー: 画像選択
ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog({
    title: '背景画像を選択',
    filters: [
      { name: '画像', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }
    ],
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const originalPath = result.filePaths[0];

    // 拡張子の検証
    const allowedImageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
    if (!validator.validateFileExtension(originalPath, allowedImageExtensions)) {
      logError('[Image] Invalid file extension');
      return null;
    }

    try {
      // 画像を読み込んでリサイズ
      const image = nativeImage.createFromPath(originalPath);
      const size = image.getSize();

      // 最大幅を1920pxに制限（アスペクト比維持）
      const maxWidth = 1920;
      let newWidth = size.width;
      let newHeight = size.height;

      if (size.width > maxWidth) {
        const ratio = maxWidth / size.width;
        newWidth = maxWidth;
        newHeight = Math.round(size.height * ratio);
      }

      // リサイズが必要な場合
      if (newWidth !== size.width) {
        const resized = image.resize({ width: newWidth, height: newHeight, quality: 'good' });

        // 一時ファイルとして保存
        const resizedPath = path.join(app.getPath('userData'), 'background-resized.jpg');
        const jpegBuffer = resized.toJPEG(85); // 85%品質でJPEG圧縮
        fs.writeFileSync(resizedPath, jpegBuffer);

        log(`[Image] Resized from ${size.width}x${size.height} to ${newWidth}x${newHeight}`);
        return resizedPath;
      }

      return originalPath;
    } catch (e) {
      logError('[Image] Resize error:', e);
      return originalPath; // エラー時は元の画像を返す
    }
  }
  return null;
});

// IPCハンドラー: 設定読み込み
ipcMain.handle('load-settings', () => {
  return loadBackgroundSettings();
});

// IPCハンドラー: 設定保存
ipcMain.handle('save-settings', (_event, settings) => {
  // セキュリティ検証を実施
  const validatedSettings = validator.validateSettings(settings);
  const result = saveBackgroundSettings(validatedSettings);
  // ショートカットキーが変更された場合は再登録
  if (result && validatedSettings.shortcuts) {
    registerGlobalShortcuts(validatedSettings.shortcuts);
  }
  return result;
});

// IPCハンドラー: 設定適用
ipcMain.handle('apply-settings', (_event, settings) => {
  log('[Main] Applying settings to main window:', settings);
  if (win && win.webContents) {
    win.webContents.send('apply-background', settings);
    log('[Main] Sent apply-background to renderer');
  } else {
    logError('[Main] Main window not available');
  }
  return true;
});

// IPCハンドラー: ウィンドウを閉じる
ipcMain.handle('close-settings-window', () => {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.close();
  }
});

/* =========================
   VOICEVOX TTS（メイン側）
   ========================= */

// 設定：環境に合わせて変更可
const VOICEVOX_BASE = 'http://127.0.0.1:50021';
const DEFAULT_SPEAKER_ID = 8; // ずんだもん(ノーマル)の例。必要なら変更。
const { spawn } = require('child_process');
let voicevoxProcess = null;

/**
 * VOICEVOXを起動
 */
async function launchVoicevox(execPath) {
  // 既に起動中かチェック
  const isRunning = await checkVoicevoxConnection();
  if (isRunning) {
    log('[VOICEVOX] Already running');
    return { success: true, alreadyRunning: true };
  }

  // パスの検証
  const validatedPath = validator.validateVoicevoxPath(execPath);
  if (!validatedPath) {
    logError('[VOICEVOX] Invalid path:', execPath);
    return { success: false, error: '無効なVOICEVOXパスです' };
  }

  // 実行ファイルの存在確認
  if (!fs.existsSync(validatedPath)) {
    logError('[VOICEVOX] Executable not found:', validatedPath);
    return { success: false, error: 'ファイルが見つかりません' };
  }

  try {
    log('[VOICEVOX] Launching from:', validatedPath);

    // 既存のプロセスをクリーンアップ
    if (voicevoxProcess && !voicevoxProcess.killed) {
      log('[VOICEVOX] Cleaning up old process');
      voicevoxProcess.kill();
      voicevoxProcess = null;
    }

    // VOICEVOXを起動（バックグラウンド）
    voicevoxProcess = spawn(validatedPath, [], {
      detached: true,
      stdio: 'ignore'
    });

    // プロセス終了時のハンドリング
    voicevoxProcess.on('exit', (code) => {
      log(`[VOICEVOX] Process exited with code: ${code}`);
      voicevoxProcess = null;
    });

    voicevoxProcess.on('error', (err) => {
      logError('[VOICEVOX] Process error:', err);
      voicevoxProcess = null;
    });

    voicevoxProcess.unref();

    // 起動待機（最大10秒）
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const isRunning = await checkVoicevoxConnection();
      if (isRunning) {
        log('[VOICEVOX] Started successfully');
        return { success: true, alreadyRunning: false };
      }
    }

    logError('[VOICEVOX] Startup timeout');
    return { success: false, error: '起動タイムアウト' };
  } catch (e) {
    logError('[VOICEVOX] Launch error:', e);
    return { success: false, error: e.message };
  }
}/**
 * VOICEVOX接続確認
 */
async function checkVoicevoxConnection() {
  try {
    await axios.get(`${VOICEVOX_BASE}/version`, { timeout: 2000 });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * VOICEVOXスピーカー一覧取得
 */
async function getVoicevoxSpeakers() {
  try {
    const response = await axios.get(`${VOICEVOX_BASE}/speakers`, { timeout: 3000 });

    // レスポンスサイズの検証（最大10MB）
    if (!validator.validateResponseSize(response.data)) {
      logError('[VOICEVOX] Response size too large');
      return null;
    }

    return response.data;
  } catch (e) {
    logError('[VOICEVOX] Failed to get speakers:', e.message);
    return null;
  }
}

// IPCハンドラー: VOICEVOX接続確認
ipcMain.handle('voicevox-check-connection', async () => {
  return await checkVoicevoxConnection();
});

// IPCハンドラー: VOICEVOXスピーカー一覧取得
ipcMain.handle('voicevox-get-speakers', async () => {
  return await getVoicevoxSpeakers();
});

// IPCハンドラー: VOICEVOX実行ファイル選択
ipcMain.handle('select-voicevox-path', async () => {
  const result = await dialog.showOpenDialog({
    title: 'VOICEVOX実行ファイルを選択',
    filters: [
      { name: '実行ファイル', extensions: ['exe'] }
    ],
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// IPCハンドラー: VOICEVOX起動
ipcMain.handle('launch-voicevox', async (_event, execPath) => {
  return await launchVoicevox(execPath);
});

/**
 * VOICEVOX へ問い合わせて WAV(ArrayBuffer) を取得
 * @param {string} text
 * @param {number} speakerId
 * @returns {Promise<ArrayBuffer>}
 */
async function voicevoxSynthesize(text, speakerId = DEFAULT_SPEAKER_ID) {
  // 1) audio_query
  const q = await axios.post(
    `${VOICEVOX_BASE}/audio_query`,
    null,
    { params: { text, speaker: speakerId } }
  );

  // 2) synthesis
  const wav = await axios.post(
    `${VOICEVOX_BASE}/synthesis`,
    q.data,
    {
      params: { speaker: speakerId },
      responseType: 'arraybuffer',
      headers: { 'Content-Type': 'application/json' }
    }
  );

  return wav.data; // ArrayBuffer
}

// IPC: レンダラーからの "tts-say" 要求を受け取り、WAV を返す
ipcMain.handle('tts-say', async (_event, { text, speakerId }) => {
  try {
    const data = await voicevoxSynthesize(text, speakerId ?? DEFAULT_SPEAKER_ID);
    // ArrayBufferを返す（Electronは自動でArrayBufferをシリアライズ）
    return { ok: true, wav: Buffer.from(data) };
  } catch (e) {
    logError('[voicevox] synthesis error:', e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
});
