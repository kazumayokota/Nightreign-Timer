// settings.js
(function () {
  // DOM要素
  const selectImageBtn = document.getElementById('selectImageBtn');
  const clearImageBtn = document.getElementById('clearImageBtn');
  const imageInfo = document.getElementById('imageInfo');
  const previewBg = document.getElementById('previewBg');

  const scaleSlider = document.getElementById('scaleSlider');
  const offsetXSlider = document.getElementById('offsetXSlider');
  const offsetYSlider = document.getElementById('offsetYSlider');
  const opacitySlider = document.getElementById('opacitySlider');

  const scaleValue = document.getElementById('scaleValue');
  const offsetXValue = document.getElementById('offsetXValue');
  const offsetYValue = document.getElementById('offsetYValue');
  const opacityValue = document.getElementById('opacityValue');

  const applyBtn = document.getElementById('applyBtn');
  const saveBtn = document.getElementById('saveBtn');
  const closeBtn = document.getElementById('closeBtn');

  // VOICEVOX関連のDOM要素
  const voicevoxStatus = document.getElementById('voicevoxStatus');
  const voicevoxControls = document.getElementById('voicevoxControls');
  const voicevoxError = document.getElementById('voicevoxError');
  const speakerSelect = document.getElementById('speakerSelect');
  const testVoiceBtn = document.getElementById('testVoiceBtn');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeValue = document.getElementById('volumeValue');
  const selectVoicevoxPathBtn = document.getElementById('selectVoicevoxPathBtn');
  const launchVoicevoxBtn = document.getElementById('launchVoicevoxBtn');
  const voicevoxPathInfo = document.getElementById('voicevoxPathInfo');

  // 外観設定のDOM要素
  const selectFontBtn = document.getElementById('selectFontBtn');
  const clearFontBtn = document.getElementById('clearFontBtn');
  const fontInfo = document.getElementById('fontInfo');
  const timeColorPicker = document.getElementById('timeColorPicker');
  const timeColorValue = document.getElementById('timeColorValue');
  const statusColorPicker = document.getElementById('statusColorPicker');
  const statusColorValue = document.getElementById('statusColorValue');
  const badgeColorPicker = document.getElementById('badgeColorPicker');
  const badgeColorValue = document.getElementById('badgeColorValue');
  const badgeTextColorPicker = document.getElementById('badgeTextColorPicker');
  const badgeTextColorValue = document.getElementById('badgeTextColorValue');
  const overlayBgColorPicker = document.getElementById('overlayBgColorPicker');
  const overlayBgColorValue = document.getElementById('overlayBgColorValue');
  const overlayBgOpacitySlider = document.getElementById('overlayBgOpacitySlider');
  const overlayBgOpacityValue = document.getElementById('overlayBgOpacityValue');
  const resetAppearanceBtn = document.getElementById('resetAppearanceBtn');

  // デフォルトのショートカットキー
  const DEFAULT_SHORTCUTS = {
    toggleStartStop: 'CommandOrControl+S',
    phase1: 'CommandOrControl+1',
    phase2: 'CommandOrControl+2',
    phase3: 'CommandOrControl+3',
    phase4: 'CommandOrControl+4'
  };

  // デフォルトの外観設定
  const DEFAULT_APPEARANCE = {
    fontPath: null,
    timeColor: '#ffffff',
    statusColor: '#e0e0e0',
    badgeColor: '#ffd54d',
    badgeTextColor: '#111111',
    overlayBgColor: '#1e1e1e',
    overlayBgOpacity: 60
  };

  // 現在の設定
  let currentSettings = {
    imagePath: null,
    scale: 100,
    offsetX: 0,
    offsetY: 0,
    opacity: 80,
    speakerId: 1, // デフォルトスピーカーID（四国めたん ノーマル）
    volume: 100,   // デフォルト音量100%
    shortcuts: { ...DEFAULT_SHORTCUTS },
    appearance: { ...DEFAULT_APPEARANCE },
    voicevoxPath: null // VOICEVOXのパス
  };

  // 初期化
  async function init() {
    // デバッグ: プレビューサイズ確認
    const preview = document.getElementById('preview');
    console.log('[Settings] Preview size:', {
      width: preview?.offsetWidth,
      height: preview?.offsetHeight,
      computedWidth: window.getComputedStyle(preview)?.width,
      computedHeight: window.getComputedStyle(preview)?.height
    });

    // 保存された設定を読み込み
    const saved = await window.settingsAPI.loadSettings();
    if (saved) {
      currentSettings = { ...currentSettings, ...saved };
      // ショートカットキーがない場合はデフォルト値を設定
      if (!currentSettings.shortcuts) {
        currentSettings.shortcuts = { ...DEFAULT_SHORTCUTS };
      }
      // 外観設定がない場合はデフォルト値を設定
      if (!currentSettings.appearance) {
        currentSettings.appearance = { ...DEFAULT_APPEARANCE };
      }
      applySettingsToUI();
    }

    // ショートカットキーをUIに反映
    Object.entries(shortcutInputs).forEach(([key, input]) => {
      if (input) {
        input.value = currentSettings.shortcuts[key] || '';
      }
    });

    // 外観設定をUIに反映
    applyAppearanceToUI();

    // VOICEVOXパス情報をUIに反映
    if (currentSettings.voicevoxPath) {
      voicevoxPathInfo.textContent = `選択中: ${currentSettings.voicevoxPath}`;
    } else {
      voicevoxPathInfo.textContent = 'デフォルトパスを使用';
    }

    updatePreview();
    await initVoicevox(); // VOICEVOX初期化
  }

  // VOICEVOX初期化
  async function initVoicevox() {
    try {
      const isConnected = await window.settingsAPI.checkVoicevoxConnection();

      if (isConnected) {
        voicevoxStatus.textContent = '接続成功';
        voicevoxStatus.style.color = '#4a9eff';

        const speakers = await window.settingsAPI.getVoicevoxSpeakers();
        if (speakers && speakers.length > 0) {
          // スピーカー一覧を構築
          speakerSelect.innerHTML = '';
          speakers.forEach(speaker => {
            speaker.styles.forEach(style => {
              const option = document.createElement('option');
              option.value = style.id;
              option.textContent = `${speaker.name} (${style.name})`;
              speakerSelect.appendChild(option);
            });
          });

          // 保存されたスピーカーIDを選択
          if (currentSettings.speakerId) {
            speakerSelect.value = currentSettings.speakerId;
          }

          voicevoxControls.style.display = 'block';
          voicevoxError.style.display = 'none';
        }
      } else {
        voicevoxStatus.textContent = '接続失敗 - VOICEVOXを起動してください';
        voicevoxStatus.style.color = '#e74c3c';
        voicevoxControls.style.display = 'block'; // パス設定と起動ボタンを表示
        voicevoxError.style.display = 'none';

        // スピーカー選択などを無効化
        speakerSelect.disabled = true;
        testVoiceBtn.disabled = true;
      }
    } catch (e) {
      console.error('[Settings] VOICEVOX init error:', e);
      voicevoxStatus.textContent = '接続エラー';
      voicevoxStatus.style.color = '#e74c3c';
      voicevoxControls.style.display = 'none';
      voicevoxError.style.display = 'block';
    }
  }

  // UIに設定を反映
  function applySettingsToUI() {
    scaleSlider.value = currentSettings.scale;
    offsetXSlider.value = currentSettings.offsetX;
    offsetYSlider.value = currentSettings.offsetY;
    opacitySlider.value = currentSettings.opacity;
    volumeSlider.value = currentSettings.volume;

    updateValues();

    if (currentSettings.imagePath) {
      imageInfo.textContent = `選択中: ${currentSettings.imagePath.split(/[\\/]/).pop()}`;
    }
  }

  // プレビュー更新
  function updatePreview() {
    if (currentSettings.imagePath) {
      // 実際のタイマーと同じ処理
      const normalizedPath = currentSettings.imagePath.replace(/\\/g, '/');
      const encodedPath = encodeURI(normalizedPath);
      const imageUrl = `file:///${encodedPath}`;

      previewBg.style.position = 'absolute'; // ★ 高さを確保
      previewBg.style.backgroundImage = `url("${imageUrl}")`;
    } else {
      previewBg.style.backgroundImage = 'none';
    }

    previewBg.style.transform = `scale(${currentSettings.scale / 100})`;
    previewBg.style.backgroundPosition = `calc(50% + ${currentSettings.offsetX}px) calc(50% + ${currentSettings.offsetY}px)`;
    previewBg.style.opacity = currentSettings.opacity / 100;
  }

  // 値表示を更新
  function updateValues() {
    scaleValue.textContent = `${currentSettings.scale}%`;
    offsetXValue.textContent = `${currentSettings.offsetX}px`;
    offsetYValue.textContent = `${currentSettings.offsetY}px`;
    opacityValue.textContent = `${currentSettings.opacity}%`;
    volumeValue.textContent = `${currentSettings.volume}%`;
  }

  // イベントリスナー
  selectImageBtn.addEventListener('click', async () => {
    const path = await window.settingsAPI.selectImage();
    if (path) {
      currentSettings.imagePath = path;
      imageInfo.textContent = `選択中: ${path.split(/[\\/]/).pop()}`;
      updatePreview();
    }
  });

  clearImageBtn.addEventListener('click', () => {
    currentSettings.imagePath = null;
    imageInfo.textContent = '画像が選択されていません';
    updatePreview();
  });

  scaleSlider.addEventListener('input', (e) => {
    currentSettings.scale = parseInt(e.target.value);
    updateValues();
    updatePreview();
  });

  offsetXSlider.addEventListener('input', (e) => {
    currentSettings.offsetX = parseInt(e.target.value);
    updateValues();
    updatePreview();
  });

  offsetYSlider.addEventListener('input', (e) => {
    currentSettings.offsetY = parseInt(e.target.value);
    updateValues();
    updatePreview();
  });

  opacitySlider.addEventListener('input', (e) => {
    currentSettings.opacity = parseInt(e.target.value);
    updateValues();
    updatePreview();
  });

  applyBtn.addEventListener('click', async () => {
    console.log('[Settings] Apply button clicked, current settings:', currentSettings);
    const result = await window.settingsAPI.applySettings(currentSettings);
    console.log('[Settings] Apply result:', result);
    alert('背景を適用しました');
  });

  saveBtn.addEventListener('click', async () => {
    console.log('[Settings] Save button clicked, current settings:', currentSettings);
    const saveResult = await window.settingsAPI.saveSettings(currentSettings);
    console.log('[Settings] Save result:', saveResult);
    const applyResult = await window.settingsAPI.applySettings(currentSettings);
    console.log('[Settings] Apply result:', applyResult);
    alert('設定を保存しました');
  });

  closeBtn.addEventListener('click', () => {
    window.settingsAPI.closeWindow();
  });

  // VOICEVOX スピーカー変更
  speakerSelect.addEventListener('change', (e) => {
    currentSettings.speakerId = parseInt(e.target.value);
    console.log('[Settings] Speaker changed to:', currentSettings.speakerId);
  });

  // VOICEVOX 音声テスト
  testVoiceBtn.addEventListener('click', async () => {
    const testText = 'テスト音声です。';
    testVoiceBtn.disabled = true;
    testVoiceBtn.textContent = '再生中...';

    try {
      const result = await window.settingsAPI.testVoice(testText, currentSettings.speakerId);
      console.log('[Settings] Test voice result:', result);

      if (result.ok && result.url) {
        const audio = new Audio(result.url);
        audio.volume = currentSettings.volume / 100; // 音量を設定

        audio.onended = () => {
          console.log('[Settings] Audio playback ended');
          URL.revokeObjectURL(result.url);
          testVoiceBtn.disabled = false;
          testVoiceBtn.textContent = '音声テスト';
        };

        audio.onerror = (e) => {
          console.error('[Settings] Audio playback error:', e);
          URL.revokeObjectURL(result.url);
          testVoiceBtn.disabled = false;
          testVoiceBtn.textContent = '音声テスト';
          alert('音声再生エラーが発生しました');
        };

        await audio.play().catch(e => {
          console.error('[Settings] Play failed:', e);
          URL.revokeObjectURL(result.url);
          testVoiceBtn.disabled = false;
          testVoiceBtn.textContent = '音声テスト';
          alert('音声再生に失敗しました: ' + e.message);
        });
      } else {
        console.error('[Settings] Voice synthesis failed:', result.error);
        alert('音声合成に失敗しました: ' + (result.error || '不明なエラー'));
        testVoiceBtn.disabled = false;
        testVoiceBtn.textContent = '音声テスト';
      }
    } catch (e) {
      console.error('[Settings] Voice test error:', e);
      alert('音声テストに失敗しました: ' + e.message);
      testVoiceBtn.disabled = false;
      testVoiceBtn.textContent = '音声テスト';
    }
  });

  // 音量スライダー
  volumeSlider.addEventListener('input', (e) => {
    currentSettings.volume = parseInt(e.target.value);
    updateValues();
  });

  // 上下ボタンのイベントリスナー
  document.querySelectorAll('.btn-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      const step = parseInt(btn.getAttribute('data-step'));

      if (target === 'scale') {
        const newValue = Math.max(10, Math.min(500, currentSettings.scale + step));
        currentSettings.scale = newValue;
        scaleSlider.value = newValue;
      } else if (target === 'offsetX') {
        const newValue = Math.max(-500, Math.min(500, currentSettings.offsetX + step));
        currentSettings.offsetX = newValue;
        offsetXSlider.value = newValue;
      } else if (target === 'offsetY') {
        const newValue = Math.max(-500, Math.min(500, currentSettings.offsetY + step));
        currentSettings.offsetY = newValue;
        offsetYSlider.value = newValue;
      } else if (target === 'opacity') {
        const newValue = Math.max(0, Math.min(100, currentSettings.opacity + step));
        currentSettings.opacity = newValue;
        opacitySlider.value = newValue;
      } else if (target === 'volume') {
        const newValue = Math.max(0, Math.min(100, currentSettings.volume + step));
        currentSettings.volume = newValue;
        volumeSlider.value = newValue;
      } else if (target === 'overlayBgOpacity') {
        const newValue = Math.max(0, Math.min(100, currentSettings.appearance.overlayBgOpacity + step));
        currentSettings.appearance.overlayBgOpacity = newValue;
        overlayBgOpacitySlider.value = newValue;
        overlayBgOpacityValue.textContent = `${newValue}%`;
      }

      updateValues();
      updatePreview();
    });
  });

  // ショートカットキー入力の処理
  const shortcutInputs = {
    toggleStartStop: document.getElementById('shortcutToggle'),
    phase1: document.getElementById('shortcutPhase1'),
    phase2: document.getElementById('shortcutPhase2'),
    phase3: document.getElementById('shortcutPhase3'),
    phase4: document.getElementById('shortcutPhase4')
  };

  let recordingShortcut = null;

  Object.entries(shortcutInputs).forEach(([key, input]) => {
    if (!input) return;

    input.addEventListener('focus', () => {
      recordingShortcut = key;
      input.classList.add('recording');
      input.value = 'キーを押してください...';
    });

    input.addEventListener('blur', () => {
      if (recordingShortcut === key) {
        recordingShortcut = null;
        input.classList.remove('recording');
        input.value = currentSettings.shortcuts[key] || '';
      }
    });

    input.addEventListener('keydown', (e) => {
      if (recordingShortcut !== key) return;

      e.preventDefault();
      e.stopPropagation();

      // Escapeでキャンセル
      if (e.key === 'Escape') {
        input.blur();
        return;
      }

      // 修飾キーのみの場合は無視
      if (['Control', 'Shift', 'Alt', 'Meta', 'Command'].includes(e.key)) {
        return;
      }

      // ショートカットキーを構築
      const parts = [];
      if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');

      // キー名を追加
      let keyName = e.key;
      if (keyName.length === 1) {
        keyName = keyName.toUpperCase();
      } else {
        // 特殊キーの名前を調整
        keyName = keyName.charAt(0).toUpperCase() + keyName.slice(1);
      }
      parts.push(keyName);

      const shortcut = parts.join('+');
      currentSettings.shortcuts[key] = shortcut;
      input.value = shortcut;
      input.blur();
    });
  });

  // デフォルトに戻すボタン
  const resetShortcutsBtn = document.getElementById('resetShortcutsBtn');
  if (resetShortcutsBtn) {
    resetShortcutsBtn.addEventListener('click', () => {
      currentSettings.shortcuts = { ...DEFAULT_SHORTCUTS };
      Object.entries(shortcutInputs).forEach(([key, input]) => {
        if (input) {
          input.value = currentSettings.shortcuts[key];
        }
      });
    });
  }

  // 外観設定のイベントリスナー
  if (selectFontBtn) {
    selectFontBtn.addEventListener('click', async () => {
      const fontPath = await window.settingsAPI.selectFont();
      if (fontPath) {
        currentSettings.appearance.fontPath = fontPath;
        fontInfo.textContent = `選択中: ${fontPath}`;
      }
    });
  }

  if (clearFontBtn) {
    clearFontBtn.addEventListener('click', () => {
      currentSettings.appearance.fontPath = null;
      fontInfo.textContent = 'デフォルトフォントを使用中';
    });
  }

  // カラーピッカーのイベントリスナー
  const colorPickers = [
    { picker: timeColorPicker, value: timeColorValue, key: 'timeColor' },
    { picker: statusColorPicker, value: statusColorValue, key: 'statusColor' },
    { picker: badgeColorPicker, value: badgeColorValue, key: 'badgeColor' },
    { picker: badgeTextColorPicker, value: badgeTextColorValue, key: 'badgeTextColor' },
    { picker: overlayBgColorPicker, value: overlayBgColorValue, key: 'overlayBgColor' }
  ];

  colorPickers.forEach(({ picker, value, key }) => {
    if (picker) {
      picker.addEventListener('input', (e) => {
        currentSettings.appearance[key] = e.target.value;
        value.textContent = e.target.value;
      });
    }
  });

  if (overlayBgOpacitySlider) {
    overlayBgOpacitySlider.addEventListener('input', (e) => {
      currentSettings.appearance.overlayBgOpacity = parseInt(e.target.value);
      overlayBgOpacityValue.textContent = `${e.target.value}%`;
    });
  }

  if (resetAppearanceBtn) {
    resetAppearanceBtn.addEventListener('click', () => {
      currentSettings.appearance = { ...DEFAULT_APPEARANCE };
      applyAppearanceToUI();
    });
  }

  // VOICEVOXパス選択
  if (selectVoicevoxPathBtn) {
    selectVoicevoxPathBtn.addEventListener('click', async () => {
      const voicevoxPath = await window.settingsAPI.selectVoicevoxPath();
      if (voicevoxPath) {
        currentSettings.voicevoxPath = voicevoxPath;
        voicevoxPathInfo.textContent = `選択中: ${voicevoxPath}`;
      }
    });
  }

  // VOICEVOX起動
  if (launchVoicevoxBtn) {
    launchVoicevoxBtn.addEventListener('click', async () => {
      launchVoicevoxBtn.disabled = true;
      launchVoicevoxBtn.textContent = '起動中...';

      const execPath = currentSettings.voicevoxPath || 'C:\\\\Program Files\\\\VOICEVOX\\\\VOICEVOX.exe';
      const result = await window.settingsAPI.launchVoicevox(execPath);

      if (result.success) {
        if (result.alreadyRunning) {
          voicevoxStatus.textContent = 'VOICEVOX は既に起動しています';
          voicevoxStatus.style.color = '#4a9eff';
        } else {
          voicevoxStatus.textContent = 'VOICEVOX を起動しました';
          voicevoxStatus.style.color = '#4a9eff';
        }

        // 再接続を試みる
        setTimeout(async () => {
          await initVoicevox();
        }, 1000);
      } else {
        voicevoxStatus.textContent = `起動失敗: ${result.error}`;
        voicevoxStatus.style.color = '#e74c3c';
      }

      launchVoicevoxBtn.disabled = false;
      launchVoicevoxBtn.textContent = 'VOICEVOXを起動';
    });
  }

  // 外観設定をUIに反映する関数
  function applyAppearanceToUI() {
    if (currentSettings.appearance.fontPath) {
      fontInfo.textContent = `選択中: ${currentSettings.appearance.fontPath}`;
    } else {
      fontInfo.textContent = 'デフォルトフォントを使用中';
    }

    timeColorPicker.value = currentSettings.appearance.timeColor;
    timeColorValue.textContent = currentSettings.appearance.timeColor;

    statusColorPicker.value = currentSettings.appearance.statusColor;
    statusColorValue.textContent = currentSettings.appearance.statusColor;

    badgeColorPicker.value = currentSettings.appearance.badgeColor;
    badgeColorValue.textContent = currentSettings.appearance.badgeColor;

    badgeTextColorPicker.value = currentSettings.appearance.badgeTextColor;
    badgeTextColorValue.textContent = currentSettings.appearance.badgeTextColor;

    overlayBgColorPicker.value = currentSettings.appearance.overlayBgColor;
    overlayBgColorValue.textContent = currentSettings.appearance.overlayBgColor;

    overlayBgOpacitySlider.value = currentSettings.appearance.overlayBgOpacity;
    overlayBgOpacityValue.textContent = `${currentSettings.appearance.overlayBgOpacity}%`;
  }

  // VOICEVOX自動起動完了時の通知を受け取る
  if (window.settingsAPI.onVoicevoxReady) {
    window.settingsAPI.onVoicevoxReady(async () => {
      console.log('[Settings] VOICEVOX ready notification received');
      // VOICEVOX初期化を再実行してスピーカー一覧を更新
      await initVoicevox();
    });
  }

  // 初期化実行
  init();
})();
