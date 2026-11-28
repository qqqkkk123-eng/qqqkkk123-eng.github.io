/* 비밀본(제과제빵 이론 백과) 서비스 워커.
 *
 * 목적: 홈 화면에 설치한 앱이 (1) 오프라인에서도 열리고 (2) 새 버전을 배포하면
 *       다음 방문에 바로 반영되도록 한다.
 *  - 화면(HTML) 요청: 네트워크 우선 → 실패하면 캐시(마지막으로 받은 비밀본)
 *  - 그 밖의 같은 사이트 파일(아이콘·manifest 등): 캐시 우선 + 뒤에서 갱신
 *  - share-pro.html·share-study.html 은 네트워크 우선이라 항상 최신본이 뜬다.
 */
const CACHE = 'bakery-pwa-v7';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 일부 파일이 없어도 설치가 막히지 않게 개별로 담는다
    await Promise.all(CORE.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); } catch (e) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 화면 요청: 네트워크 우선, 끊기면 캐시로
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE);
        return (await cache.match(req, { ignoreSearch: true })) ||
               (await cache.match('index.html')) ||
               (await cache.match('./')) ||
               new Response('오프라인 상태입니다. 연결 후 다시 열어 주세요.',
                            { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // 그 밖의 파일: 캐시 우선 + 뒤에서 갱신
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    const net = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
