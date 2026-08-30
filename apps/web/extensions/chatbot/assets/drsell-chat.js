(function () {
  var root = document.getElementById('drsell-chat-root');
  if (!root) return;
  var shop = root.getAttribute('data-shop') || '';
  var apiBase = window.DRSELL_API_BASE || 'https://drsell.szchada.top/api';
  var lang = (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  var UI = {
    zh: { title: 'Drsell 助手', placeholder: '输入问题…', send: '发送', me: '我', bot: '助手', system: '系统', close: '关闭', open: '打开客服' },
    en: { title: 'Drsell Assistant', placeholder: 'Ask a question…', send: 'Send', me: 'Me', bot: 'Assistant', system: 'System', close: 'Close', open: 'Chat with us' },
  }[lang];

  var config = {
    widgetPrimaryColor: '#0f766e',
    widgetHeaderColor: '#0f766e',
    widgetPosition: 'bottom-right',
    widgetWindowSize: 'medium',
    widgetLauncherStyle: 'chat',
    widgetVisible: true,
    widgetQuickReplies: [],
    welcomeMessage: lang === 'zh' ? '你好，有什么可以帮您？' : 'Hi! How can I help you today?',
  };

  var state = { open: false, log: null, input: null, send: null };
  var visitorId =
    localStorage.getItem('drsell_vid') ||
    (crypto.randomUUID && crypto.randomUUID()) ||
    String(Date.now());
  try { localStorage.setItem('drsell_vid', visitorId); } catch (e) {}

  function cssText(el, styles) {
    el.style.cssText = Object.keys(styles)
      .map(function (k) { return k + ':' + styles[k]; })
      .join(';');
  }

  function append(role, text) {
    if (!state.log) return;
    var row = document.createElement('div');
    row.style.marginBottom = '8px';
    row.style.whiteSpace = 'pre-wrap';
    row.style.wordBreak = 'break-word';
    row.textContent = role + ': ' + text;
    state.log.appendChild(row);
    state.log.scrollTop = state.log.scrollHeight;
  }

  function sizeFor() {
    if (config.widgetWindowSize === 'small') return { w: 280, h: 380 };
    if (config.widgetWindowSize === 'large') return { w: 360, h: 520 };
    return { w: 320, h: 440 };
  }

  function sideStyles() {
    var s = {};
    if (config.widgetPosition === 'bottom-left') { s.left = '16px'; s.right = 'auto'; }
    else { s.right = '16px'; s.left = 'auto'; }
    s.bottom = '16px';
    return s;
  }

  function launcherIcon() {
    if (config.widgetLauncherStyle === 'question') return '?';
    if (config.widgetLauncherStyle === 'custom') return '🖼';
    return '💬';
  }

  function renderLauncher() {
    var existing = document.getElementById('drsell-chat-launcher');
    if (existing) existing.remove();
    if (config.widgetVisible === false) return;

    var launcher = document.createElement('button');
    launcher.id = 'drsell-chat-launcher';
    launcher.setAttribute('aria-label', UI.open);
    cssText(launcher, Object.assign({
      position: 'fixed',
      zIndex: 99998,
      width: '52px',
      height: '52px',
      borderRadius: '50%',
      border: '0',
      color: '#fff',
      fontSize: '22px',
      cursor: 'pointer',
      boxShadow: '0 6px 18px rgba(0,0,0,.25)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: config.widgetPrimaryColor || '#0f766e'
    }, sideStyles()));
    launcher.textContent = launcherIcon();
    launcher.addEventListener('click', function () {
      state.open = !state.open;
      var panel = document.getElementById('drsell-chat-panel');
      if (panel) panel.style.display = state.open ? 'flex' : 'none';
    });
    document.body.appendChild(launcher);
  }

  function renderPanel() {
    var existing = document.getElementById('drsell-chat-panel');
    if (existing) existing.remove();
    if (config.widgetVisible === false) return;

    var size = sizeFor();
    var panel = document.createElement('div');
    panel.id = 'drsell-chat-panel';
    cssText(panel, Object.assign({
      position: 'fixed',
      zIndex: 99999,
      width: size.w + 'px',
      maxWidth: '90vw',
      height: size.h + 'px',
      maxHeight: '80vh',
      background: '#111827',
      color: '#f8fafc',
      borderRadius: '12px',
      boxShadow: '0 10px 30px rgba(0,0,0,.35)',
      fontFamily: 'system-ui,sans-serif',
      overflow: 'hidden',
      display: state.open ? 'flex' : 'none',
      flexDirection: 'column'
    }, sideStyles()));

    var header = document.createElement('div');
    cssText(header, {
      padding: '12px 14px',
      background: config.widgetHeaderColor || config.widgetPrimaryColor || '#0f766e',
      fontWeight: '600',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexShrink: '0'
    });
    header.textContent = UI.title;

    var close = document.createElement('button');
    close.textContent = '✕';
    close.setAttribute('aria-label', UI.close);
    cssText(close, {
      background: 'transparent',
      border: '0',
      color: '#fff',
      fontSize: '14px',
      cursor: 'pointer'
    });
    close.addEventListener('click', function () {
      state.open = false;
      panel.style.display = 'none';
    });
    header.appendChild(close);

    var log = document.createElement('div');
    log.id = 'drsell-chat-log';
    cssText(log, {
      flex: '1',
      overflowY: 'auto',
      padding: '10px',
      fontSize: '13px'
    });

    var quickWrap = document.createElement('div');
    quickWrap.id = 'drsell-chat-quick';
    cssText(quickWrap, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      padding: '0 10px 6px'
    });

    var inputRow = document.createElement('div');
    cssText(inputRow, {
      display: 'flex',
      gap: '6px',
      padding: '10px',
      borderTop: '1px solid #1f2937',
      flexShrink: '0'
    });

    var input = document.createElement('input');
    input.id = 'drsell-chat-input';
    input.placeholder = UI.placeholder;
    cssText(input, {
      flex: '1',
      borderRadius: '8px',
      border: '1px solid #334155',
      background: '#0b1220',
      color: '#fff',
      padding: '8px'
    });

    var send = document.createElement('button');
    send.id = 'drsell-chat-send';
    send.textContent = UI.send;
    cssText(send, {
      background: config.widgetPrimaryColor || '#0f766e',
      border: '0',
      borderRadius: '8px',
      padding: '8px 10px',
      fontWeight: '600',
      color: '#fff',
      cursor: 'pointer'
    });

    inputRow.appendChild(input);
    inputRow.appendChild(send);
    panel.appendChild(header);
    panel.appendChild(log);
    panel.appendChild(quickWrap);
    panel.appendChild(inputRow);
    document.body.appendChild(panel);

    state.log = log;
    state.input = input;
    state.send = send;
    state.open = true;
    panel.style.display = 'flex';

    if (config.welcomeMessage) append(UI.system, config.welcomeMessage);
    renderQuickReplies();
    bindChat();
  }

  function renderQuickReplies() {
    var wrap = document.getElementById('drsell-chat-quick');
    if (!wrap) return;
    wrap.innerHTML = '';
    (config.widgetQuickReplies || []).forEach(function (q) {
      if (!q || !q.trim()) return;
      var chip = document.createElement('button');
      chip.textContent = q;
      cssText(chip, {
        background: 'transparent',
        border: '1px solid ' + (config.widgetPrimaryColor || '#0f766e'),
        color: '#fff',
        borderRadius: '999px',
        padding: '4px 10px',
        fontSize: '12px',
        cursor: 'pointer'
      });
      chip.addEventListener('click', function () {
        state.input.value = q;
        chat();
      });
      wrap.appendChild(chip);
    });
  }

  function bindChat() {
    state.log = document.getElementById('drsell-chat-log');
    state.input = document.getElementById('drsell-chat-input');
    state.send = document.getElementById('drsell-chat-send');
    if (state.send) state.send.addEventListener('click', chat);
    if (state.input) state.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') chat();
    });
  }

  async function chat() {
    var text = (state.input.value || '').trim();
    if (!text) return;
    state.input.value = '';
    append(UI.me, text);
    try {
      var res = await fetch(apiBase + '/public/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain: shop, text: text, visitorId: visitorId })
      });
      if (!res.ok) {
        append(UI.bot, 'Error: ' + res.status);
        return;
      }
      var reader = res.body && res.body.getReader();
      if (!reader) {
        append(UI.bot, await res.text());
        return;
      }
      var decoder = new TextDecoder();
      var botText = '';
      while (true) {
        var step = await reader.read();
        if (step.done) break;
        var piece = decoder.decode(step.value, { stream: true });
        if (!piece) continue;
        botText += piece;
        if (state.log.lastChild) state.log.removeChild(state.log.lastChild);
        append(UI.bot, botText);
      }
      if (!botText) append(UI.bot, '(empty)');
    } catch (e) {
      append(UI.bot, String(e));
    }
  }

  function applyConfig(c) {
    if (!c) return;
    if (c.widgetPrimaryColor) config.widgetPrimaryColor = c.widgetPrimaryColor;
    if (c.widgetHeaderColor) config.widgetHeaderColor = c.widgetHeaderColor;
    if (c.widgetPosition) config.widgetPosition = c.widgetPosition;
    if (c.widgetWindowSize) config.widgetWindowSize = c.widgetWindowSize;
    if (c.widgetLauncherStyle) config.widgetLauncherStyle = c.widgetLauncherStyle;
    if (typeof c.widgetVisible === 'boolean') config.widgetVisible = c.widgetVisible;
    if (Array.isArray(c.widgetQuickReplies)) config.widgetQuickReplies = c.widgetQuickReplies;
    if (c.welcomeMessage) config.welcomeMessage = c.welcomeMessage;
  }

  fetch(apiBase + '/public/widget-config?shop=' + encodeURIComponent(shop))
    .then(function (r) { return r.json(); })
    .then(function (c) {
      applyConfig(c);
      renderLauncher();
      renderPanel();
    })
    .catch(function () {
      renderLauncher();
      renderPanel();
    });
})();
