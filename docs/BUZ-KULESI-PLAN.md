# Buz Kulesi — yeni BiMola oyunu için ürün ve uygulama planı

> **Durum (15 Ekim 2026):** M1–M5 uygulandı; oyun katalogda. Güncel kurallar ve mimari için [BUZ-KULESI.md](BUZ-KULESI.md) esas alınır. Uygulamada kayma hızları sıkılaştırıldı (Normal: 55 + 40/kademe, tavan 520 birim/sn): basit bir tırmanıcı kombosuz saniyede yaklaşık 3 kat çıkabildiği için ilk değerlerle maçlar bitmiyordu. Icy Tower'dan esinlenen, çok oyunculu, 2D bir kule tırmanma oyunu. Kimlik `buz-kulesi`, giriş `/games/buz-kulesi/`.

## 1. Oyun fikri

Herkes aynı kulenin dibinden aynı anda başlar. Duvardan duvara koşup hız kazanır, Space ile zıplayıp bir üstteki basamakları yakalamaya çalışır. Hızlı koşan daha yükseğe zıplar. Bir zıplamada birden çok kat atlamak kombo başlatır. Kısa süre sonra ekran kendi kendine yukarı kaymaya başlar ve zamanla hızlanır. Ekranın altında kalan oyuncu düşer ve elenir. **Son ayakta kalan kazanır.**

Diğer oyuncular aynı kulede yarı saydam **hayaletler** olarak görünür. Çarpışma yoktur. Kombo yapan oyuncu **sabotaj hakkı** kazanır ve bunu bir rakibine gönderebilir.

## 2. Üzerinde anlaşılan kararlar

| Konu | Karar |
|---|---|
| Kazanma | Son ayakta kalan kazanır. Aynı anda düşenler arasında daha yüksek kata çıkan önde sayılır. |
| Kule | Maç başına tek tohum (seed). Herkes basamakları aynı yerde görür. |
| Ekran kayması | Her oyuncunun kamerası **ayrıdır**. Hız fonksiyonu herkes için aynıdır ve maç saatine bağlıdır. Öndeki oyuncu kendi ekranını yukarı iter. Geride kalan, öndekinin yüzünden ölmez. |
| Etkileşim | Hayalet + sabotaj. Fiziksel temas yok. |
| Görsel | 2D Canvas, yandan görünüm. Three.js yüklenmez. |
| İlk sürümdeki ekler | Kalıcı rekorlar ve karakter seçimi. Botlar ve dokunmatik kontroller sonraki sürüme kaldı. |
| Oyuncu sayısı | 1–12. Tek kişi antrenman yapabilir: tek başına başlar, düşünce biter. |
| Giriş | Klavye: ←/→ veya A/D ile koş, Space (veya ↑/W) ile zıpla, E ile sabotaj gönder. Dokunmatik kontrol sonraki sürümde. |

## 3. Oynanış kuralları

### 3.1 Hareket (Icy Tower hissi)

- Yatay hareket ivmelidir. Yerde sürtünme düşük olduğu için "buz" hissi verir, havada kontrol biraz daha azdır.
- **Duvar sekmesi:** Yan duvara çarpan oyuncu yatay hızını kaybetmez, yönü tersine döner. Duvardan duvara koşarak hız biriktirmek oyunun temel becerisidir.
- **Zıplama yüksekliği yatay hıza bağlıdır:** `vy = JUMP_BASE + |vx| * JUMP_SPEED_FACTOR`. Hız eşiğini aşan zıplama, dönme animasyonlu "süper zıplama" olarak görünür.
- Basamaklar **tek yönlüdür:** alttan içinden geçilir, yalnız düşerken üstüne basılır.
- Fizik sabit 60 Hz adımla çalışır (`step(state, input)`). Kare hızından bağımsızdır ve hem istemcide hem sunucu doğrulamasında aynı modül kullanılır.

Başlangıç değerleri M1'de elle denenip ayarlanacak. Kabul ölçütü sayılar değil his: "duvardan duvara iki kez koşup 4–6 kat atlayabiliyorum."

### 3.2 Kule

