(function () {
  var root = document.getElementById('drsell-chat-root');
  if (!root) return;
  var shop = root.getAttribute('data-shop') || '';
  var apiBase = window.DRSELL_API_BASE || 'https://drsell.szchada.top/api';
  var lang = (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  var UI = {
    zh: { title: 'Drsell 助手', placeholder: '输入问题…', send: '发送', me: '我', bot: '助手', close: '关闭', open: '打开客服' },
    en: { title: 'Drsell Assistant', placeholder: 'Type your message here…', send: 'Send', me: 'Me', bot: 'Assistant', close: 'Close', open: 'Chat with us' },
  }[lang];

  /** Widget theme fallbacks — sole hex source until TBD-2 resolves token injection. */
  var FALLBACK = {
    primary: '#006c49',
    onPrimary: '#ffffff',
    text: '#181c1f',
    textMuted: '#6b7280',
    bubbleOther: '#ebedf3',
    border: '#e5e7eb',
    inputBorder: '#d1d5db',
  };

  function primaryColor() {
    return config.widgetPrimaryColor || FALLBACK.primary;
  }

  function headerColor() {
    return config.widgetHeaderColor || config.widgetPrimaryColor || FALLBACK.primary;
  }

  var config = {
    shopName: '',
    widgetPrimaryColor: FALLBACK.primary,
    widgetHeaderColor: FALLBACK.primary,
    widgetPosition: 'bottom-right',
    widgetWindowSize: 'medium',
    widgetLauncherStyle: 'chat',
    widgetVisible: true,
    widgetQuickReplies: ['Where is my order?', 'What is your return policy?', 'Do you ship internationally?'],
    welcomeMessage: lang === 'zh' ? '你好，有什么可以帮您？' : "Hi! I'm Ava. How can I help you today?",
    widgetPreviewOpen: false,
  };

  var state = { open: false, log: null, input: null, send: null };
  var visitorId =
    localStorage.getItem('drsell_vid') ||
    (crypto.randomUUID && crypto.randomUUID()) ||
    String(Date.now());
  try { localStorage.setItem('drsell_vid', visitorId); } catch (e) {}

  function cssText(el, styles) {
    Object.keys(styles).forEach(function (k) {
      el.style[k] = styles[k];
    });
  }

  function nowLabel() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    var mm = m < 10 ? '0' + m : '' + m;
    var today = lang === 'zh' ? '今天' : 'Today';
    return today + ' ' + h + ':' + mm + ' ' + ampm;
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
      color: FALLBACK.onPrimary,
      fontSize: '22px',
      cursor: 'pointer',
      boxShadow: '0 6px 18px rgba(0,0,0,.25)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: primaryColor(),
    }, sideStyles()));
    launcher.textContent = launcherIcon();
    launcher.addEventListener('click', function () {
      state.open = !state.open;
      var panel = document.getElementById('drsell-chat-panel');
      if (panel) panel.style.display = state.open ? 'flex' : 'none';
    });
    document.body.appendChild(launcher);
  }

  function append(role, text) {
    if (!state.log) return;
    var bubble = document.createElement('div');
    var mine = role === 'me';
    cssText(bubble, {
      maxWidth: '85%',
      padding: '7px 11px',
      borderRadius: '12px',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      fontSize: '13px',
      lineHeight: '1.45',
      alignSelf: mine ? 'flex-end' : 'flex-start',
      background: mine ? primaryColor() : FALLBACK.bubbleOther,
      color: mine ? FALLBACK.onPrimary : FALLBACK.text,
      borderBottomRightRadius: mine ? '4px' : '12px',
      borderBottomLeftRadius: mine ? '12px' : '4px',
    });
    bubble.textContent = text;
    state.log.appendChild(bubble);
    state.log.scrollTop = state.log.scrollHeight;
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
      background: FALLBACK.onPrimary,
      color: FALLBACK.text,
      borderRadius: '16px',
      boxShadow: '0 10px 30px rgba(0,0,0,.18)',
      fontFamily: 'system-ui,sans-serif',
      overflow: 'hidden',
      display: state.open ? 'flex' : 'none',
      flexDirection: 'column',
    }, sideStyles()));

    var header = document.createElement('div');
    cssText(header, {
      padding: '12px 14px',
      background: headerColor(),
      color: FALLBACK.onPrimary,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexShrink: '0',
      gap: '8px',
    });

    var name = (config.shopName || UI.title).trim();
    var avatar = document.createElement('span');
    avatar.textContent = (name.slice(0, 1) || '?').toUpperCase();
    cssText(avatar, {
      width: '28px',
      height: '28px',
      borderRadius: '50%',
      background: 'rgba(255,255,255,.22)',
      color: FALLBACK.onPrimary,
      fontSize: '13px',
      fontWeight: '700',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: '0',
    });

    var nameWrap = document.createElement('div');
    cssText(nameWrap, { display: 'flex', flexDirection: 'column', minWidth: '0' });
    var nameEl = document.createElement('div');
    nameEl.textContent = name;
    cssText(nameEl, {
      fontSize: '14px',
      fontWeight: '600',
      lineHeight: '1.25',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    });
    var statusEl = document.createElement('div');
    statusEl.textContent = lang === 'zh' ? '● 通常会在几分钟内回复' : '● Typically replies instantly';
    cssText(statusEl, { fontSize: '11px', opacity: '.82', marginTop: '1px' });
    nameWrap.appendChild(nameEl);
    nameWrap.appendChild(statusEl);

    var headLeft = document.createElement('div');
    cssText(headLeft, { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '0' });
    headLeft.appendChild(avatar);
    headLeft.appendChild(nameWrap);

    var close = document.createElement('button');
    close.textContent = '✕';
    close.setAttribute('aria-label', UI.close);
    cssText(close, {
      background: 'transparent',
      border: '0',
      color: FALLBACK.onPrimary,
      fontSize: '14px',
      cursor: 'pointer',
      flexShrink: '0',
    });
    close.addEventListener('click', function () {
      state.open = false;
      panel.style.display = 'none';
    });
    header.appendChild(headLeft);
    header.appendChild(close);

    var log = document.createElement('div');
    log.id = 'drsell-chat-log';
    cssText(log, {
      flex: '1',
      overflowY: 'auto',
      padding: '10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      fontSize: '13px',
      background: FALLBACK.onPrimary,
    });

    var stamp = document.createElement('span');
    stamp.textContent = nowLabel();
    cssText(stamp, {
      textAlign: 'center',
      fontSize: '10px',
      color: FALLBACK.textMuted,
      marginBottom: '2px',
    });
    log.appendChild(stamp);

    var quickWrap = document.createElement('div');
    quickWrap.id = 'drsell-chat-quick';
    cssText(quickWrap, {
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      gap: '6px',
      padding: '0 10px 8px',
    });

    var inputRow = document.createElement('div');
    cssText(inputRow, {
      display: 'flex',
      gap: '8px',
      padding: '10px',
      borderTop: '1px solid ' + FALLBACK.border,
      flexShrink: '0',
      background: FALLBACK.onPrimary,
    });

    var input = document.createElement('input');
    input.id = 'drsell-chat-input';
    input.placeholder = UI.placeholder;
    cssText(input, {
      flex: '1',
      minWidth: '0',
      borderRadius: '999px',
      border: '1px solid ' + FALLBACK.inputBorder,
      background: FALLBACK.onPrimary,
      color: FALLBACK.text,
      padding: '9px 14px',
      fontSize: '13px',
      outline: 'none',
    });

    var send = document.createElement('button');
    send.id = 'drsell-chat-send';
    send.textContent = '➤';
    send.setAttribute('aria-label', UI.send);
    cssText(send, {
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      border: '0',
      background: primaryColor(),
      color: FALLBACK.onPrimary,
      fontSize: '16px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: '0',
    });

    var footer = document.createElement('div');
    footer.id = 'drsell-chat-footer';
    footer.textContent = 'Powered by AIChat';
    cssText(footer, {
      textAlign: 'center',
      padding: '7px 10px',
      fontSize: '10px',
      color: FALLBACK.textMuted,
      borderTop: '1px solid ' + FALLBACK.border,
      background: FALLBACK.onPrimary,
      flexShrink: '0',
    });

    inputRow.appendChild(input);
    inputRow.appendChild(send);
    panel.appendChild(header);
    panel.appendChild(log);
    panel.appendChild(quickWrap);
    panel.appendChild(inputRow);
    panel.appendChild(footer);
    document.body.appendChild(panel);

    state.log = log;
    state.input = input;
    state.send = send;
    state.open = config.widgetPreviewOpen === true;
    panel.style.display = state.open ? 'flex' : 'none';

    if (config.welcomeMessage) append('bot', config.welcomeMessage);
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
        border: '1px solid ' + primaryColor(),
        color: primaryColor(),
        borderRadius: '999px',
        padding: '5px 11px',
        fontSize: '12px',
        cursor: 'pointer',
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
    append('me', text);
    try {
      var res = await fetch(apiBase + '/public/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain: shop, text: text, visitorId: visitorId })
      });
      if (!res.ok) {
        append('bot', 'Error: ' + res.status);
        return;
      }
      var reader = res.body && res.body.getReader();
      if (!reader) {
        append('bot', await res.text());
        return;
      }
      var decoder = new TextDecoder();
      var botText = '';
      var streamingBubble = null;
      while (true) {
        var step = await reader.read();
        if (step.done) break;
        var piece = decoder.decode(step.value, { stream: true });
        if (!piece) continue;
        botText += piece;
        if (!streamingBubble) {
          append('bot', botText);
          streamingBubble = state.log.lastChild;
        } else {
          streamingBubble.textContent = botText;
        }
      }
      if (!botText) append('bot', '(empty)');
    } catch (e) {
      append('bot', String(e));
    }
  }

  function applyConfig(c) {
    if (!c) return;
    if (c.shopName) config.shopName = c.shopName;
    if (c.widgetPrimaryColor) config.widgetPrimaryColor = c.widgetPrimaryColor;
    if (c.widgetHeaderColor) config.widgetHeaderColor = c.widgetHeaderColor;
    if (c.widgetPosition) config.widgetPosition = c.widgetPosition;
    if (c.widgetWindowSize) config.widgetWindowSize = c.widgetWindowSize;
    if (c.widgetLauncherStyle) config.widgetLauncherStyle = c.widgetLauncherStyle;
    if (typeof c.widgetVisible === 'boolean') config.widgetVisible = c.widgetVisible;
    if (Array.isArray(c.widgetQuickReplies)) config.widgetQuickReplies = c.widgetQuickReplies;
    if (c.welcomeMessage) config.welcomeMessage = c.welcomeMessage;
    if (c.widgetPreviewOpen === true) config.widgetPreviewOpen = true;
  }

  var previewConfig = window.DRSELL_CONFIG || null;
  if (previewConfig) {
    applyConfig(previewConfig);
    renderLauncher();
    renderPanel();
  } else {
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
  }
})();
