let DiscordRPC = null;
try { DiscordRPC = require('discord-rpc'); } catch (_) { DiscordRPC = null; }

/** Nom affiché dans details/state — le titre "Joue à …" vient du nom de l'app Discord (Developer Portal). */
const APP_LABEL = 'LuLuneAutoClicker';
const DEFAULT_IMAGE_KEY = 'logo';

function createDiscordRpcController() {
  let client = null;
  let ready = false;
  let currentId = '';
  let timer = null;
  let lastPayload = null;

  async function ensure(clientId) {
    const id = String(clientId || '').trim();
    if (!DiscordRPC || !id) {
      await destroy();
      return false;
    }
    if (client && currentId === id && ready) return true;
    await destroy();
    try {
      client = new DiscordRPC.Client({ transport: 'ipc' });
      currentId = id;
      client.on('ready', () => { ready = true; if (lastPayload) apply(lastPayload); });
      await client.login({ clientId: id });
      return true;
    } catch (e) {
      console.warn('Discord RPC unavailable:', e.message);
      await destroy();
      return false;
    }
  }

  function buildButtons(cfg) {
    const url = String(cfg?.websiteUrl || '').trim();
    if (!/^https?:\/\//i.test(url)) return undefined;
    return [{ label: 'Site web', url }];
  }

  function apply(payload) {
    lastPayload = payload;
    if (!client || !ready) return;
    try {
      if (!payload || payload.clear) {
        client.clearActivity().catch(() => {});
        return;
      }
      const activity = {
        details: payload.details || APP_LABEL,
        state: payload.state || 'Idle',
        largeImageKey: payload.largeImageKey || DEFAULT_IMAGE_KEY,
        largeImageText: APP_LABEL,
        startTimestamp: payload.startTimestamp || undefined,
        instance: false
      };
      if (payload.buttons?.length) activity.buttons = payload.buttons;
      client.setActivity(activity).catch(() => {});
    } catch (_) { /* no-op */ }
  }

  let refreshFn = null;

  async function sync(settings, ctx) {
    const cfg = settings?.discordRpc || {};
    if (!cfg.enabled || !String(cfg.clientId || '').trim()) {
      stopTimer();
      await destroy();
      return;
    }
    const ok = await ensure(cfg.clientId);
    if (!ok) return;
    const clicking = !!ctx?.clicking;
    const paused = !!ctx?.paused;
    const cps = Math.round(ctx?.liveCps || 0);
    const buttons = buildButtons(cfg);
    const base = {
      details: APP_LABEL,
      largeImageKey: DEFAULT_IMAGE_KEY,
      buttons
    };
    if (clicking) {
      apply({
        ...base,
        state: paused ? `Paused · ${cps} CPS` : `Clicking · ${cps} CPS`,
        startTimestamp: ctx?.sessionStart || undefined
      });
      refreshFn = typeof ctx?.getLive === 'function'
        ? () => sync(settings, { ...ctx.getLive(), getLive: ctx.getLive })
        : null;
      startTimer();
    } else {
      apply({ ...base, state: 'Idle' });
      stopTimer();
    }
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(() => {
      try { if (refreshFn) refreshFn(); } catch (_) {}
    }, 15000);
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  async function destroy() {
    stopTimer();
    ready = false;
    currentId = '';
    lastPayload = null;
    if (client) {
      try { await client.clearActivity(); } catch (_) {}
      try { client.destroy(); } catch (_) {}
    }
    client = null;
  }

  return { sync, destroy };
}

module.exports = { createDiscordRpcController, APP_LABEL, DEFAULT_IMAGE_KEY };