- Mantıksal kule genişliği 600 birim, kat aralığı sabit (yaklaşık 80 birim).
- `tower.js` içinde, tohumlu PRNG (mulberry32) ile `floor(i) → {x, width, zone}` üretilir. Kule tembel üretilir: yalnız görünen katlar hesaplanır, sonsuz dizi tutulmaz.
- Her 100 katta bir **bölge** değişir (buz, taş, kristal…). Basamaklar daralır ve her bölge kendi renk paletini getirir. 0. kat duvardan duvara uzanan zemindir.
- Her 50 katta bir duvardan duvara uzanan bir "dinlenme katı" bulunur. Görsel kilometre taşıdır, hayaletlerin konumunu okumayı da kolaylaştırır.

### 3.3 Ekran kayması ve eleme

- Geri sayım bittikten sonra herkes 3 saniye serbest tırmanır, ardından ekran kaymaya başlar.
- Kayma hızı maç saatine bağlıdır ve her 30 saniyede bir kademe artar. Her artıştan önce 2 saniyelik "Hızlanıyor!" uyarısı gösterilir.
- Oyuncu ekranın üst %25'lik bölümüne çıkarsa kamera onu takip ederek yukarı kayar. Hızlı oyuncu ekranını kendi yukarı taşır.
- Oyuncu kameranın alt kenarının altına düşerse elenir. Bundan sonra izleyici olur: ok tuşlarıyla hayatta kalan oyuncular arasında gezinir, varsayılan olarak lideri izler.

### 3.4 Puan ve kombo

- **Kombo:** Arka arkaya en az 2 kat atlayan zıplamalar zinciridir. Tek katlık bir zıplama, aynı kata iniş veya 3 saniyelik kombo süresinin dolması zinciri bitirir. Zincir en az 2 zıplama ve toplam en az 4 kattan oluşuyorsa geçerli kombo sayılır.
- **Maç puanı:** `en yüksek kat × 10 + Σ(geçerli kombo kat sayısı²)`. Bu, Icy Tower'ın puanlama mantığıdır.
- **Maç sıralaması:** önce eleme sırası (son kalan birinci), eşitlikte en yüksek kat, sonra puan.
- Bitiş ekranında podyum ve şu ödüller gösterilir: "En uzun kombo", "En yüksek kat", "Sabotaj ustası", "Kıl payı" (kameranın altına en çok yaklaşıp kurtulan).

### 3.5 Sabotaj

- Toplamı **10 kat veya daha fazla** olan her geçerli kombo 1 sabotaj hakkı kazandırır. En fazla 2 hak birikebilir.
- Hakkın türü, kazanıldığı anda rastgele belirlenir ve HUD'da görünür. Bu belirsizlik bilinçli bir tercih: oyuncu "hangisini seçsem" diye düşünmekle vakit kaybetmez.
- **E** tuşu hakkı **lidere** gönderir: kat olarak en yüksekteki hayatta kalan rakip. Lider sensen sabotaj ikinci sıradaki oyuncuya gider. Hedef seçimi yoktur; böylece geride kalanlar öndekini yavaşlatır.

| Sabotaj | Etki | Süre |
|---|---|---|
| Buzlanma | Hedefin sürtünmesi neredeyse sıfıra iner, durmak ve yön değiştirmek zorlaşır. | 4 sn |
| Rüzgâr | Hedefe rastgele yönde, sabit bir yatay itki uygulanır. | 3 sn |
| Sis | Hedefin ekranının üst %60'ı kararır, yukarıdaki basamaklar görünmez. | 3 sn |

