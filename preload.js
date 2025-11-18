// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onToggleStartStop: (cb) => ipcRenderer.on('toggle-start-stop', cb),
  onStartFromPhase: (cb) => ipcRenderer.on('start-from-phase', cb),
  onApplyBackground: (cb) => ipcRenderer.on('apply-background', cb),
  openSettings: () => ipcRenderer.send('open-settings'),

  /**
   * VOICEVOX で音声合成して再生用の Blob URL を返す
   * @param {string} text
   * @param {number} speakerId
   * @returns {Promise<{ok: boolean, url?: string, error?: string}>}
   */
  say: async (text, speakerId) => {
    try {
      const result = await ipcRenderer.invoke('tts-say', { text, speakerId });
      if (!result?.ok) return { ok: false, error: result?.error || 'unknown error' };

      // ArrayBuffer -> Blob -> ObjectURL をレンダラー側で生成
      const blob = new Blob([result.wav], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      return { ok: true, url };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }
});

// 設定ウィンドウ用API
contextBridge.exposeInMainWorld('settingsAPI', {
  selectImage: () => ipcRenderer.invoke('select-image'),
  selectFont: () => ipcRenderer.invoke('select-font'),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  applySettings: (settings) => ipcRenderer.invoke('apply-settings', settings),
  closeWindow: () => ipcRenderer.invoke('close-settings-window'),
  // VOICEVOX関連
  checkVoicevoxConnection: () => ipcRenderer.invoke('voicevox-check-connection'),
  getVoicevoxSpeakers: () => ipcRenderer.invoke('voicevox-get-speakers'),
  selectVoicevoxPath: () => ipcRenderer.invoke('select-voicevox-path'),
  launchVoicevox: (execPath) => ipcRenderer.invoke('launch-voicevox', execPath),
  // VOICEVOX起動完了通知を受け取る
  onVoicevoxReady: (callback) => ipcRenderer.on('voicevox-ready', callback),
  // 音声テスト用
  testVoice: async (text, speakerId) => {
    try {
      const result = await ipcRenderer.invoke('tts-say', { text, speakerId });
      if (!result?.ok) return { ok: false, error: result?.error || 'unknown error' };

      const blob = new Blob([result.wav], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      return { ok: true, url };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }
});
