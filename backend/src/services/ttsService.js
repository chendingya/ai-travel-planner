const path = require('path');
const fs = require('fs/promises');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const { getEnabledTextProviders } = require('../config');

class TTSService {
  constructor(options = {}) {
    this.audioDir = options.audioDir || path.join(process.cwd(), 'runtime', 'audio');
    this.publicBasePath = options.publicBasePath || '/audio';
    this.tasks = new Map();
    const cleanupRaw = options.cleanupAfterMs ?? process.env.TTS_CLEANUP_MS;
    const cleanupMs = Number(cleanupRaw);
    this.cleanupAfterMs = Number.isFinite(cleanupMs) && cleanupMs > 0 ? cleanupMs : 30 * 60 * 1000;
    this.cleanupTimers = new Map();
    this.hasSwept = false;
  }

  async _ensureDir() {
    await fs.mkdir(this.audioDir, { recursive: true });
    if (!this.hasSwept) {
      this.hasSwept = true;
      await this._sweepOldFiles();
    }
  }

  _taskPublic(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    return {
      status: task.status,
      task_id: taskId,
      audio_url: task.audio_url || null,
      error: task.error || null,
    };
  }

  async createTask({ text, voice } = {}) {
    const taskId = randomUUID();
    const safeText = typeof text === 'string' ? text : '';
    const voiceHint = typeof voice === 'string' ? voice : '';

    await this._ensureDir();
    const provider = this._resolveProvider();
    const ext = this._isOpenAICompatibleProvider(provider) ? this._getOpenAICompatFormat() : 'wav';
    const filename = `${taskId}.${ext}`;
    const outPath = path.join(this.audioDir, filename);
    const audioUrl = `${this.publicBasePath}/${filename}`;

    this.tasks.set(taskId, { status: 'processing', audio_url: null, error: null, created_at: Date.now(), file_path: outPath });

    this._synthesizeToWavFile({ text: safeText, voiceHint, outPath })
      .then(() => {
        const existing = this.tasks.get(taskId);
        if (!existing) return;
        this.tasks.set(taskId, { ...existing, status: 'completed', audio_url: audioUrl, error: null });
        this._scheduleCleanup(taskId, outPath);
      })
      .catch((e) => {
        const existing = this.tasks.get(taskId);
        if (!existing) return;
        this.tasks.set(taskId, { ...existing, status: 'failed', audio_url: null, error: String(e?.message || e) });
        this._scheduleCleanup(taskId, outPath);
      });

    return { taskId, audioUrlHint: audioUrl };
  }

  getTask(taskId) {
    return this._taskPublic(taskId);
  }

  async _synthesizeToWavFile({ text, voiceHint, outPath }) {
    const platform = process.platform;

    const provider = this._resolveProvider();
    if (this._isOpenAICompatibleProvider(provider)) {
      await this._synthesizeWithOpenAICompatible({ text, voiceHint, outPath });
      return;
    }

    if (platform === 'win32') {
      const textB64 = Buffer.from(text || '', 'utf8').toString('base64');
      const psScript = [
        '$ErrorActionPreference="Stop"',
        'Add-Type -AssemblyName System.Speech',
        '$text=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($env:TTS_TEXT_B64))',
        '$outPath=$env:TTS_OUT_PATH',
        '$voiceHint=$env:TTS_VOICE_HINT',
        '$synth=New-Object System.Speech.Synthesis.SpeechSynthesizer',
        'if ($voiceHint -and $voiceHint.Trim().Length -gt 0) {',
        '  $voices=$synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }',
        '  $match=$voices | Where-Object { $_ -like ("*"+$voiceHint+"*") } | Select-Object -First 1',
        '  if ($match) { $synth.SelectVoice($match) }',
        '}',
        '$synth.SetOutputToWaveFile($outPath)',
        '$synth.Speak($text)',
        '$synth.Dispose()',
      ].join(';');

      await this._runProcess('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
        TTS_TEXT_B64: textB64,
        TTS_OUT_PATH: outPath,
        TTS_VOICE_HINT: voiceHint || '',
      });
      return;
    }

