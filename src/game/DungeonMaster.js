import {
  DM_EVENT_CATALOG,
  buildDirectorPrompt,
  deterministicDecision,
  getEligibleEventIds,
  validateDecision
} from './dm/DMCore.js';

const AI_DOWNLOAD_LABEL = '≈120–190 MB';
const MILESTONES = new Set([2, 5]);

class DungeonMaster {
  constructor(game) {
    this.game = game;
    this.worker = null;
    this.aiReady = false;
    this.aiLoading = false;
    this.pending = null;
    this.requestSerial = 0;
    this.seenEvents = new Set();
    this.lastKills = game.kills;
    this.lowHealthBeatUsed = false;
    this.cooldown = 0;
    this.questRestoreTimer = 0;
    this.baseQuestCopy = game.ui?.questCopy?.textContent || 'Drive the corrupted creatures from the Sunken Glade.';

    this.ui = {
      panel: document.querySelector('#dm-panel'),
      badge: document.querySelector('#dm-badge'),
      message: document.querySelector('#dm-message'),
      enable: document.querySelector('#dm-enable'),
      progress: document.querySelector('#dm-progress'),
      progressBar: document.querySelector('#dm-progress-bar')
    };

    this.ui.enable?.addEventListener('click', () => this.enableAI());
    this._setStatus('STANDARD', 'Authored director active. Local AI is optional and stays on your device.');
  }

  update(dt) {
    if (!this.game.started || this.game.victoryShown) return;
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (this.game.kills !== this.lastKills) {
      this.lastKills = this.game.kills;
      if (MILESTONES.has(this.game.kills)) this.requestBeat(`kill_milestone_${this.game.kills}`);
    }

    const hpRatio = this.game.player.hp / Math.max(1, this.game.player.maxHp);
    if (!this.lowHealthBeatUsed && hpRatio < 0.3 && this.game.gameTime > 18 && !this.game.player.dead) {
      this.lowHealthBeatUsed = true;
      this.requestBeat('player_low_health');
    }
  }

