/* 川神プロトタイプ Service Worker
   ページ本体と assets をキャッシュし、オフラインでも起動できるようにします。
   更新時は CACHE_VERSION を上げることで古いキャッシュが破棄され、新版が反映されます。 */
"use strict";

var CACHE_VERSION = "kawakami-v12";
var CORE_CACHE = CACHE_VERSION + "-core";
var RUNTIME_CACHE = CACHE_VERSION + "-runtime";

/* SW は assets/ 配下にあるため、パスは SW の場所からの相対指定です */
var CORE_ASSETS = [
  "../index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./art-akayu-face.jpg",
  "./art-akayu-full.jpg",
  "./art-ayu-front.jpg",
  "./art-ayu-side.jpg",
  "./art-dobu-face.jpg",
  "./art-dobu-sprite.png",
  "./art-kare-face.jpg",
  "./art-kare-full.jpg",
  "./art-keyvisual.jpg",
  "./bg-battle-real.jpg",
  "./bg-common.jpg",
  "./bg-common-kare.jpg",
  "./bg-common-akayu.jpg",
  "./bg-home.jpg",
  "./bg-param.jpg",
  "./bg-tree.jpg",
  "./map-akayu.jpg",
  "./map-dobu.jpg",
  "./map-kare.jpg",
  "./map-care.jpg",
  "./map-battle.jpg",
  "./map-battle-wide.jpg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CORE_CACHE).then(function (cache) {
      /* 1件の失敗で全体を止めないよう、個別に追加する */
      return Promise.all(
        CORE_ASSETS.map(function (url) {
          return cache.add(url).catch(function () { /* 取得できない素材はオンライン時に補完 */ });
        })
      );
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CORE_CACHE && key !== RUNTIME_CACHE) {
            return caches.delete(key);
          }
          return null;
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  /* 画面遷移（ページ本体）はネットワーク優先、失敗時はキャッシュから起動 */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then(function (response) {
        var copy = response.clone();
        caches.open(CORE_CACHE).then(function (cache) { cache.put("../index.html", copy); });
        return response;
      }).catch(function () {
        return caches.match("../index.html", { ignoreSearch: true }).then(function (cached) {
          return cached || caches.match(request, { ignoreSearch: true });
        });
      })
    );
    return;
  }

  var url = new URL(request.url);

  /* 同一オリジン（画像・マニフェスト等）はキャッシュ優先＋裏で更新 */
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(function (cached) {
        var network = fetch(request).then(function (response) {
          if (response && response.status === 200) {
            var copy = response.clone();
            caches.open(CORE_CACHE).then(function (cache) { cache.put(request, copy); });
          }
          return response;
        }).catch(function () { return cached; });
        return cached || network;
      })
    );
    return;
  }

  /* 外部（Webフォント等）はキャッシュ優先でランタイムキャッシュへ保存 */
  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && (response.status === 200 || response.type === "opaque")) {
          var copy = response.clone();
          caches.open(RUNTIME_CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      });
    })
  );
});

/* ページ側から新バージョンへの即時切替を受け付ける */
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
