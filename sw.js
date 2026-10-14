'use strict';
// Dados pessoais e respostas da API nunca são armazenados no cache offline.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode!=='navigate')return;
 event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sem conexão • BlackFit</title><body style="background:#0a0a0f;color:#f0f0f5;font:18px system-ui;padding:32px"><h1>Você está sem conexão.</h1><p>Conecte-se à internet e abra o app novamente para acessar seus planos e salvar o progresso.</p></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}})));
});
