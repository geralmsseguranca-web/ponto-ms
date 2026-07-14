// ══════════════════════════════════════════════════════════════════════════════
//  firebase-messaging-sw.js — Service Worker com escuta direta ao Firebase
//  Grupo M.S — Ponto Eletrônico
//
//  Funciona SEM Cloud Function. O SW escuta o nó push_queue do Firebase
//  Realtime Database diretamente e exibe a notificação quando chega dado novo.
//  O Chrome precisa ter sido aberto pelo menos uma vez após o login do admin.
// ══════════════════════════════════════════════════════════════════════════════

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyA8Il5dmZIQcZcScaHpo3w0-08mQPhi6bQ",
  authDomain: "pjtecnologiaesistemas-ponto-1.firebaseapp.com",
  databaseURL: "https://pjtecnologiaesistemas-ponto-1-default-rtdb.firebaseio.com",
  projectId: "pjtecnologiaesistemas-ponto-1",
  storageBucket: "pjtecnologiaesistemas-ponto-1.firebasestorage.app",
  messagingSenderId: "831326957279",
  appId: "1:831326957279:web:5d4b026fde16e634f3436a"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();
const db        = firebase.database();

// ── Controle de itens já notificados (evita duplicatas na mesma sessão do SW) ─
const _vistos = new Set();

// ── Escuta push_queue em tempo real ──────────────────────────────────────────
// O SW mantém esta conexão aberta mesmo com o Chrome "fechado" no Android.
// Quando um colaborador bate o ponto, o app grava em push_queue/<id> e
// este listener acorda o SW para exibir a notificação.
function iniciarEscutaFirebase() {
  const refFila = db.ref('push_queue');

  refFila.on('child_added', function(snap) {
    const item = snap.val();
    if (!item || !item.ts) return;

    const chave = snap.key;
    if (_vistos.has(chave)) return;
    _vistos.add(chave);

    // Ignora itens com mais de 60 segundos (histórico antigo ao iniciar o SW)
    if (Date.now() - item.ts > 60000) return;

    const isEntrada = item.tipo === 'entrada';
    const titulo    = isEntrada ? `✅ Entrada — ${item.nome}` : `🚪 Saída — ${item.nome}`;
    const corpo     = item.posto
      ? `📍 ${item.posto}  ·  ${item.hora}`
      : item.hora || '';

    self.registration.showNotification(titulo, {
      body:    corpo,
      icon:    './icon-192.png',
      badge:   './badge-72.png',
      tag:     'ponto-' + chave,
      vibrate: [200, 100, 200],
      renotify: true,
      data:    { url: self.location.origin }
    });
  });
}

// ── Inicia escuta quando o SW é ativado ──────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    self.clients.claim().then(function() {
      iniciarEscutaFirebase();
    })
  );
});

// ── Reinicia escuta quando o SW é instalado ───────────────────────────────────
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

// ── Mantém o SW vivo com mensagens periódicas da página ──────────────────────
self.addEventListener('message', function(event) {
  if (event.data && event.data.tipo === 'KEEP_ALIVE') {
    // Página manda ping a cada 20s para manter o SW ativo no Android
    event.ports[0] && event.ports[0].postMessage({ ok: true });
  }
  if (event.data && event.data.tipo === 'INIT_ESCUTA') {
    // Página pede explicitamente para iniciar/reiniciar a escuta
    iniciarEscutaFirebase();
  }
});

// ── Clique na notificação abre o app ─────────────────────────────────────────
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.location.origin;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (const client of list) {
        if (client.url.startsWith(url) && 'focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});

// ── FCM background (fallback caso chegue push via FCM também) ─────────────────
messaging.onBackgroundMessage(function(payload) {
  // Este handler só é chamado se vier um push FCM real (Cloud Function no futuro)
  // Por enquanto o push vem pelo listener Firebase acima
  console.log('[SW] FCM background:', payload);
});
