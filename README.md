# Garticphone Katman & Çizim (v2.1, Garthic teması)

## Kurulum / güncelleme
1. Bu klasördeki dosyaları `GarthicProject\extension` içine kopyala (üstüne yaz). `icons` klasörü ve `logo.svg`, `background.js` yeni.
2. `chrome://extensions` -> Geliştirici modu açık -> eklentideki **yenile** ikonuna bas.
   - Yeni "debugger" izni için Chrome izin isteyebilir; onayla.
3. Gartic sekmesini **F5** ile yenile.

## Ne değişti
- **Çizim düzeltmesi:** Oyun sahte (script'ten gelen) fare olaylarını yok sayıyorsa, 5. yöntem olan **güvenilir (debugger)** gerçek fare girdisi gönderir. Test çizgisi önce 4 yöntemi dener, hiçbiri çalışmazsa kendisi 5'e geçer.
  - Bu yöntem kullanılırken Chrome üstte "hata ayıklanıyor" çubuğu gösterir; bu normal. İşlem bitince birkaç saniye sonra kendiliğinden kapanır.
  - Çizim sırasında fareye dokunma; panel çizim alanının üstündeyse paneli kenara sürükle. Durdurmak için **Alt+S**.
- **Simetri (mirror):** Yeni **Simetri** sekmesi. Açıkken sen çizgiyi bitirince aynası eksenin öbür tarafına çizilir.
  Eksen: sol-sağ, üst-alt veya 4 yön. Eksen çizgisi sarı kesikli çizgiyle gösterilir. **Alt+M** ile aç/kapat. Her açılışta kapalı başlar.
- **Garthic teması:** Logo başlıkta, renkler logodan (#31024f mor), kalın "tuş" gibi düğmeler, sarı ana düğme, yeşil aktif düğme.

## İlk kurulum sırası
1. Çizim ekranında **Çizim** sekmesi -> **Test çizgisi**. Çalışan yöntemi kendisi bulur.
2. (İsteğe bağlı) **Fırçaları ölç**, sonra oyunda ölçüm çizgilerini geri al.
3. **Katman** sekmesinde görseli yükle, konumlandır, **Çizim** sekmesinde **Çiz**.

## Kısayollar
Alt+O katmanı göster/gizle, Alt+P paneli küçült, Alt+M simetri, Alt+S çizimi durdur.

Sorun olursa **Rapor** düğmesi çıktıyı panoya kopyalar.