    throw new Error(`Unsupported TTS platform: ${platform}`);
  }

  _resolveProvider() {
    const raw = process.env.TTS_PROVIDER;
    if (typeof raw === 'string' && raw.trim()) return raw.trim().toLowerCase();
    return process.platform === 'win32' ? 'local' : 'openai-compatible';
  }

  _isOpenAICompatibleProvider(provider) {
    const value = String(provider || '').toLowerCase();
    return value === 'openai' || value === 'openai-compatible' || value === 'openai_compatible' || value === 'openai-compat';
  }

  _getOpenAICompatFormat() {
    const raw = process.env.TTS_OPENAI_FORMAT || process.env.TTS_OUTPUT_FORMAT;
    const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return value || 'mp3';
  }

  _pickOpenAiVoice(voiceHint) {
    const raw = String(voiceHint || '').trim();
    const hint = raw.toLowerCase();
    const defaultVoice = process.env.TTS_OPENAI_VOICE || 'marin';
    const femaleVoice = process.env.TTS_OPENAI_VOICE_FEMALE || defaultVoice;
    const maleVoice = process.env.TTS_OPENAI_VOICE_MALE || 'cedar';
    if (hint.includes('female') || hint.includes('woman') || hint.includes('女')) return femaleVoice;
    if (hint.includes('male') || hint.includes('man') || hint.includes('男')) return maleVoice;
    if (raw) return raw;
    return defaultVoice;
  }

  _resolveOpenAICompatConfig(voiceHint) {
    const providers = getEnabledTextProviders();
    const primary = providers.length ? providers[0] : null;
    const baseURL = process.env.TTS_OPENAI_BASE_URL || primary?.baseURL || process.env.DASHSCOPE_BASE_URL || '';
    const apiKey = process.env.TTS_OPENAI_API_KEY || primary?.apiKey || process.env.DASHSCOPE_API_KEY || '';
    const model = process.env.TTS_OPENAI_MODEL || process.env.TTS_MODEL || 'gpt-4o-mini-tts';
    const responseFormat = this._getOpenAICompatFormat();
    const voice = this._pickOpenAiVoice(voiceHint);
    return { baseURL, apiKey, model, responseFormat, voice };
  }

  async _synthesizeWithOpenAICompatible({ text, voiceHint, outPath }) {
    const config = this._resolveOpenAICompatConfig(voiceHint);
    if (!config.baseURL || !config.apiKey) {
      throw new Error('TTS provider not configured');
    }
    const base = config.baseURL.endsWith('/') ? config.baseURL : `${config.baseURL}/`;
    const url = new URL('audio/speech', base).toString();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        input: text || '',
        voice: config.voice,
        response_format: config.responseFormat,
      }),
    });
    if (!response.ok) {
      let errorMessage = `TTS request failed (${response.status})`;
      try {
        const payload = await response.json();
        if (payload?.error?.message) {
          errorMessage = payload.error.message;
        } else if (typeof payload?.message === 'string') {
          errorMessage = payload.message;
        }
      } catch (error) {
        errorMessage = errorMessage;
      }
      throw new Error(errorMessage);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outPath, buffer);
  }

  _scheduleCleanup(taskId, filePath) {
    if (!this.cleanupAfterMs || this.cleanupTimers.has(taskId)) return;
    const timer = setTimeout(async () => {
      try {
        await fs.unlink(filePath);
      } catch {
      }
      this.tasks.delete(taskId);
      this.cleanupTimers.delete(taskId);
    }, this.cleanupAfterMs);
    if (typeof timer.unref === 'function') timer.unref();
    this.cleanupTimers.set(taskId, timer);
  }

  async _sweepOldFiles() {
    if (!this.cleanupAfterMs) return;
    const now = Date.now();
    let entries = [];
    try {
      entries = await fs.readdir(this.audioDir, { withFileTypes: true });
    } catch (error) {
      return;
    }
    await Promise.all(entries.map(async (entry) => {
      if (!entry.isFile()) return;
      const filePath = path.join(this.audioDir, entry.name);
      try {
        const stat = await fs.stat(filePath);
        if (now - stat.mtimeMs > this.cleanupAfterMs) {
          await fs.unlink(filePath);
        }
      } catch {
      }
    }));
  }

  _runProcess(command, args, extraEnv, inputText) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...(extraEnv || {}) },
      });

      let stderr = '';
      let stdout = '';
      if (typeof inputText === 'string' && inputText.length) {
        child.stdin.write(inputText);
      }
      child.stdin.end();
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) return resolve({ stdout, stderr });
        reject(new Error(stderr || stdout || `process exited with code ${code}`));
      });
    });
  }
}

module.exports = TTSService;

