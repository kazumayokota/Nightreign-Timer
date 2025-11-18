// renderer.js
(function () {
  console.log('[Renderer] Script loaded');
  console.log('[Renderer] electronAPI available:', !!window.electronAPI);

  // ======== DOM 参照 ========
  const timeEl = document.getElementById('time');
  const statusEl = document.getElementById('status');
  const badgeEl = document.getElementById('contraction');
  const overlayEl = document.getElementById('overlay');
  const overlayBgEl = document.getElementById('overlayBg');
  const messageEl = document.getElementById('message');
  const contextMenuEl = document.getElementById('contextMenu');
  const settingsIconEl = document.getElementById('settingsIcon');

  console.log('[Renderer] DOM elements:', {
    timeEl: !!timeEl,
    overlayBgEl: !!overlayBgEl
  });

  // デバッグ: ウィンドウサイズ確認
  console.log('[Renderer] Window size:', {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    overlayWidth: overlayEl?.offsetWidth,
    overlayHeight: overlayEl?.offsetHeight
  });

  // ======== 定数 ========
  // 計測の終了時刻（14:00 = 14 * 60 秒）
  const END_TIME_SEC = 14 * 60;

  // 収縮ウィンドウ（表示の点滅制御用）
  // 1回目: 4:30〜7:30（= 開始 270 秒、継続 180 秒）
  // 2回目: 11:00〜14:00（= 開始 660 秒、継続 180 秒）
  const contractionWindows = [
    { startSec: 4 * 60 + 30, durationSec: 3 * 60 }, // 4:30〜7:30
    { startSec: 11 * 60,     durationSec: 3 * 60 }  // 11:00〜14:00
  ];

  // 1回だけ出すメッセージの里程標
  // 4:20  「収縮10秒前です。」
  // 4:25  「収縮5秒前です。」
  // 4:30  「午前の収縮が開始されます。安全エリア内に退避してください。」
  // 7:30  「午後が始まります。」
  // 10:50 「収縮10秒前です。」
  // 10:55 「収縮5秒前です。」
  // 11:00 「間も無く最後の収縮が始まります。」
  const oneShotMilestones = [
    { sec: 4 * 60 + 20, text: '収縮10秒前です。' },
    { sec: 4 * 60 + 25, text: '収縮5秒前です。' },
    { sec: 4 * 60 + 30, text: '午前の収縮が開始されます。安全エリア内に退避してください。' },
    { sec: 7 * 60 + 30, text: '午後が始まります。' },
    { sec: 10 * 60 + 50, text: '収縮10秒前です。' },
    { sec: 10 * 60 + 55, text: '収縮5秒前です。' },
    { sec: 11 * 60,     text: '間も無く最後の収縮が始まります。' }
  ];

  // 2回目の収縮中に 1分ごとに出すメッセージ（11:05, 12:00, 13:00）
  // 11:00 は oneShotMilestones と被るため 11:05 から開始（時間差で情報提供）
  const periodicDuringSecond = [11 * 60 + 5, 12 * 60, 13 * 60];

  // ======== 設定（TTS） ========
  // 例: ずんだもん(ノーマル)=3, 四国めたん(ノーマル)=2
  const TTS_ENABLED = true;
  let TTS_SPEAKER_ID = 8; // デフォルト値、設定から読み込む
  let TTS_VOLUME = 1.0; // デフォルト音量100%

  // ======== 状態 ========
  let startEpoch = null;              // 計測開始（または再開）時の performance.now()
  let elapsedWhenPausedMs = 0;        // 停止中までに経過していた時間（ms）
  let ticking = false;                // 計測中フラグ
  let finished = false;               // 14:00 終了処理済みフラグ
  let rAF = 0;                        // requestAnimationFrame のハンドル
  let lastShownMessageTimer = null;   // メッセージ自動非表示のタイマーID
  const firedMilestones = new Set();  // 一度だけのメッセージ発火済み時刻の集合（秒）
  const firedPeriodic = new Set();    // 周期メッセージ発火済み時刻の集合（秒）

  // ======== オーディオ再生（簡易プレイヤ） ========
  async function speak(text) {
    if (!TTS_ENABLED || !window.electronAPI?.say) return;
    try {
      const { ok, url, error } = await window.electronAPI.say(text, TTS_SPEAKER_ID);
      if (!ok || !url) {
        console.error('[TTS] failed:', error);
        return;
      }
      const audio = new Audio(url);
      audio.volume = TTS_VOLUME; // 音量を設定
      // 再生後にURL破棄（GC）
      audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
      audio.addEventListener('error', () => URL.revokeObjectURL(url), { once: true });
      await audio.play();
    } catch (e) {
      console.error('[TTS] play error:', e);
    }
  }

  // ======== グローバルショートカット（メイン→レンダラ IPC） ========
  if (window.electronAPI && typeof window.electronAPI.onToggleStartStop === 'function') {
    window.electronAPI.onToggleStartStop(() => toggle());
  } else {
    console.error('electronAPI が見つかりません。preload.js と contextIsolation の設定を確認してください。');
  }

  // フェーズ指定スタート
  if (window.electronAPI && typeof window.electronAPI.onStartFromPhase === 'function') {
    window.electronAPI.onStartFromPhase((_event, startSec) => {
      startFromPhase(startSec);
    });
  }

  // 背景適用
  if (window.electronAPI && typeof window.electronAPI.onApplyBackground === 'function') {
    console.log('[Renderer] Registering onApplyBackground listener');
    window.electronAPI.onApplyBackground((_event, settings) => {
      console.log('[Renderer] onApplyBackground triggered with settings:', settings);
      applyBackground(settings);

      // スピーカーIDも更新
      if (settings.speakerId !== undefined) {
        TTS_SPEAKER_ID = settings.speakerId;
        console.log('[Renderer] Speaker ID updated to:', TTS_SPEAKER_ID);
      }

      // 音量も更新
      if (settings.volume !== undefined) {
        TTS_VOLUME = settings.volume / 100;
        console.log('[Renderer] Volume updated to:', TTS_VOLUME);
      }

      // 外観設定も更新
      if (settings.appearance) {
        applyAppearance(settings.appearance);
      }
    });
  } else {
    console.error('[Renderer] onApplyBackground not found in electronAPI');
  }

  // ======== 操作関数 ========
  function toggle() {
    if (ticking) {
      pause();
    } else {
      start();
    }
  }

  function start() {
    if (ticking) return;
    const now = performance.now();
    // 初回開始 or 再開
    startEpoch = (startEpoch === null) ? now : now - elapsedWhenPausedMs;
    ticking = true;
    statusEl.textContent = '計測中（再度 Command Or Control+S で一時停止）';
    loop();
  }

  // フェーズ指定開始（指定秒数から開始）
  function startFromPhase(startSec) {
    // 一旦リセット
    reset();

    // 経過時間を指定秒数に設定
    const startMs = startSec * 1000;
    const now = performance.now();
    startEpoch = now - startMs;
    elapsedWhenPausedMs = startMs;
    ticking = true;

    // 過去のマイルストーンをすべて発火済みにする（重複通知を防ぐ）
    for (const m of oneShotMilestones) {
      if (m.sec <= startSec) {
        firedMilestones.add(m.sec);
      }
    }
    for (const t of periodicDuringSecond) {
      if (t <= startSec) {
        firedPeriodic.add(t);
      }
    }

    // フェーズ名を取得
    const phaseName = getPhaseName(startSec);
    const mm = String(Math.floor(startSec / 60)).padStart(2, '0');
    const ss = String(startSec % 60).padStart(2, '0');

    statusEl.textContent = '計測中';
    showMessage(`${phaseName} (${mm}:${ss}) から開始しました`, 3000);
    speak(`${phaseName}から開始します`);

    loop();
  }

  // フェーズ名を取得
  function getPhaseName(sec) {
    if (sec === 0) return '午前フェーズ';
    if (sec === 4 * 60 + 30) return '午前収縮';
    if (sec === 7 * 60 + 30) return '午後フェーズ';
    if (sec === 11 * 60) return '午後収縮';
    return 'カスタム位置';
  }

  function pause() {
    if (!ticking) return;
    ticking = false;
    cancelAnimationFrame(rAF);
    statusEl.textContent = '一時停止中（Command Or Control+S で再開）';
  }

  function reset() {
    ticking = false;
    finished = false;
    startEpoch = null;
    elapsedWhenPausedMs = 0;
    cancelAnimationFrame(rAF);
    setTime(0);
    statusEl.textContent = '待機中（Command Or Control+Sで開始）';
    setContraction(false);
    hideMessage();
    firedMilestones.clear();
    firedPeriodic.clear();
  }

  // 14:00 到達時の終了処理（停止→即リセット）
  function finish() {
    if (finished) return;
    finished = true;
    ticking = false;
    cancelAnimationFrame(rAF);

    // 14:00 で表示を確定させたい場合はここで明示的に反映
    setTime(END_TIME_SEC * 1000);

    // 即リセット（終了メッセージを見せたい場合は setTimeout に切り替える）
    reset();
  }

  // ======== メインループ ========
  function loop() {
    if (!ticking) return;

    const now = performance.now();
    const elapsedMs = now - startEpoch;
    elapsedWhenPausedMs = elapsedMs;

    // 経過秒（整数）
    const elapsedSec = Math.floor(elapsedMs / 1000);

    // 先に終了判定：14:00 以上で停止→即リセット
    if (elapsedSec >= END_TIME_SEC) {
      // 表示は 14:00 に丸めてから終了
      setTime(END_TIME_SEC * 1000);
      finish();
      return;
    }

    // 時刻表示を更新
    setTime(elapsedMs);

    // 収縮の点滅（バッジ）制御
    setContraction(isInContraction(elapsedSec));

    // 一度だけのメッセージを発火
    for (const m of oneShotMilestones) {
      if (elapsedSec >= m.sec && !firedMilestones.has(m.sec)) {
        firedMilestones.add(m.sec);
        showMessage(m.text);
        speak(m.text); // ★ 読み上げ
      }
    }

    // 2回目の収縮中の定期メッセージ
    // 11:05（665s）, 12:00（720s）, 13:00（780s）で発火
    // 11:00 は「間も無く最後の収縮が始まります」と被るため 11:05 にずらして段階的に情報提供
    for (const t of periodicDuringSecond) {
      if (elapsedSec >= t && !firedPeriodic.has(t)) {
        firedPeriodic.add(t);
        if (elapsedSec >= (11 * 60) && elapsedSec <= (11 * 60 + 3 * 60)) {
          const text = '退避してください。';
          showMessage(text);
          speak(text); // ★ 読み上げ
        }
      }
    }

    rAF = requestAnimationFrame(loop);
  }

  // ======== 補助関数 ========
  // 表示用に mm:ss を更新
  function setTime(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    timeEl.textContent = `${mm}:${ss}`;
  }

  // 現在が収縮ウィンドウ内か判定
  function isInContraction(elapsedSec) {
    return contractionWindows.some(win => {
      const start = win.startSec;
      const end = win.startSec + win.durationSec;
      return elapsedSec >= start && elapsedSec < end;
    });
  }

  // 収縮中の見た目（バッジ表示・背景点滅）を切替
  function setContraction(active) {
    if (active) {
      badgeEl.classList.add('show');
      overlayEl.classList.add('blink');
      statusEl.textContent = '計測中：収縮中';
    } else {
      badgeEl.classList.remove('show');
      overlayEl.classList.remove('blink');
      if (ticking) {
        statusEl.textContent = '計測中';
      }
    }
  }

  // メッセージ表示（一定時間後に自動で隠す）
  function showMessage(text, ms = 5000) {
    if (lastShownMessageTimer !== null) {
      clearTimeout(lastShownMessageTimer);
      lastShownMessageTimer = null;
    }
    messageEl.textContent = text;
    messageEl.classList.add('show');
    lastShownMessageTimer = setTimeout(hideMessage, ms);
  }

  function hideMessage() {
    messageEl.classList.remove('show');
    if (lastShownMessageTimer !== null) {
      clearTimeout(lastShownMessageTimer);
      lastShownMessageTimer = null;
    }
  }

  // 背景画像を適用
  function applyBackground(settings) {
    console.log('[Background] Applying settings:', settings);

    if (!settings || !overlayBgEl) {
      console.error('[Background] Missing settings or element:', { settings, overlayBgEl });
      return;
    }

    if (settings.imagePath) {
      // パスをURLエンコード(日本語対応)
      const normalizedPath = settings.imagePath.replace(/\\/g, '/');
      const encodedPath = encodeURI(normalizedPath);
      const imageUrl = `file:///${encodedPath}`;
      console.log('[Background] Original path:', settings.imagePath);
      console.log('[Background] Normalized path:', normalizedPath);
      console.log('[Background] Setting image URL:', imageUrl);

      overlayBgEl.style.position = 'absolute'; // ★ 高さを確保するため必須
      overlayBgEl.style.backgroundImage = `url("${imageUrl}")`;
      overlayBgEl.style.transform = `scale(${settings.scale / 100})`;
      overlayBgEl.style.backgroundPosition = `calc(50% + ${settings.offsetX}px) calc(50% + ${settings.offsetY}px)`;
      overlayBgEl.style.opacity = settings.opacity / 100;

      console.log('[Background] Applied styles:', {
        backgroundImage: overlayBgEl.style.backgroundImage,
        transform: overlayBgEl.style.transform,
        opacity: overlayBgEl.style.opacity
      });

      // 適用後の実際の値を確認
      setTimeout(() => {
        const computed = window.getComputedStyle(overlayBgEl);
        console.log('[Background] Computed styles:', {
          backgroundImage: computed.backgroundImage,
          display: computed.display,
          width: computed.width,
          height: computed.height
        });
      }, 100);
    } else {
      console.log('[Background] Clearing background image');
      overlayBgEl.style.backgroundImage = 'none';
    }
  }

  // 外観設定を適用
  function applyAppearance(appearance) {
    console.log('[Appearance] Applying appearance:', appearance);

    const root = document.documentElement;

    // カスタムフォント
    if (appearance.fontPath) {
      const normalizedPath = appearance.fontPath.replace(/\\/g, '/');
      const encodedPath = encodeURI(normalizedPath);
      const fontUrl = `file:///${encodedPath}`;

      // @font-face を動的に更新
      const styleSheet = document.styleSheets[0];
      const fontFaceRule = `@font-face {
        font-family: 'CustomFont';
        src: url('${fontUrl}') format('truetype');
      }`;

      // 既存のフォント定義を削除
      for (let i = styleSheet.cssRules.length - 1; i >= 0; i--) {
        const rule = styleSheet.cssRules[i];
        if (rule.type === CSSRule.FONT_FACE_RULE && rule.style.fontFamily === '"CustomFont"') {
          styleSheet.deleteRule(i);
        }
      }

      // 新しいフォント定義を追加
      styleSheet.insertRule(fontFaceRule, 0);
      root.style.setProperty('--custom-font-family', '"CustomFont", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", "Noto Sans JP", sans-serif');
    } else {
      root.style.setProperty('--custom-font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", "Noto Sans JP", sans-serif');
    }

    // 色設定
    root.style.setProperty('--time-color', appearance.timeColor);
    root.style.setProperty('--status-color', appearance.statusColor);
    root.style.setProperty('--badge-bg-color', appearance.badgeColor);
    root.style.setProperty('--badge-text-color', appearance.badgeTextColor);

    // オーバーレイ背景色（不透明度を適用）
    const r = parseInt(appearance.overlayBgColor.slice(1, 3), 16);
    const g = parseInt(appearance.overlayBgColor.slice(3, 5), 16);
    const b = parseInt(appearance.overlayBgColor.slice(5, 7), 16);
    const a = appearance.overlayBgOpacity / 100;
    root.style.setProperty('--overlay-bg-color', `rgba(${r}, ${g}, ${b}, ${a})`);

    console.log('[Appearance] Applied successfully');
  }

  // 設定アイコンのクリック処理
  if (settingsIconEl) {
    settingsIconEl.addEventListener('click', (e) => {
      e.stopPropagation(); // バブリング停止
      if (window.electronAPI && window.electronAPI.openSettings) {
        window.electronAPI.openSettings();
      }
    });
  }

  // 右クリックでコンテキストメニュー表示
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
  });

  // 左クリックでメニューを閉じる
  window.addEventListener('click', () => {
    hideContextMenu();
  });

  // コンテキストメニュー表示
  function showContextMenu(x, y) {
    if (!contextMenuEl) return;

    // 画面外に出ないように調整
    const menuWidth = 180;
    const menuHeight = 100;
    const adjustedX = Math.min(x, window.innerWidth - menuWidth);
    const adjustedY = Math.min(y, window.innerHeight - menuHeight);

    contextMenuEl.style.left = `${adjustedX}px`;
    contextMenuEl.style.top = `${adjustedY}px`;
    contextMenuEl.classList.add('show');
  }

  // コンテキストメニュー非表示
  function hideContextMenu() {
    if (contextMenuEl) {
      contextMenuEl.classList.remove('show');
    }
  }

  // メニュー項目のクリック処理
  if (contextMenuEl) {
    contextMenuEl.addEventListener('click', (e) => {
      const item = e.target.closest('.context-menu-item');
      if (!item) return;

      const action = item.dataset.action;
      hideContextMenu();

      if (action === 'reset') {
        reset();
      } else if (action === 'settings') {
        // メインプロセスに設定ウィンドウを開くよう通知
        if (window.electronAPI && window.electronAPI.openSettings) {
          window.electronAPI.openSettings();
        }
      }
    });
  }

  // 初期化
  reset();
})();
