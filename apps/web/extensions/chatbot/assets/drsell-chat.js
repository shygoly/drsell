(function () {
  var root = document.getElementById('drsell-chat-root');
  if (!root) return;
  var shop = root.getAttribute('data-shop') || '';
  var apiBase = window.DRSELL_API_BASE || 'https://drsell.szchada.top/api/backend';
  var lang = (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  var UI = {
    zh: { title: 'Drsell 助手', placeholder: '输入问题…', send: '发送', me: '我', bot: '助手', system: '系统' },
    en: { title: 'Drsell Assistant', placeholder: 'Ask a question…', send: 'Send', me: 'Me', bot: 'Assistant', system: 'System' },
  }[lang];

  var config = {
    widgetPrimaryColor: '#0f766e',
    widgetPosition: 'bottom-right',
    welcomeMessage: lang === 'zh' ? '你好，有什么可以帮您？' : 'Hi! How can I help you today?',
  };

  var panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:99999;width:320px;max-width:90vw;background:#111827;color:#f8fafc;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);font-family:system-ui,sans-serif;overflow:hidden';

  function render() {
    var side = config.widgetPosition === 'bottom-left' ? 'left:16px;right:auto' : 'right:16px;left:auto';
    panel.style.cssText = panel.style.cssText.replace(/right:16px|left:16px|left:auto|right:auto/g, '').trim();
    panel.style.cssText += ';' + side;
    panel.innerHTML =
      '<div style="padding:12px 14px;background:' +
      (config.widgetPrimaryColor || '#0f766e') +
      ';font-weight:600">' +
      UI.title +
      '</div>' +
      '<div id="drsell-chat-log" style="height:220px;overflow:auto;padding:10px;font-size:13px"></div>' +
      '<div style="display:flex;gap:6px;padding:10px;border-top:1px solid #1f2937">' +
      '<input id="drsell-chat-input" style="flex:1;border-radius:8px;border:1px solid #334155;background:#0b1220;color:#fff;padding:8px" placeholder="' +
      UI.placeholder +
      '"/>' +
      '<button id="drsell-chat-send" style="background:#2dd4bf;border:0;border-radius:8px;padding:8px 10px;font-weight:600">' +
      UI.send +
      '</button></div>';
    document.body.appendChild(panel);
    bindChat();
    if (config.welcomeMessage) append(UI.system, config.welcomeMessage);
  }

  var log, input, send;
  var visitorId =
    localStorage.getItem('drsell_vid') ||
    (crypto.randomUUID && crypto.randomUUID()) ||
    String(Date.now());
  localStorage.setItem('drsell_vid', visitorId);

  function append(role, text) {
    if (!log) return;
    var row = document.createElement('div');
    row.style.marginBottom = '8px';
    row.textContent = role + ': ' + text;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  function bindChat() {
    log = document.getElementById('drsell-chat-log');
    input = document.getElementById('drsell-chat-input');
    send = document.getElementById('drsell-chat-send');

    async function chat() {
      var text = (input.value || '').trim();
      if (!text) return;
      input.value = '';
      append(UI.me, text);
      try {
        var res = await fetch(apiBase + '/public/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shopDomain: shop, text: text, visitorId: visitorId }),
        });
        var reader = res.body && res.body.getReader();
        if (!reader) {
          append(UI.bot, await res.text());
          return;
        }
        var decoder = new TextDecoder();
        var buf = '';
        while (true) {
          var step = await reader.read();
          if (step.done) break;
          buf += decoder.decode(step.value, { stream: true });
        }
        append(UI.bot, buf || '(empty)');
      } catch (e) {
        append(UI.bot, String(e));
      }
    }

    send.addEventListener('click', chat);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') chat();
    });
  }

  fetch(apiBase + '/public/widget-config?shop=' + encodeURIComponent(shop))
    .then(function (r) {
      return r.json();
    })
    .then(function (c) {
      if (c) {
        config.widgetPrimaryColor = c.widgetPrimaryColor || config.widgetPrimaryColor;
        config.widgetPosition = c.widgetPosition || config.widgetPosition;
        config.welcomeMessage = c.welcomeMessage || config.welcomeMessage;
      }
      render();
    })
    .catch(function () {
      render();
    });
})();
