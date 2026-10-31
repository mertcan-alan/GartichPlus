// Garticphone Katman & Çizim - arka plan
// "Güvenilir (debugger)" yöntemi: sayfa sahte (isTrusted=false) olayları yok sayarsa,
// gerçek fare girdisini Chrome DevTools Protocol ile gönderir.
const tabs = new Map(); // tabId -> boşta kalınca ayırma zamanlayıcısı

async function ensure(tabId) {
  if (tabs.has(tabId)) return;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
  } catch (e) {
    if (!/already attached/i.test(String(e && e.message))) throw e;
  }
  tabs.set(tabId, null);
}

function touch(tabId) {
  clearTimeout(tabs.get(tabId));
  tabs.set(tabId, setTimeout(() => release(tabId), 6000));
}

async function release(tabId) {
  clearTimeout(tabs.get(tabId));
  tabs.delete(tabId);
  try { await chrome.debugger.detach({ tabId }); } catch (e) { /* zaten ayrık */ }
}

chrome.debugger.onDetach.addListener((src) => {
  if (src.tabId == null) return;
  clearTimeout(tabs.get(src.tabId));
  tabs.delete(src.tabId);
});
chrome.tabs.onRemoved.addListener((id) => tabs.delete(id));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.gp !== 'mouse' || !sender.tab) return;
  const tabId = sender.tab.id;
  (async () => {
    try {
      await ensure(tabId);
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: msg.type,
        x: msg.x,
        y: msg.y,
        button: msg.type === 'mouseMoved' && !msg.buttons ? 'none' : 'left',
        buttons: msg.buttons || 0,
        clickCount: msg.type === 'mouseMoved' ? 0 : 1,
        pointerType: 'mouse'
      });
      touch(tabId);
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true;
});
