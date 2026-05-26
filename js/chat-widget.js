// SunTrade Chat Widget — WhatsApp-style floating chat
(function() {
  const API_BASE = '';  // same origin
  const STORAGE_KEY = 'suntrade_chat_id';
  const LANG_KEY = 'suntrade_chat_lang';

  // Generate or retrieve customer ID
  function getCustomerId() {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = 'cust_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  // Get current site language
  function getSiteLang() {
    return localStorage.getItem(LANG_KEY) || document.documentElement.lang || 'en';
  }

  const customerId = getCustomerId();
  let isOpen = false;
  let pollInterval = null;
  let lastMessageCount = 0;

  // Create widget HTML
  function createWidget() {
    const widget = document.createElement('div');
    widget.id = 'chat-widget';
    widget.innerHTML = `
      <!-- Floating Button -->
      <div class="cw-button" id="cw-btn" onclick="ChatWidget.toggle()">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="white">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        <span class="cw-badge" id="cw-badge" style="display:none;">1</span>
      </div>

      <!-- Chat Window -->
      <div class="cw-window" id="cw-window" style="display:none;">
        <div class="cw-header">
          <div class="cw-header-info">
            <div class="cw-avatar">S</div>
            <div>
              <div class="cw-header-name">SunTrade</div>
              <div class="cw-header-status" id="cw-status">Online</div>
            </div>
          </div>
          <div class="cw-header-actions">
            <select id="cw-lang" class="cw-lang-select" onchange="ChatWidget.setLang(this.value)">
              <option value="en">EN</option>
              <option value="ru">RU</option>
              <option value="kz">KZ</option>
              <option value="de">DE</option>
              <option value="fr">FR</option>
              <option value="es">ES</option>
              <option value="tr">TR</option>
              <option value="zh">ZH</option>
              <option value="ar">AR</option>
              <option value="it">IT</option>
              <option value="pt">PT</option>
              <option value="nl">NL</option>
              <option value="pl">PL</option>
              <option value="ja">JA</option>
              <option value="ko">KO</option>
            </select>
            <button class="cw-close-btn" onclick="ChatWidget.toggle()">×</button>
          </div>
        </div>

        <div class="cw-messages" id="cw-messages">
          <div class="cw-welcome">
            <div class="cw-avatar-lg">S</div>
            <h3>SunTrade</h3>
            <p id="cw-welcome-text">Сәлеметсіз бе! 👋 Сізге қалай көмектесе аламын?</p>
            <div class="cw-quick-actions">
              <button onclick="ChatWidget.quickMsg('Сіздерде қандай тауарлар бар?')">🛍️ Тауарлар</button>
              <button onclick="ChatWidget.quickMsg('Жеткізу қанша тұрады?')">🚚 Жеткізу</button>
              <button onclick="ChatWidget.quickMsg('Қайтару мүмкін бе?')">↩️ Қайтару</button>
            </div>
          </div>
        </div>

        <div class="cw-input-area">
          <div class="cw-typing" id="cw-typing" style="display:none;">
            <span></span><span></span><span></span>
          </div>
          <div class="cw-input-row">
            <textarea id="cw-input" placeholder="Хабарлама жазыңыз..." rows="1"
              onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();ChatWidget.send();}"></textarea>
            <button class="cw-send-btn" onclick="ChatWidget.send()">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(widget);

    // Set saved language
    const savedLang = localStorage.getItem(LANG_KEY) || 'kz';
    document.getElementById('cw-lang').value = savedLang;
    updateWelcomeText(savedLang);
  }

  // Welcome text in different languages
  const welcomeTexts = {
    kz: 'Сәлеметсіз бе! 👋 Сізге қалай көмектесе аламын?',
    ru: 'Здравствуйте! 👋 Чем могу помочь?',
    en: 'Hello! 👋 How can I help you?',
    de: 'Hallo! 👋 Wie kann ich Ihnen helfen?',
    fr: 'Bonjour! 👋 Comment puis-je vous aider?',
    es: '¡Hola! 👋 ¿En qué puedo ayudarte?',
    tr: 'Merhaba! 👋 Size nasıl yardımcı olabilirim?',
    zh: '你好！👋 我能帮您什么？',
    ar: '!مرحبا 👋 كيف يمكنني مساعدتك؟',
    it: 'Ciao! 👋 Come posso aiutarti?',
    pt: 'Olá! 👋 Como posso ajudar?',
    nl: 'Hallo! 👋 Hoe kan ik u helpen?',
    pl: 'Cześć! 👋 Jak mogę pomóc?',
    ja: 'こんにちは！👋 どのようにお手伝いできますか？',
    ko: '안녕하세요! 👋 무엇을 도와드릴까요?'
  };

  function updateWelcomeText(lang) {
    const el = document.getElementById('cw-welcome-text');
    if (el) el.textContent = welcomeTexts[lang] || welcomeTexts.en;
    const input = document.getElementById('cw-input');
    if (input) {
      const placeholders = {
        kz: 'Хабарлама жазыңыз...', ru: 'Напишите сообщение...', en: 'Type a message...',
        de: 'Nachricht schreiben...', fr: 'Écrivez un message...', es: 'Escribe un mensaje...',
        tr: 'Mesaj yazın...', zh: '输入消息...', ar: '...اكتب رسالة', it: 'Scrivi un messaggio...',
        pt: 'Escreva uma mensagem...', nl: 'Schrijf een bericht...', pl: 'Napisz wiadomość...',
        ja: 'メッセージを入力...', ko: '메시지를 입력하세요...'
      };
      input.placeholder = placeholders[lang] || placeholders.en;
    }
  }

  // Toggle chat window
  function toggle() {
    const win = document.getElementById('cw-window');
    const btn = document.getElementById('cw-btn');
    isOpen = !isOpen;
    if (isOpen) {
      win.style.display = 'flex';
      btn.classList.add('active');
      document.getElementById('cw-input').focus();
      loadHistory();
      startPolling();
    } else {
      win.style.display = 'none';
      btn.classList.remove('active');
      stopPolling();
    }
  }

  // Load message history
  async function loadHistory() {
    try {
      const resp = await fetch(`${API_BASE}/api/chat-messages?customerId=${customerId}`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (!data.messages || !data.messages.length) return;

      const container = document.getElementById('cw-messages');
      container.innerHTML = data.messages.map(m => createMessageHTML(m)).join('');
      lastMessageCount = data.messages.length;
      scrollToBottom();

      // Update status
      if (data.conversation) {
        const statusEl = document.getElementById('cw-status');
        if (data.conversation.status === 'human') {
          statusEl.textContent = 'Operator connected';
          statusEl.style.color = '#FF6B00';
        } else if (data.conversation.status === 'closed') {
          statusEl.textContent = 'Chat closed';
        }
      }
    } catch (err) {
      console.error('Load history error:', err);
    }
  }

  // Create message HTML
  function createMessageHTML(m) {
    const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isCustomer = m.direction === 'in';
    const senderLabel = m.sender === 'ai' ? '🤖 AI' : m.sender === 'admin' ? '👨‍💼 Manager' : '';
    return `
      <div class="cw-msg ${isCustomer ? 'cw-msg-out' : 'cw-msg-in'}">
        ${!isCustomer && senderLabel ? `<div class="cw-msg-sender">${senderLabel}</div>` : ''}
        <div class="cw-msg-text">${escapeHtml(m.original_text)}</div>
        <div class="cw-msg-time">${time}</div>
      </div>
    `;
  }

  // Send message
  async function send() {
    const input = document.getElementById('cw-input');
    const message = input.value.trim();
    if (!message) return;

    input.value = '';
    input.style.height = 'auto';

    // Add customer message to UI immediately
    const container = document.getElementById('cw-messages');
    const welcome = container.querySelector('.cw-welcome');
    if (welcome) welcome.remove();

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    container.innerHTML += `
      <div class="cw-msg cw-msg-out">
        <div class="cw-msg-text">${escapeHtml(message)}</div>
        <div class="cw-msg-time">${time}</div>
      </div>
    `;
    scrollToBottom();

    // Show typing indicator
    showTyping(true);

    try {
      const lang = localStorage.getItem(LANG_KEY) || 'kz';
      const resp = await fetch(`${API_BASE}/api/chat-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, message })
      });

      const data = await resp.json();
      showTyping(false);

      if (data.reply) {
        container.innerHTML += `
          <div class="cw-msg cw-msg-in">
            <div class="cw-msg-sender">🤖 AI</div>
            <div class="cw-msg-text">${escapeHtml(data.reply)}</div>
            <div class="cw-msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        `;
        scrollToBottom();
      }

      if (data.status === 'human') {
        document.getElementById('cw-status').textContent = 'Operator connected';
        document.getElementById('cw-status').style.color = '#FF6B00';
      }

      lastMessageCount += 2; // customer + reply

    } catch (err) {
      showTyping(false);
      container.innerHTML += `
        <div class="cw-msg cw-msg-in">
          <div class="cw-msg-text" style="color:#EF4444;">Error sending message. Please try again.</div>
        </div>
      `;
    }
    scrollToBottom();
  }

  // Quick message
  function quickMsg(text) {
    document.getElementById('cw-input').value = text;
    send();
  }

  // Set language
  function setLang(lang) {
    localStorage.setItem(LANG_KEY, lang);
    updateWelcomeText(lang);
  }

  // Typing indicator
  function showTyping(show) {
    document.getElementById('cw-typing').style.display = show ? 'flex' : 'none';
    scrollToBottom();
  }

  // Scroll to bottom
  function scrollToBottom() {
    const container = document.getElementById('cw-messages');
    if (container) container.scrollTop = container.scrollHeight;
  }

  // Escape HTML
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
  }

  // Polling for new messages
  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      if (!isOpen) return;
      try {
        const resp = await fetch(`${API_BASE}/api/chat-messages?customerId=${customerId}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.messages && data.messages.length > lastMessageCount) {
          // New messages from admin/AI
          const container = document.getElementById('cw-messages');
          const newMessages = data.messages.slice(lastMessageCount);
          newMessages.forEach(m => {
            if (m.direction === 'out') {
              container.innerHTML += createMessageHTML(m);
            }
          });
          lastMessageCount = data.messages.length;
          scrollToBottom();

          if (data.conversation) {
            const statusEl = document.getElementById('cw-status');
            if (data.conversation.status === 'human') {
              statusEl.textContent = 'Operator connected';
              statusEl.style.color = '#FF6B00';
            }
          }
        }
      } catch {}
    }, 5000);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  // Auto-resize textarea
  function setupInput() {
    const input = document.getElementById('cw-input');
    if (input) {
      input.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
      });
    }
  }

  // Initialize
  function init() {
    createWidget();
    setupInput();
  }

  // Public API
  window.ChatWidget = { toggle, send, quickMsg, setLang };

  // Init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
