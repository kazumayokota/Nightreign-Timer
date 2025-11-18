// validator.js - 設定値の検証とサニタイゼーション

/**
 * 16進数カラーコードの検証
 */
function validateColor(value) {
  if (typeof value !== 'string') return '#ffffff';
  const match = value.match(/^#[0-9A-Fa-f]{6}$/);
  return match ? value : '#ffffff';
}

/**
 * 数値の範囲検証
 */
function validateNumber(value, min, max, defaultValue) {
  const num = Number(value);
  if (isNaN(num)) return defaultValue;
  return Math.max(min, Math.min(max, num));
}

/**
 * ファイルパスの検証
 */
function validateFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;

  // パストラバーサル対策
  if (filePath.includes('..') || filePath.includes('%')) {
    console.warn('[Validator] Suspicious path detected:', filePath);
    return null;
  }

  return filePath;
}

/**
 * ファイル拡張子の検証
 */
function validateFileExtension(filePath, allowedExtensions) {
  if (!filePath) return false;
  const ext = filePath.split('.').pop().toLowerCase();
  return allowedExtensions.includes(ext);
}

/**
 * VOICEVOXパスの検証
 */
function validateVoicevoxPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;

  // パストラバーサル対策
  if (filePath.includes('..')) {
    console.warn('[Validator] Path traversal detected:', filePath);
    return null;
  }

  // VOICEVOX.exe であることを確認
  const fileName = filePath.split('\\').pop().split('/').pop();
  if (!fileName.toLowerCase().includes('voicevox')) {
    console.warn('[Validator] Not a VOICEVOX executable:', fileName);
    return null;
  }

  return filePath;
}

/**
 * 設定オブジェクト全体の検証
 */
function validateSettings(settings) {
  const validated = {
    imagePath: validateFilePath(settings.imagePath),
    scale: validateNumber(settings.scale, 10, 500, 100),
    offsetX: validateNumber(settings.offsetX, -2000, 2000, 0),
    offsetY: validateNumber(settings.offsetY, -2000, 2000, 0),
    opacity: validateNumber(settings.opacity, 0, 100, 80),
    speakerId: validateNumber(settings.speakerId, 0, 999, 8),
    volume: validateNumber(settings.volume, 0, 100, 100),
    voicevoxPath: validateVoicevoxPath(settings.voicevoxPath)
  };

  // ショートカットキーの検証
  if (settings.shortcuts && typeof settings.shortcuts === 'object') {
    validated.shortcuts = {
      toggleStartStop: validateShortcut(settings.shortcuts.toggleStartStop, 'CommandOrControl+S'),
      phase1: validateShortcut(settings.shortcuts.phase1, 'CommandOrControl+1'),
      phase2: validateShortcut(settings.shortcuts.phase2, 'CommandOrControl+2'),
      phase3: validateShortcut(settings.shortcuts.phase3, 'CommandOrControl+3'),
      phase4: validateShortcut(settings.shortcuts.phase4, 'CommandOrControl+4')
    };
  }

  // 外観設定の検証
  if (settings.appearance && typeof settings.appearance === 'object') {
    validated.appearance = {
      fontPath: validateFilePath(settings.appearance.fontPath),
      timeColor: validateColor(settings.appearance.timeColor),
      statusColor: validateColor(settings.appearance.statusColor),
      badgeColor: validateColor(settings.appearance.badgeColor),
      badgeTextColor: validateColor(settings.appearance.badgeTextColor),
      overlayBgColor: validateColor(settings.appearance.overlayBgColor),
      overlayBgOpacity: validateNumber(settings.appearance.overlayBgOpacity, 0, 100, 60)
    };
  }

  return validated;
}

/**
 * ショートカットキーの検証
 */
function validateShortcut(value, defaultValue) {
  if (typeof value !== 'string') return defaultValue;

  // Electronのアクセラレータ形式を検証
  const validPattern = /^(CommandOrControl|Command|Control|Alt|Option|AltGr|Shift|Super|Meta)\+[A-Z0-9]$/i;
  if (!validPattern.test(value)) {
    console.warn('[Validator] Invalid shortcut format:', value);
    return defaultValue;
  }

  return value;
}

/**
 * HTTP レスポンスサイズの検証
 */
function validateResponseSize(data, maxSizeBytes = 10 * 1024 * 1024) {
  const size = Buffer.byteLength(JSON.stringify(data));
  if (size > maxSizeBytes) {
    console.warn('[Validator] Response too large:', size, 'bytes');
    return false;
  }
  return true;
}

module.exports = {
  validateColor,
  validateNumber,
  validateFilePath,
  validateFileExtension,
  validateVoicevoxPath,
  validateSettings,
  validateShortcut,
  validateResponseSize
};
