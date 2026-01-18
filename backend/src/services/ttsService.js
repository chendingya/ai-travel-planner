const path = require('path');
const fs = require('fs/promises');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

class TTSService {
  constructor(options = {}) {
    this.audioDir = options.audioDir || path.join(process.cwd(), 'runtime', 'audio');
    this.publicBasePath = options.publicBasePath || '/audio';
    this.tasks = new Map();
  }

  async _ensureDir() {
    await fs.mkdir(this.audioDir, { recursive: true });
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
    const filename = `${taskId}.wav`;
    const outPath = path.join(this.audioDir, filename);
    const audioUrl = `${this.publicBasePath}/${filename}`;

    this.tasks.set(taskId, { status: 'processing', audio_url: null, error: null, created_at: Date.now() });

    this._synthesizeToWavFile({ text: safeText, voiceHint, outPath })
      .then(() => {
        const existing = this.tasks.get(taskId);
        if (!existing) return;
        this.tasks.set(taskId, { ...existing, status: 'completed', audio_url: audioUrl, error: null });
      })
      .catch((e) => {
        const existing = this.tasks.get(taskId);
        if (!existing) return;
        this.tasks.set(taskId, { ...existing, status: 'failed', audio_url: null, error: String(e?.message || e) });
      });

    return { taskId, audioUrlHint: audioUrl };
  }

  getTask(taskId) {
    return this._taskPublic(taskId);
  }

  async _synthesizeToWavFile({ text, voiceHint, outPath }) {
    const platform = process.platform;

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

  _runProcess(command, args, extraEnv) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...(extraEnv || {}) },
      });

      let stderr = '';
      let stdout = '';
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

