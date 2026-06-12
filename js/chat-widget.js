// SunTrade Chat Widget — WhatsApp-style floating chat
(function() {
  const API_BASE = '';  // same origin
  const STORAGE_KEY = 'suntrade_chat_id';
  const LANG_KEY = 'suntrade_chat_lang';
  const WHATSAPP_FALLBACK_URL = 'https://wa.me/77021379248';
  const WHATSAPP_FALLBACK_NUMBER = '+7 702 137 9248';

  // Localized button labels for WhatsApp fallback
  const whatsappBtnTexts = {
    kz: 'WhatsApp-қа жазу', ru: 'Написать в WhatsApp', en: 'Write on WhatsApp',
    de: 'Auf WhatsApp schreiben', fr: 'Écrire sur WhatsApp', es: 'Escribir en WhatsApp',
    tr: 'WhatsApp\'ta yaz', it: 'Scrivi su WhatsApp', pt: 'Escrever no WhatsApp',
    nl: 'Schrijven op WhatsApp', pl: 'Napisz na WhatsApp', ar: 'اكتب على WhatsApp',
    zh: '在 WhatsApp 上写', ja: 'WhatsAppで書く', ko: 'WhatsApp에 쓰기'
  };

  // Generate or retrieve customer ID (safe in private mode / restricted contexts)
  function getCustomerId() {
    let id = null;
    try { id = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (!id) {
      id = 'cust_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      try { localStorage.setItem(STORAGE_KEY, id); } catch (e) {}
    }
    return id;
  }

  // Detect a sensible default language (site lang > browser lang > 'en')
  function getDefaultLang() {
    try { if (localStorage.getItem('suntrade_lang')) return localStorage.getItem('suntrade_lang'); } catch (e) {}
    if (document.documentElement && document.documentElement.lang) {
      return (document.documentElement.lang || 'en').split('-')[0];
    }
    if (typeof navigator !== 'undefined' && navigator.language) {
      return (navigator.language || 'en').split('-')[0];
    }
    return 'en';
  }

  // Get current site language
  function getSiteLang() {
    return localStorage.getItem(LANG_KEY) || document.documentElement.lang || 'en';
  }

  const customerId = getCustomerId();
  let isOpen = false;
  let pollInterval = null;
  let lastMessageCount = 0;

  // Check if mobile
  function isMobile() {
    return window.innerWidth <= 768;
  }

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
          <button class="cw-back-btn" id="cw-back-btn" onclick="ChatWidget.close()" aria-label="Back">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="cw-header-info">
            <div class="cw-avatar">S</div>
            <div>
              <div class="cw-header-name">SunTrade</div>
              <div class="cw-header-status" id="cw-status">Online</div>
            </div>
          </div>
          <div class="cw-header-actions">
            <a href="${WHATSAPP_FALLBACK_URL}" target="_blank" rel="noopener" class="cw-wa-link" id="cw-wa-link" title="Write on WhatsApp">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            </a>
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
            <button class="cw-close-btn" onclick="ChatWidget.toggle()" aria-label="Close">×</button>
          </div>
        </div>

        <div class="cw-messages" id="cw-messages">
          <div class="cw-welcome">
            <div class="cw-avatar-lg">S</div>
            <h3>SunTrade</h3>
            <p id="cw-welcome-text"></p>
            <div class="cw-quick-actions">
              <button onclick="ChatWidget.quickMsg('Сіздерде қандай тауарлар бар?')"><svg class="icon icon-sm" style="vertical-align:middle;margin-right:4px;"><use href="#icon-cart"/></svg>Тауарлар</button>
              <button onclick="ChatWidget.quickMsg('Жеткізу қанша тұрады?')"><svg class="icon icon-sm" style="vertical-align:middle;margin-right:4px;"><use href="#icon-truck"/></svg>Жеткізу</button>
              <button onclick="ChatWidget.quickMsg('Қайтару мүмкін бе?')"><svg class="icon icon-sm" style="vertical-align:middle;margin-right:4px;"><use href="#icon-arrow-right"/></svg>Қайтару</button>
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

    // Set saved language (fall back to site/browser language, not hardcoded KZ)
    let savedLang = null;
    try { savedLang = localStorage.getItem(LANG_KEY); } catch (e) {}
    if (!savedLang) savedLang = getDefaultLang();
    document.getElementById('cw-lang').value = savedLang;
    updateWelcomeText(savedLang);
  }

  // Welcome text in different languages
  const welcomeTexts = {
    kz: 'Сәлеметсіз бе! Сізге қалай көмектесе аламын?',
    ru: 'Здравствуйте! Чем могу помочь?',
    en: 'Hello! How can I help you?',
    de: 'Hallo! Wie kann ich Ihnen helfen?',
    fr: 'Bonjour! Comment puis-je vous aider?',
    es: '¡Hola! ¿En qué puedo ayudarte?',
    tr: 'Merhaba! Size nasıl yardımcı olabilirim?',
    zh: '你好！我能帮您什么？',
    ar: '!مرحبا كيف يمكنني مساعدتك؟',
    it: 'Ciao! Come posso aiutarti?',
    pt: 'Olá! Como posso ajudar?',
    nl: 'Hallo! Hoe kan ik u helpen?',
    pl: 'Cześć! Jak mogę pomóc?',
    ja: 'こんにちは！どのようにお手伝いできますか？',
    ko: '안녕하세요! 무엇을 도와드릴까요?'
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
      // On mobile, lock background scroll. The back button is shown by CSS @media
      // (max-width: 768px) and hidden on desktop, so no JS override needed here.
      if (isMobile()) {
        document.body.classList.add('cw-no-scroll');
      }
      // Focus input after the window has rendered so mobile keyboard pushes layout correctly
      setTimeout(() => {
        const input = document.getElementById('cw-input');
        if (input) input.focus();
      }, 100);
      loadHistory();
      startPolling();
    } else {
      win.style.display = 'none';
      btn.classList.remove('active');
      document.body.classList.remove('cw-no-scroll');
      stopPolling();
    }
  }

  // Close chat (used by back button on mobile)
  function close() {
    if (isOpen) toggle();
  }

  // Keep chat layout in sync with viewport size (handles rotation / resize)
  // The back button visibility is handled by CSS @media (max-width: 768px),
  // so JS only needs to manage the body scroll-lock class on resize.
  function handleResize() {
    if (!isOpen) return; // only matters while chat is open
    if (isMobile()) {
      document.body.classList.add('cw-no-scroll');
    } else {
      document.body.classList.remove('cw-no-scroll');
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

  // Load message history
  async function loadHistory() {
    try {
      const resp = await fetch(`${API_BASE}/api/chat?action=messages&customerId=${customerId}`);
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
          statusEl.textContent = (typeof t === 'function' ? t('operator_connected') : 'Operator connected');
          statusEl.style.color = '#FF6B00';
        } else if (data.conversation.status === 'closed') {
          statusEl.textContent = (typeof t === 'function' ? t('chat_closed') : 'Chat closed');
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

    // If AI message is empty (e.g. rate limit), show WhatsApp fallback bubble
    if (!isCustomer && m.sender === 'ai' && (!m.original_text || !m.original_text.trim())) {
      return createFallbackBubbleHTML(time, m.original_text || '');
    }

    const senderLabel = m.sender === 'ai' ? '<svg class="icon icon-sm" style="vertical-align:middle;margin-right:4px;"><use href="#icon-sparkle"/></svg>AI' : m.sender === 'admin' ? '<svg class="icon icon-sm" style="vertical-align:middle;margin-right:4px;"><use href="#icon-user"/></svg>Manager' : '';
    return `
      <div class="cw-msg ${isCustomer ? 'cw-msg-out' : 'cw-msg-in'}">
        ${!isCustomer && senderLabel ? `<div class="cw-msg-sender">${senderLabel}</div>` : ''}
        <div class="cw-msg-text">${escapeHtml(m.original_text)}</div>
        <div class="cw-msg-time">${time}</div>
      </div>
    `;
  }

  // Render a fallback bubble with WhatsApp button
  function createFallbackBubbleHTML(time, text) {
    const lang = localStorage.getItem(LANG_KEY) || 'en';
    const btnLabel = whatsappBtnTexts[lang] || whatsappBtnTexts.en;
    return `
      <div class="cw-msg cw-msg-in cw-msg-fallback">
        <div class="cw-msg-text">${escapeHtml(text)}</div>
        <a href="${WHATSAPP_FALLBACK_URL}" target="_blank" rel="noopener" class="cw-msg-wa-btn">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align:middle;margin-right:6px;">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          ${btnLabel}: ${WHATSAPP_FALLBACK_NUMBER}
        </a>
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
      const lang = (() => { try { return localStorage.getItem(LANG_KEY) || getDefaultLang(); } catch (e) { return 'en'; } })();
      const resp = await fetch(`${API_BASE}/api/chat?action=message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, message })
      });

      const data = await resp.json();
      showTyping(false);

      if (data.fallback) {
        // AI unavailable — show WhatsApp fallback bubble
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        container.innerHTML += createFallbackBubbleHTML(time, data.reply || '');
        scrollToBottom();
        lastMessageCount += 2;
        return;
      }

      if (data.reply) {
        container.innerHTML += `
          <div class="cw-msg cw-msg-in">
            <div class="cw-msg-sender"><svg class="icon icon-sm" style="vertical-align:middle;margin-right:4px;"><use href="#icon-sparkle"/></svg>AI</div>
            <div class="cw-msg-text">${escapeHtml(data.reply)}</div>
            <div class="cw-msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        `;
        scrollToBottom();
      }

      if (data.status === 'human') {
        document.getElementById('cw-status').textContent = (typeof t === 'function' ? t('operator_connected') : 'Operator connected');
        document.getElementById('cw-status').style.color = '#FF6B00';
      }

      lastMessageCount += 2; // customer + reply

    } catch (err) {
      showTyping(false);
      container.innerHTML += `
        <div class="cw-msg cw-msg-in">
          <div class="cw-msg-text" style="color:#EF4444;">${(typeof t === 'function' ? t('error_sending_message') : 'Error sending message. Please try again.')}</div>
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

  // Sync with site language (called when langChanged event fires)
  function syncWithSiteLang(lang) {
    const supported = ['en', 'kz', 'ru', 'de', 'fr', 'es', 'tr', 'it', 'pt', 'nl', 'pl', 'ar'];
    if (!supported.includes(lang)) lang = 'en';
    localStorage.setItem(LANG_KEY, lang);
    const select = document.getElementById('cw-lang');
    if (select) select.value = lang;
    updateWelcomeText(lang);
  }

  // Listen to site language changes
  window.addEventListener('langChanged', (e) => {
    if (e.detail && e.detail.lang) {
      syncWithSiteLang(e.detail.lang);
    }
  });

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
        const resp = await fetch(`${API_BASE}/api/chat?action=messages&customerId=${customerId}`);
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

  // Initialize
  function init() {
    // Defensive: clear any leftover scroll-lock from a previous page (e.g. when
    // the user opened the chat on one page and navigated to another, the
    // .cw-no-scroll class would otherwise leave the new page unscrollable).
    document.body.classList.remove('cw-no-scroll');

    // Always create the floating widget (works on both desktop and mobile)
    createWidget();
    setupInput();
    // Sync with current site language
    const siteLang = localStorage.getItem('suntrade_lang') || 'en';
    syncWithSiteLang(siteLang);

    // Keep chat layout in sync with viewport size (rotation, mobile <-> desktop)
    window.addEventListener('resize', handleResize);

    // On mobile, the legacy .whatsapp-btn is kept as a quick WhatsApp shortcut.
    // On desktop, clicking it just opens WhatsApp in a new tab.
    if (isMobile()) {
      const waBtn = document.querySelector('.whatsapp-btn');
      if (waBtn) {
        waBtn.href = WHATSAPP_FALLBACK_URL;
        waBtn.setAttribute('target', '_blank');
        waBtn.setAttribute('rel', 'noopener');
        waBtn.removeAttribute('onclick');
      }
    }
  }

  // Public API
  window.ChatWidget = { toggle, close, send, quickMsg, setLang };

  // Init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
