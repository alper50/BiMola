# Buz Kulesi

Icy Tower'dan esinlenen, çok oyunculu 2D kule tırmanma oyunu. 1–12 kişi, klavye. Giriş: `/games/buz-kulesi/`. Ürün kararları ve aşamalar: [BUZ-KULESI-PLAN.md](BUZ-KULESI-PLAN.md).

## Kurallar

- ←/→ veya A/D ile koş, Space (↑/W) ile zıpla. Space basılı tutulursa her inişte yeniden zıplanır.
- Zıplama hızı yatay hıza bağlıdır: durarak yaklaşık 1,3 kat, tam hızda yaklaşık 6 kat. Duvara çarpan oyuncu hızının %92'siyle geri seker.
- Basamaklar tek yönlüdür: alttan geçilir, düşerken üstüne basılır. Her 50 katta bir tam genişlikte dinlenme katı vardır. Her 100 katta bölge değişir (Buz → Taş → Kristal → Lav → Gökyüzü) ve basamaklar daralır.
- Ekran 3 saniye sonra kaymaya başlar ve her 30 saniyede hızlanır (Sakin / Normal / Çılgın). Ekranın üst %38'ine çıkan oyuncu kamerayı yukarı iter. Kamera hiç aşağı inmez: ekranın altında kalan düşer.
- **Kombo:** her biri en az 2 kat atlayan zıplamalar, inişler arasında en fazla 3 saniyeyle arka arkaya yapılır. En az 2 zıplama ve toplam 4 kat geçerlidir ve kat² puan verir. **Puan** = en yüksek kat × 10 + kombo puanları.
- **Sabotaj:** 10 kat ve üstü her kombo, rastgele türde 1 hak verir (en fazla 2). E hakkı lidere gönderir; lider sensen ikinci sıradakine gider. Etkiler: Buzlanma 4 sn (zemin sürtünmesi neredeyse sıfır), Rüzgâr 3 sn (yatay itki, karşı yöne koşarak yenilir), Sis 3 sn (ekranın üst %60'ı kapanır). İlk 10 saniyede sabotaj yok. Sabotaj yiyen oyuncu 6 saniye korunur; korunan hedefe gönderilen hak harcanmaz. Hiçbir sabotaj kameranın kayma hızını değiştirmez. Oda sahibi sabotajı kapatabilir.
- Son rakip düşünce kalan oyuncu kazanır ve rekor için düşene kadar tırmanmaya devam eder. Sıralama: geç elenen önde; aynı anda düşenlerde yüksek kat, sonra puan.
- Maç sürerken katılan oyuncu izler ve sonraki maça dahil olur. Elenen veya bekleyen oyuncu ←/→ ile izlenen tırmanıcıyı değiştirir.
- Ödüller: En uzun kombo, En yüksek kat, Sabotaj ustası, Kıl payı. Kıl payı yalnız kameranın altına 60 birimden fazla yaklaşıp **kurtulan** oyuncuya verilir.

## Mimari

| Dosya | Görev |
|---|---|
| `public/games/buz-kulesi/physics.js` | Ortak, sabit 60 Hz adımlı hareket. Sınır sabitleri (`MAX_JUMP_VY`, `MAX_JUMP_HEIGHT`) sunucu denetiminde de kullanılır. |
| `public/games/buz-kulesi/tower.js` | Tohumlu (mulberry32) tembel kule üretimi. Ardışık basamaklar arasındaki yatay boşluk en fazla 150 birim. |
| `public/games/buz-kulesi/rules.js` | Kayma eğrisi, kamera, kombo, sabotaj tanımları ve sıralama. |
| `public/games/buz-kulesi/app.js` | Yerel simülasyon, 20 Hz hareket gönderimi, hayalet ara değerleme, izleyici kamerası, HUD, panel ve rekorlar. |
| `public/games/buz-kulesi/render.js`, `characters.js` | Canvas çizimi. Karakterler ortak BiMola karakteridir ([mimari](ARCHITECTURE.md#bimola-karakteri)); `characters.js` platform katalogunu ve 2D figürü yeniden dışa açar. |
| `server/games/buz-kulesi/game.js` | Fazlar, oyuncu başına kamera simülasyonu, eleme, kombo, sabotaj, makullük denetimi ve kişiye özel görünüm. |

**Ağ modeli.** Tarayıcı kendi tırmanıcısının fiziğini çalıştırır ve sunucuya yaklaşık 20 Hz'de `move` paketi gönderir. Paket konum, hız, poz ve son 8 inişten oluşur (`[kimlik, kat, zaman]`). Diğer oyuncular 50 ms aralıklı durum paketlerinden yaklaşık 100 ms geriden ara değerlenerek çizilir. Kuleyi, saati, komboları, sabotaj haklarını ve elemeyi sunucu yönetir. Sabitler ve kurallar istemciyle sunucu arasında ortaktır; böylece iki taraf aynı kamera eğrisini hesaplar.

**Eleme.** İstemci düştüğünü anında `fell` ile bildirir. Sunucu da kamerayı her oyuncu için simüle eder ve bildirilen konum 600 ms boyunca kameranın altında kalırsa oyuncuyu eler. 3 saniye hareket paketi gelmeyen oyuncu da elenir; arka plana alınan sekme bu kapsama girer.

**Makullük denetimi.** Sunucu şunları reddeder:
- Duvar dışı konum ve sınır üstü hız.
- Son inişten zıplanabilecek yükseklikten daha yüksek konum.
- Havada "duruyor" pozu.
- Bir zıplamada 6 kattan fazla tırmanış.
- Fiziksel en kısa uçuştan daha hızlı tırmanış.
- Sunucu saatinin ilerisinde iniş zamanı.

Reddedilen iniş kalıcı olarak atlanır; böylece yeniden gönderilen geçmiş bir daha ceza yazmaz. 10 saniye içinde 5 ihlal biriken oyuncu bir sonraki tick'te "senkron hatası" ile elenir. Testler, gerçek fizikle oynayan bir istemcinin iki farklı oyun tarzında hiç reddedilmediğini doğrular.

**Dürüst sınırlar.** Denetim kaba hileyi durdurur ama sabotaj etkisini yok sayan ya da kusursuz girdi üreten bir istemciyi yakalayamaz; bir arkadaş oyunu için kabul edildi. Sunucu tarayıcıdan gelen zaman damgalarını yalnız sınırlı biçimde doğrular.

## Kalıcı rekorlar

Maç sonunda her oyuncu için defter kaydı yazılır:

| Defter alanı | Değer |
|---|---|
| `points`, `score` | Maç puanı |
| `streak` | En iyi kombo (kat) |
| `correct` | Galibiyet (1/0; antrenmanda 0) |
| `answered` | 1 |
| `completed` | Tamamlanan maç |

Manifestteki `rankBy: 'best'` alanı sayesinde tüm zamanlar tablosu toplam puana göre değil, tek maçtaki en yüksek puana göre sıralanır.

## Doğrulama

- `test/buz-kulesi-physics.test.js`: kule determinizmi; 3 tohum × 2 bölge × 320 katta her basamağın gerçek fizikle ulaşılabilirliği; duvar sekmesi; tek yönlü basamaklar; buz ve rüzgâr.
- `test/buz-kulesi.test.js`: fazlar, yetkiler, kayma eğrisi, eleme, kombo, sabotaj, hile denetimi, dürüst istemci, ayrılma, ödüller ve `rankBy`.
- `test/buz-kulesi-network.test.js`: gerçek Socket.IO istemcileri ve çerezlerle tam iki oyunculu maç ve rekor tablosu.

Tarayıcı denetimi başsız Chrome ile yapıldı: iki oyuncu, lobi, geri sayım, tırmanış, izleme, sonuç ekranı ve üç sabotaj efekti; konsol hatası yok. Gerçek ağ gecikmesi altında uzun insan maçları ve oyun hissinin (ivme, zıplama, kayma hızı) elle ince ayarı henüz yapılmadı.