  async enableAI() {
    if (this.aiReady || this.aiLoading) return;
    this.aiLoading = true;
    this.ui.enable && (this.ui.enable.disabled = true);
    this.ui.progress?.classList.remove('hidden');
    this._setStatus('DOWNLOADING', `Preparing the on-device Dungeon Master ${AI_DOWNLOAD_LABEL}. Gameplay continues normally.`);

    try {
      this.worker = new Worker(new URL('./dm/dm.worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = event => this._onWorkerMessage(event.data || {});
      this.worker.onerror = event => this._onWorkerFailure(event?.message || 'Worker failed to start');
      this.worker.postMessage({ type: 'init', preferWebGPU: Boolean(navigator.gpu) });
    } catch (error) {
      this._onWorkerFailure(error?.message || String(error));
    }
  }

  requestBeat(reason) {
    if (this.pending || this.cooldown > 0 || this.game.boss?.dead) return;

    const snapshot = this._snapshot(reason);
    const allowed = getEligibleEventIds(snapshot, [...this.seenEvents]);

    if (!this.aiReady || !this.worker) {
      const decision = deterministicDecision(snapshot, [...this.seenEvents]);
      this._applyDecision(decision, allowed);
      return;
    }

    const requestId = ++this.requestSerial;
    this.pending = { requestId, snapshot, allowed };
    this._setStatus('THINKING', 'The local Dungeon Master is weighing the next authored story beat…');
    this.worker.postMessage({
      type: 'decide',
      requestId,
      prompt: buildDirectorPrompt(snapshot, allowed),
      preferWebGPU: Boolean(navigator.gpu)
    });
  }

  _snapshot(reason) {
    const living = this.game.enemies.filter(enemy => !enemy.dead && !enemy.isBoss).length;
    const hpRatio = this.game.player.hp / Math.max(1, this.game.player.maxHp);
    const manaRatio = this.game.player.mana / Math.max(1, this.game.player.maxMana);

    return {
      reason,
      player: {
        level: this.game.player.level,
        hpRatio: Number(hpRatio.toFixed(3)),
        manaRatio: Number(manaRatio.toFixed(3)),
        combatCombo: this.game.combatCombo
      },
      encounter: {
        kills: this.game.kills,
        objectiveKills: this.game.objectiveKills,
        living,
        bossAwake: Boolean(this.game.boss && !this.game.boss.dead),
        bossPending: Boolean(this.game.bossPending)
      },
      pacing: {
        secondsInRun: Math.round(this.game.gameTime),
        playerRecentlyDied: Boolean(this.game.respawnTimer > 0)
      }
    };
  }

  _onWorkerMessage(message) {
    if (message.type === 'progress') {
      this._updateProgress(message);
      return;
    }

    if (message.type === 'ready') {
      this.aiLoading = false;
      this.aiReady = true;
      this.ui.progress?.classList.add('hidden');
      if (this.ui.enable) {
        this.ui.enable.disabled = true;
        this.ui.enable.textContent = 'Local AI Ready';
      }
      const backend = message.backend === 'webgpu' ? 'WebGPU' : 'CPU/WASM';
      this._setStatus('LOCAL AI', `On-device DM ready · ${backend} · no gameplay state is sent to a server.`);
      this.game.toast('LOCAL DUNGEON MASTER AWAKENS', 1.8);
      if (this.game.started && !this.pending && this.cooldown <= 0) this.requestBeat('local_ai_enabled');
      return;
    }

    if (message.type === 'decision') {
      if (!this.pending || message.requestId !== this.pending.requestId) return;
      const { allowed, snapshot } = this.pending;
      this.pending = null;
      const validated = validateDecision(message.text, allowed);
      const decision = validated || deterministicDecision(snapshot, [...this.seenEvents]);
      this._applyDecision(decision, allowed);
      return;
    }

    if (message.type === 'error') {
      if (message.stage === 'decision' && this.pending) {
        const { allowed, snapshot } = this.pending;
        this.pending = null;
        this._applyDecision(deterministicDecision(snapshot, [...this.seenEvents]), allowed);
      } else {
        this._onWorkerFailure(message.message || 'Local model failed to load');
      }
    }
  }

  _onWorkerFailure(message) {
    this.aiLoading = false;
    this.aiReady = false;
    this.pending = null;
    this.worker?.terminate();
    this.worker = null;
    this.ui.progress?.classList.add('hidden');
    if (this.ui.enable) {
      this.ui.enable.disabled = false;
      this.ui.enable.textContent = `Retry Local AI · ${AI_DOWNLOAD_LABEL}`;
    }
    this._setStatus('STANDARD', `Local AI unavailable; the authored director remains active. ${String(message).slice(0, 90)}`);
  }

  _updateProgress(message) {
    let ratio = null;
    if (Number.isFinite(message.progress)) ratio = message.progress > 1 ? message.progress / 100 : message.progress;
    else if (message.total > 0) ratio = message.loaded / message.total;
    ratio = ratio == null ? null : Math.max(0, Math.min(1, ratio));

    if (this.ui.progressBar && ratio != null) this.ui.progressBar.style.transform = `scaleX(${ratio})`;
    const percent = ratio == null ? '' : ` ${Math.round(ratio * 100)}%`;
    const file = message.file ? ` · ${message.file.split('/').pop()}` : '';
    this._setStatus('DOWNLOADING', `Loading local Dungeon Master${percent}${file}`);
  }

  _applyDecision(decision, allowed) {
    if (!decision || !allowed.includes(decision.event)) return;
    const event = DM_EVENT_CATALOG[decision.event];
    if (!event) return;

    this.seenEvents.add(event.id);
    this.cooldown = 7;

    if (event.action === 'GRANT_BOON') {
      const player = this.game.player;
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * event.healFraction);
      player.mana = Math.min(player.maxMana, player.mana + player.maxMana * event.manaFraction);
      this.game.fx.ring(player.position, 0xffd782, 0.28, 2.3, 0.55);
      this.game.toast('DM BOON · EMBER GRACE', 1.55);
    } else if (event.action === 'SUMMON_REINFORCEMENT') {
      for (let i = 0; i < event.count; i++) this.game._spawnEnemy();
      this.game.toast('DM TWIST · THE BRIARS ANSWER', 1.55);
    } else {
      this.game.toast(`DM OMEN · ${event.label.toUpperCase()}`, 1.55);
    }

    this._showQuestBeat(event.copy);
    const source = decision.source === 'ai' ? 'LOCAL AI' : 'STANDARD';
    this._setStatus(source, `${event.label}: ${event.copy}`);
  }

  _showQuestBeat(copy) {
    if (!this.game.ui?.questCopy) return;
    clearTimeout(this.questRestoreTimer);
    this.game.ui.questCopy.textContent = copy;
    this.game.ui.questCopy.classList.add('dm-authored');
    this.questRestoreTimer = setTimeout(() => {
      if (!this.game.ui?.questCopy || this.game.victoryShown) return;
      this.game.ui.questCopy.classList.remove('dm-authored');
      if (this.game.kills >= this.game.objectiveKills) {
        this.game.ui.questCopy.textContent = 'The glade falls silent. Something ancient stirs beyond the shrine…';
      } else {
        this.game.ui.questCopy.textContent = this.baseQuestCopy;
      }
    }, 7600);
  }

  _setStatus(badge, message) {
    if (this.ui.badge) this.ui.badge.textContent = badge;
    if (this.ui.message) this.ui.message.textContent = message;
    if (this.ui.panel) this.ui.panel.dataset.mode = badge.toLowerCase().replaceAll(' ', '-');
  }
}

export function installDungeonMaster(game) {
  const director = new DungeonMaster(game);
  const updateEncounter = game._updateEncounter.bind(game);
  game._updateEncounter = dt => {
    updateEncounter(dt);
    director.update(dt);
  };
  game.dungeonMaster = director;
  return director;
}