**Adalet kuralları:**
- İlk 10 saniyede sabotaj yapılamaz.
- Sabotaj yiyen oyuncu 6 saniye boyunca yeni sabotaja karşı korunur. Korunan oyuncuyu hedeflersen hakkın harcanmaz (Ateş Köprüsü'ndeki kalkan kuralı gibi).
- Elenmiş oyuncu hedef alınamaz.
- Sabotajlar odadaki herkese duyurulur ("Ada → Can: Buzlanma!").
- **Hiçbir sabotaj kameranın kayma hızını değiştirmez.** Eleme yalnızca kişinin kendi hareketine bağlı kalır. Sunucu, oyuncuları sabotaj yüzünden doğrudan öldürmez.
- Oda sahibi sabotajı kapatabilir. Kapalıyken oyun saf bir yarışa döner.

## 4. Ağ modeli

Platform oyunu, hassas zıplama gerektirdiği için 50–150 ms gecikmeyi kaldıramaz. Sunucu otoriteli fizik + istemci tahmini + uzlaştırma ise bu oyun için gereğinden karmaşık. Bu yüzden şu model öneriliyor:

**Kendi karakterinin fiziğini istemci simüle eder. Kuleyi, saati, kombo/sabotaj haklarını ve elemeyi sunucu yönetir.**

```
İstemci (60 Hz fizik, kendi karakteri)
  │  move: {seq, t, x, y, vx, vy, floor, pose}  ~20 Hz, güvenilir değil (volatile)
  ▼
Sunucu adaptörü (50 ms tick)
  ├─ makullük denetimi (ortak physics.js sınırlarıyla)
  ├─ iniş katlarından kombo ve sabotaj hakkı hesabı
  ├─ oyuncu başına kamera simülasyonu → eleme
  └─ state: herkesin son konumu  ~20 Hz (volatile)
  ▼
Diğer istemciler: hayaletleri ~100 ms geriden ara değerleyerek çizer
```

### 4.1 Saat

`view` paketi `serverNow`, `startedAt` ve `seed` alanlarını taşır. İstemci, Kör Atış'taki gibi `offset = serverNow - Date.now()` ile saatini eşitler. Kayma hızı `elapsed = now + offset - startedAt` ile hesaplanır. Böylece istemci ve sunucu aynı hız eğrisini kullanır.

### 4.2 Eleme

- İstemci düştüğünü anında gösterir ve `fell` komutunu gönderir. Sunucu bunu doğrudan kabul eder: insanın kendi aleyhine hile yapma sebebi yok.
- Sunucu da her oyuncu için kamerayı simüle eder: `cam = max(cam + speed(t)·dt, reportedY − pushMargin)`. Oyuncunun son bildirdiği konum **600 ms boyunca** kameranın altında kalırsa sunucu oyuncuyu eler. Bu tolerans gecikmeyi karşılar, `fell` göndermeyen bozuk ya da hileli bir istemciyi de yakalar.
- 3 saniye boyunca hiç `move` paketi gelmezse oyuncu "Bağlantı koptu" gerekçesiyle elenir. Arka plana alınan sekme de bu kapsama girer.
- Platform, oyuncu sekmeyi kapatınca `removePlayer` çağırır ve oyuncu elenmiş sayılır.

### 4.3 Makullük denetimi (hileye karşı, dürüst sınırlar)

Paylaşılan `physics.js`, sınır değerlerini (`MAX_VX`, `MAX_VY`, kat başına en büyük zıplama) dışa açar. Sunucu her pakette şunları denetler:
- `seq` artan olmalı. Eski paketler atılır.
- `x` duvarlar arasında kalmalı, hızlar sınırı %5'ten fazla aşmamalı.
- İki paket arasındaki yükseklik artışı, geçen süreye göre fiziksel olarak mümkün olmalı.
- Bildirilen iniş katı kulede gerçekten var olmalı ve `y` değeri o katın hizasına uymalı.

İhlal eden paket yok sayılır ve oyuncuya bir "uyarı" yazılır. 10 saniye içinde 5 uyarı birikirse oyuncu "Senkron hatası" ile elenir. Bu denetim kaba hileyi engeller ama bir arkadaş oyunu için yeterli olacak şekilde tasarlandı: sabotaj etkisini yok sayan bir istemciyi yakalayamaz. Belgede ve README'de bu sınır açıkça yazılacak.

### 4.4 Gizlilik

Bu oyunda gizli bilgi yok. Herkes herkesin konumunu görür ve kule tohumu herkese açıktır. `view` yine de kişiye özel üretilir: oyuncunun kendi sabotaj hakları ve hedefi yalnız ona gider.

### 4.5 Bant genişliği

`move` paketi yaklaşık 60 bayt × 20 Hz. `state` paketi 12 oyuncuda yaklaşık 1 KiB × 20 Hz. Kişi başına aşağı yönde yaklaşık 20 KiB/sn. Bu, Nesne Avı'nın 50 ms'lik tam durum yayınından hafif. Delta protokolüne ilk sürümde gerek yok.

## 5. Oda akışı ve fazlar

`lobby` → `countdown` (3 sn) → `play` → `end` (podyum) → `lobby`

| Faz | Davranış |
|---|---|
| `lobby` | Oyuncular karakter seçer. Oda sahibi ayarları değiştirir ve "Başlat" der (Kör Atış'taki gibi). Tick yok (`tickInterval: 0`). |
| `countdown` | Kule tohumu ve `startedAt` belirlenir. İstemciler kuleyi önceden üretir. |
| `play` | 50 ms tick. Maç sürerken katılan oyuncu izleyici olarak bekler (`waiting`, Nesne Avı'ndaki gibi). Sonraki maça otomatik dahil olur. |
| `end` | Podyum ve ödüller gösterilir, kalıcı puanlar yazılır. Oda sahibi yeni maç başlatabilir. Tick yok. |

**Oda sahibi ayarları:**
- Hız profili: Sakin / Normal / Çılgın.
- Sabotaj: Açık / Kapalı.
- Başlangıç bölgesi: zor bölgeden başlayarak deneyimli gruplar için maçı kısaltma seçeneği.

**Lobi özeti:** `summary` yalnızca `lobby`, `play` ve `end` fazlarını döndürür. Böylece [lobby.js](../public/platform/lobby.js) içindeki faz etiketleri değişmeden çalışır.

## 6. Kalıcı rekorlar

Mevcut [scores.js](../server/platform/scores.js) defterinin alanları yeni bir şema gerektirmeden şöyle eşlenir (maç sonunda oyuncu başına bir olay yazılır):

| Defter alanı | Buz Kulesi anlamı |
|---|---|
| `points` → `total` | Maç puanı (tüm zamanların toplamı) |
| `score` → `best` | Maç puanı (en iyi tek maç; asıl rekor) |
| `streak` → `streak` | En uzun kombo (kat) |
| `correct` | Kazanılan maç sayısı (kazanınca 1) |
| `answered` | Oynanan maç sayısı (1); liderlik tablosu filtresi için de gerekli |
| `completed` olayı → `played` | Tamamlanan maç |

**Platformda gereken küçük değişiklik:** Liderlik tablosu şu an `total` değerine göre sıralıyor. Bu oyun için asıl rekor `best`. Manifest'e isteğe bağlı bir `rankBy: 'best'` alanı eklenecek ve [scores.js](../server/platform/scores.js) içindeki `leaderboard` bu alana göre sıralayacak. Değişiklik geriye uyumlu: alanı olmayan oyunlar bugünkü gibi `total`'a göre sıralanmaya devam eder. Bunun için bir platform testi eklenecek.

Ek olarak "en yüksek kat" ayrı bir rekor olarak isteniyorsa defter şemasına `peak` alanı eklenmesi gerekir. İlk sürümde maç puanı zaten katı içerdiği için bu değişikliğe girilmiyor.

İstemci, Ateş Köprüsü'ndeki gibi önce `/api/player` isteğini gönderir, ardından soketi bağlar. Böylece profil çerezi oluşmadan bağlantı kurulmaz.

## 7. Karakterler

- 6 karakter, Canvas'ta prosedürel çizilir; harici görsel yok. Her biri bir renk paleti ve bir aksesuardan oluşur: bere, atkı, kask, kulaklık, taç, gözlük.
- Animasyonlar: koşma, zıplama, süper zıplamada dönme, düşme ve sabotaj yeme (buzlanma parıltısı, rüzgâr çizgileri).
- Seçim lobide yapılır ve `character` komutuyla gönderilir. Aynı karakteri birden fazla oyuncu seçebilir.
- Hayaletler %45 opaklıkta çizilir, üstlerinde isim etiketi bulunur. Oyuncunun kendi karakteri tam opak ve ince bir dış çizgiyle vurgulanır.
- Seçim tarayıcıda `bimola-buz-kulesi-character` anahtarıyla hatırlanır. Ad paylaşımı mevcut `profile.js` üzerinden yapılır.

## 8. "Birbirimizi görmek": ekran dışındaki oyuncular

Ayrı kameralar yüzünden oyuncular çoğu zaman aynı ekranda olmayacak. Bunu üç araçla çözüyoruz:

1. **Yükseklik çubuğu:** Sağ kenarda dikey bir şerit. Her oyuncu kendi rengiyle bir nokta olarak görünür, elenenler gri bir çarpı ile işaretlenir. Kat numaraları da şeritte yer alır.
2. **Kenar okları:** Ekranın hemen üstündeki ya da altındaki oyuncular için üst/alt kenarda isim ve kat farkını gösteren bir ok çıkar ("Ada ▲ +7").
3. **Akış:** Kombolar, sabotajlar ve elemeler kısa bir olay listesinde duyurulur.

## 9. Dosya yapısı

```
server/games/buz-kulesi/
  adapter.js        platform sözleşmesi
  game.js           fazlar, kamera simülasyonu, eleme, kombo, sabotaj, view
public/games/buz-kulesi/
  index.html, style.css, cover.svg
  app.js            soket, ekranlar (lobi/oyun/podyum), yaşam döngüsü
  physics.js        ortak: sabit adımlı hareket + sınır sabitleri   (DOM/Node yok)
  tower.js          ortak: tohumlu kule üretimi                     (DOM/Node yok)
  rules.js          ortak: kayma hızı eğrisi, kombo kuralı, sabotaj tanımları
  render.js         Canvas çizimi: kule, karakterler, hayaletler, HUD, efektler
  characters.js     karakter tanımları ve prosedürel çizim
  input.js          klavye durumu, odak kaybında tuşları bırakma
  audio.js          WebAudio sentezi (zıplama, kombo, sabotaj, eleme)
test/
  buz-kulesi-physics.test.js
  buz-kulesi-tower.test.js
  buz-kulesi.test.js        oda, eleme, kombo, sabotaj, yetki
  buz-kulesi-network.test.js gerçek socket.io-client ile iki oyuncu
docs/BUZ-KULESI.md          güncel kurallar (plan bitince)
```

Platformda değişecek dosyalar:
- [registry.js](../server/games/registry.js): katalog kaydı.
- `scores.js` + `server.js`: `rankBy` desteği.
- [README.md](../README.md): oyun listesi.

Lobi ve diğer oyunlar değişmez.

## 10. Adaptör taslağı

```js
export const adapter = {
  snapshotInterval: 50,
  create: ({code, host}) => createRoom({code, host}),
  members,                                    // insanlar
  canJoin,                                    // kapasite; maç sürüyorsa izleyici olarak kabul
  addPlayer, removePlayer, summary, view,
  takeScores: room => room.scoreEvents.splice(0),
  tickInterval: room => ['countdown', 'play'].includes(room.phase) ? 50 : 0,
  tick: (room, now, dt) => tick(room, now, dt),  // {changed, events}
  commands: {
    character: {interval: 200, publish: true,  handle: setCharacter},
    settings:  {interval: 200, publish: true,  handle: configure},   // yalnız oda sahibi
    start:     {interval: 500, publish: true,  handle: start},       // yalnız oda sahibi
    move:      {interval: 30,                  handle: move},        // yayın yok, tick'te toplanır
    fell:      {interval: 200, publish: true,  handle: fell},
    sabotage:  {interval: 300, publish: true,  handle: sabotage},
  },
};
```

## 11. Aşamalar

| Aşama | Kapsam | Bitti sayılması için |
|---|---|---|
| **M1 — Tek kişilik çekirdek** | `physics.js`, `tower.js`, `rules.js`, `render.js`, `input.js`. Ayrı bir yerel mod yerine tek kişilik oda kullanılır: tek oyuncu başlatıp kendi başına tırmanabilir. | Elle oynayınca Icy Tower hissi var. Fizik ve kule determinizm testleri geçiyor (aynı girdi/tohum → aynı sonuç). |
| **M2 — Platform ve çok oyunculu** | Adaptör, `game.js`, lobi/geri sayım/podyum ekranları, `move` akışı, hayaletler ve ara değerleme, sunucu kamerası, eleme, izleyici modu, yükseklik çubuğu. | İki tarayıcıda birbirini görerek oynanıyor, son kalan kazanıyor. Ağ testleri geçiyor. |
| **M3 — Sabotaj** | Kombo → hak, hedefleme, üç etki, koruma ve duyurular. | Kurallar testlerle korunuyor, iki tarayıcıda etkiler doğru kişide görünüyor. |
| **M4 — Karakter ve rekorlar** | 6 karakter, `takeScores`, `rankBy`, tüm zamanlar tablosu. | Yeniden başlatmadan sonra rekor korunuyor, liderlik `best`'e göre sıralanıyor. |
| **M5 — Cila** | Ses, kapak görseli, bölge paletleri, ödüller, belgeler, README. | `npm test` yeşil, lobi bütçesi korunuyor, tarayıcıda gir → oyna → lobiye dön → başka oyuna gir akışı kontrol edildi. |

## 12. Test planı

- **Fizik:** Duvar sekmesi hızı korumalı. Zıplama yüksekliği yatay hızla monoton artmalı. Tek yönlü basamaklardan alttan geçilmeli. Sabit adım deterministik olmalı.
- **Kule:** Aynı tohum aynı katları üretmeli. Bölge sınırlarında genişlik kuralları uygulanmalı. Her basamak bir öncekinden ulaşılabilir olmalı: azami zıplama ve yatay erişim ile kontrol edilir. **En kritik test budur:** imkânsız bir kule, oyunu oynanmaz hale getirir.
- **Kombo:** Zincir başlama ve bitme koşulları, puan formülü ve sabotaj hakkı eşiği.
- **Eleme:** `fell` komutu, 600 ms tolerans, 3 sn sessizlik, sekme kapanması. Son kalan ve eşzamanlı düşmede kat eşitliği bozma kuralı.
- **Makullük:** İmkânsız sıçrama, duvar dışı konum ve eski `seq` reddedilmeli. Uyarı birikiminde eleme olmalı.
- **Sabotaj:** İlk 10 sn kilidi, koruma süresi, korunan hedefte hakkın harcanmaması, elenmiş hedef, kapalı ayar, yetkisiz komut.
- **Platform:** Katılma/ayrılma, doluluk, maç sırasında izleyici olarak katılma, oda sahibi devri, son oyuncuda odanın temizlenmesi, `takeScores` ile defter kaydı, `rankBy` sıralaması.
- **Ağ:** İki `socket.io-client` ile tam bir maç: başlat → hareket → biri düşer → `end`.

## 13. Riskler ve açık sorular

- **His en büyük risk.** Icy Tower'ı Icy Tower yapan şey ivme, sürtünme ve zıplama eğrisinin ince ayarı. M1'i ağdan bağımsız tutmamızın sebebi bu: sabitleri yerel modda hızlıca deneyebilmek.
- **Gecikme ve eleme:** 600 ms tolerans yüksek gecikmeli oyuncuda haksız eleme ile hileye tolerans arasında bir denge. Gerçek ağda ölçülüp ayarlanmalı.
- **Arka plana alınan sekme** oyuncunun düşmesi demek. Bu, oyunun doğası gereği kabul edilmiş bir davranış ve lobide tek satırla belirtilecek.
- **Sabotaj dengesi:** 10 katlık eşik ve sürelerin oyun testiyle ayarlanması gerekiyor.
- **Karara bağlananlar:** Ad Buz Kulesi. Sabotaj hedefi lider. Dokunmatik kontrol sonraki sürümde.
- **Uygulamada verilen karar:** Son rakip de düştüğünde kalan oyuncu kazanan ilan edilir, ama rekor için düşene kadar tırmanmaya devam edebilir. Diğerleri onu izler. Kayma sürekli hızlandığı için bu tur kendiliğinden biter.
