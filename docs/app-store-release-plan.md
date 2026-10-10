# Arcelira — App Store yayın planı

Hazırlık tarihi: 9 Ekim 2026; son ilerleme: 10 Ekim 2026. Bu dosya bir yayın kontrol listesidir. İmzasız Simulator derlemesi aşağıda doğrulandı; cihaz testi veya Apple'a yükleme tamamlanmış değildir.

Son bulut doğrulaması: [iOS build and TestFlight #2](https://github.com/Cerdukay/daydial-clock/actions/runs/38052123639), 10 Ekim 2026, kaynak `b5e0f20`, `mode=verify` **başarılı**. 195 birim testi, 2 Capacitor SPA tarayıcı testi, TypeScript ve lint geçti (0 hata, 12 mevcut Fast Refresh uyarısı). Xcode 26.3 / iOS SDK 26.2 ile gerçek, imzasız iOS Simulator Release derlemesi `BUILD SUCCEEDED` verdi. İlk kontroldeki eksik `public override` bildirimi düzeltildi. Bu, simülatörün çalıştırıldığı veya gerçek cihazda alarmın çaldığı anlamına gelmez. İmzalama, TestFlight ve gerçek iPhone alarm teslimi **henüz doğrulanmadı**.

## Kararlaştırılan yol

- Apple Developer üyeliğinin aktif olduğu ve App Store Connect erişimi 10 Ekim 2026'da hesap ekranından doğrulandı. Apple Team ID: `X745NUQSB4`.
- Test cihazı iPhone 12; kullanıcı tarafından bildirilen iOS sürümü **27.0.1**.
- Kullanıcının iki kayıt için verdiği açık onayla 10 Ekim 2026'da **Arcelira / `com.daydial.app` (Explicit)** Apple Developer kimliği ve iOS App Store Connect kaydı oluşturuldu. Apple ID: **`6821199344`**; durum **1.0 Prepare for Submission**. Bu kayıt oluşturma işlemi uygulamayı yayımlamaz veya TestFlight build'i yüklemez.
- Kullanıcı tercihi: normal bildirim + iOS 26+ üzerinde AlarmKit ile gerçek alarm. Daha eski iOS'ta alarm izni/seçimi desteklenmez; standart bildirim kullanılabilir.
- Yerel Mac/Xcode erişimi yok. iOS derlemesi GitHub Actions macOS ortamında yapılacak.
- Akış: kaynak hazırlığı → bulutta derleme kontrolü → imzalı IPA → TestFlight → iPhone 12 kabul testi → App Review → yayın.
- Yeni workflow yalnızca `workflow_dispatch` ile elle çalışır. Push, pull request ve cron tetikleyicisi yoktur.
- GitHub'ın özel depolar için macOS runner kullanımını ücretlendirmesi mümkündür. İlk çalıştırmadan önce mevcut Actions kotası ve harcama limiti kontrol edilir; bu hazırlık herhangi bir ücretli hizmet satın almaz.

## 1. iOS kaynak hazırlığı

- [x] Capacitor 8.5.0 ile eşleşen `@capacitor/ios` ve Swift Package Manager projesi.
- [x] Uygulama adı Arcelira; onaylanan görselden 1024 × 1024, opak uygulama ikonu.
- [x] UserDefaults kullanımı için `PrivacyInfo.xcprivacy` ve gerekli neden bildirimi.
- [x] iOS bildirim sunumu, sistem bildirim sesi ve en yakın 64 standart bildirim kuyruğu için kod hazırlığı.
- [x] AlarmKit native köprüsü, ayrı alarm izni, kalıcı alarm kimlikleri ve en yakın 64 alarm kuyruğu için kod hazırlığı (Swift derlemesi geçti; cihaz doğrulaması bekliyor).
- [x] Birim testleri (195 geçti), TypeScript kontrolü, lint (0 hata, 12 mevcut geliştirme uyarısı) ve Capacitor web derlemesi/iOS asset eşitlemesi.
- [x] Bulut anahtarları olmadan gerçek Capacitor SPA girişinde ilk açılış, tek bildirim sunumu, saat biçimi ve etkinlik kalıcılığı (2 tarayıcı testi).
- [x] GitHub macOS runner'ında Xcode 26.3 ile iOS Simulator için gerçek Swift/Xcode Release derlemesi (`verify` #2 başarılı).

Native açılışta tek PlannerProvider kullanılır. Etkinlik değişikliğinde WebView cleanup'ı tüm OS alarmlarını silmez; girişli liste ağdan gelmeden boş listeyle alarm iptali yapılmaz. AlarmKit kayıtları sabit kimliklerle uzlaştırılır; durdurulan alarmın yeniden açılışta tekrar çalması önlenir. Bu davranışların native kısmı yine cihazda test edilmelidir.

Mevcut Capacitor `appId` değeri `com.daydial.app` olarak korunur. Bu bir teknik kimliktir; telefondaki ve mağazadaki görünen ad Arcelira'dır. Apple hesabında bu kimlik kullanılabiliyorsa aynı kimlikle kayıt açılır. Başka bir Bundle ID daha önce kaydedildiyse önce iOS hedefi ve profil bu kayıtla eşleştirilir; Android'in paket kimliği değiştirilmez.

Apple şu anda Xcode 26+ ve iOS 26 SDK+ ile üretilen yüklemeleri kabul ediyor. SDK gereksinimi cihazın en düşük iOS sürümünden farklıdır: Capacitor 8 tabanı iOS 15'tir. Alarm özelliği iOS 26+ gerektirir. Kilitli ekran/sessiz mod alarm testi kullanıcının iOS 27.0.1 olarak bildirdiği cihazda TestFlight ile yapılacak.

## 2. Apple hesabında hazırlanacak kayıtlar

Uygulama kaydı tamamlandı: platform **iOS**, ad **Arcelira**, birincil dil **English (U.S.)**, Bundle ID **com.daydial.app**, dahili SKU **ARCELIRA-IOS-001**, Apple ID **6821199344**. [App Store Connect kaydı](https://appstoreconnect.apple.com/apps/6821199344/distribution/info). Apple'ın başlangıç sürümü **1.0**; workflow'un varsayılan yükleme sürümü de **1.0** olarak eşleştirildi. Arşiv sırasında `MARKETING_VERSION` bu input ile ayarlanır. `daydial` teknik kimliği, mağazadaki/telefondaki uygulama adı anlamına gelmez.

10 Ekim kayıt doğrulaması: Developer kimlik listesinde **Arcelira / com.daydial.app** görüldü; App Store Connect App Information ekranında ad, Bundle ID, dil, SKU ve Apple ID doğrulandı. Kanıtlar: `qa/ios/arcelira-bundle-id-created.png`, `qa/ios/arcelira-app-record-created.png`. Henüz IPA, TestFlight veya App Review gönderimi yok.

İmzalama hazırlığı 10 Ekim 2026'da kullanıcının açık onayıyla tamamlandı:

- **Arcelira TestFlight / Developer** takım API anahtarı oluşturuldu (Key ID `L6U23LZN8G`); özel `.p8` dosyası indirildi. Apple takım API anahtarları yalnızca bir uygulamaya sınırlandırılamaz; Developer rolü tüm uygulamalara uygulanır. Mevcut Admin anahtarına erişilmedi veya değiştirilmedi.
- Yeni **Apple Distribution** sertifikası oluşturuldu (portal ID `JLBMRCTB67`). Windows'ta şifreli RSA özel anahtar/CSR üretildi, Apple sertifikasının bu anahtarla ve Team ID ile eşleşmesi kontrol edildi, şifreli `.p12` dışa aktarıldı.
- **Arcelira App Store 2026** dağıtım profili oluşturuldu (portal ID `29UPS948H2`, UUID `afde1956-65de-476c-ad0d-2d5ad0a0921f`). CMS imzası, `X745NUQSB4.com.daydial.app`, App Store türü, Ekim 2027 geçerliliği ve yeni sertifikayla eşleşmesi yerelde doğrulandı.
- GitHub **Cerdukay/daydial-clock → ios-testflight** ortamına aşağıdaki altı secret kaydedildi; UI'da altı adın tamamı doğrulandı. Ortam yalnızca **`codex/arcelira-ios-release`** dalına sınırlandı. Bu dal `e639b4d` kaynak snapshot'ı ile gönderildi. Manuel reviewer koruması mevcut arayüzde sunulmadı; etkin olduğu iddia edilmez.
- Gizli yedekler Git tarafından yok sayılan `.apple-signing/arcelira/` klasöründe, yalnızca mevcut Windows kullanıcısı ve SYSTEM erişimiyle tutuluyor. Özel dağıtım anahtarı/P12 şifreli; parola DPAPI korumalıdır. Parola GitHub'a aktarılırken bellekte çözüldü, düz metin parola dosyası oluşturulmadı. `.p8` özel anahtarı bu erişim korumalı klasörde saklanır; paylaşılmaz/commit edilmez.

Kanıtlar: `qa/ios/arcelira-api-key-created.png`, `qa/ios/arcelira-certificate-created.png`, `qa/ios/arcelira-profile-created.png`, `qa/ios/arcelira-github-signing-secrets.png`. Mevcut sertifikalar/anahtarlar silinmedi, iptal edilmedi veya değiştirilmedi. **Bu hazırlık imzalı IPA üretildiği veya Apple'a yüklendiği anlamına gelmez.**

1. Developer hesabında **Certificates, Identifiers & Profiles → Identifiers** bölümünden kullanılacak Bundle ID'yi doğrula/kaydet.
2. **App Store Connect → My Apps → + → New App**: platform iOS, ad Arcelira, birincil dil, Bundle ID ve benzersiz dahili SKU. İlk iOS sürümü için `1.0.0` önerilir.
3. **Apple Distribution** sertifikası ve buna ait özel anahtarı içeren şifreli `.p12` dosyası hazırla. Yalnızca `.cer` dosyası imzalama için yeterli değildir. Windows'ta CSR/özel anahtar üretimi ve `.p12` birleştirme mümkündür; mevcut sertifikalar silinmez veya iptal edilmez.
4. Aynı Bundle ID ve dağıtım sertifikasına bağlı **App Store Connect dağıtım profili** (`.mobileprovision`) hazırla. TestFlight için cihaz UDID kaydı gerekmez.
5. App Store Connect **Users and Access → Integrations → App Store Connect API** altında yükleme yetkisi olan bir takım API anahtarı hazırla. `.p8` özel anahtarını yalnızca bir kez indirebildiğin için güvenli sakla. Team ID, Key ID ve Issuer ID birbirinden farklı alanlardır.
6. GitHub'da `ios-testflight` ortamı ve aşağıdaki sırları yapılandır. Parola/özel anahtarları sohbete veya Git'e yapıştırma.

| GitHub secret | İçerik |
| --- | --- |
| `IOS_DISTRIBUTION_P12_BASE64` | Özel anahtarı içeren şifreli `.p12` dosyasının Base64 değeri |
| `IOS_DISTRIBUTION_P12_PASSWORD` | `.p12` parolası |
| `IOS_APPSTORE_PROFILE_BASE64` | App Store Connect `.mobileprovision` dosyasının Base64 değeri |
| `ASC_KEY_ID` | App Store Connect takım API Key ID |
| `ASC_ISSUER_ID` | Aynı takım API anahtarının Issuer ID değeri |
| `ASC_PRIVATE_KEY` | İndirilen `.p8` dosyasının tam içeriği |

Team ID ve profil UUID'si profilin içinden okunur. Sertifika/profil dosyaları iş bitiminde silinen macOS runner'a yüklenir; build artifact'lerine dahil edilmez. Sırlar yalnızca doğrulama/imzalama adımlarına aktarılır; npm kurulumuna veya web derlemesine verilmez. `ios-testflight` ortamının güvenilen yayın dalı kısıtlaması eklendi. Manuel onay koruması plan/arayüz desteklerse ayrıca eklenmelidir.

## 3. Bulut derlemesi ve TestFlight

10 Ekim 2026 ilerleme: çalışma ağacı ve normal Git indeksi korunarak yalnızca iOS/ilgili uygulama kaynaklarından `origin/main` tabanlı ayrı snapshot oluşturuldu; Android, mağaza metadata, yerel araç ayarları, test çıktıları ve imzalama dosyaları gönderilmedi. Kaynak dalı **`codex/arcelira-ios-release`**, ilk kaynak commit'i **`e639b4d`**. Varsayılan dal için yalnızca workflow dosyasını içeren ayrı öneri **`codex/arcelira-ios-dispatch`**, commit **`1adb283`**; [PR #1](https://github.com/Cerdukay/daydial-clock/pull/1) kullanıcının birleştirme/ilk imzasız kontrol onayıyla **birleştirildi** (merge commit `8cd0324`). Önceki doğrudan `main` yazımı güvenlik denetimi tarafından engellendi; açık onay alınıp PR yolu kullanıldı. Mevcut `main` uygulama kodu değişmedi. Workflow yalnızca yayın dalı seçilirse iş çalıştırır; main seçilirse işler atlanır. Kanıt: `qa/ios/arcelira-ios-dispatch-merged.png`.

İlk çalıştırma öncesi GitHub hesabı UI kontrolü: **1.239,3 / 2.000 dahil Actions dakikası**, **0,2 / 0,5 GB depolama** kullanımı; yaklaşık **760,7 dahil dakika** kaldı. Actions bütçesi **$0**, **Stop usage: Yes**. Ücretli ayarlar değiştirilmedi. Kota hesap genelinde paylaşılır. İlk workflow `codex/arcelira-ios-release`, `mode=verify`, `version=1.0`, boş build-number input'u ile tetiklendi; bu kontrol Apple'a yükleme yapmaz.

İlk gerçek native derleme: macOS 15.7.9 / Xcode 26.3 / iOS SDK 26.2. Node kurulumu, Capacitor SPA derlemesi, SPM eşitlemesi ve paket çözümü geçti. `ArceliraAlarmPlugin.checkPermissions` ve `requestPermissions`, `CAPPlugin` üzerindeki açık metotları geçersiz kıldığı için `public override` gerektiriyordu; Swift derleyicisi dört erişim/override hatası bildirdi. Yalnızca bu iki bildirime düzeltme yapıldı. Tanı artifact'i: `ios-simulator-diagnostics-1`, artifact ID `11664641733`. TestFlight işi seçilmedi ve atlandı.

İkinci bulut kontrolü: düzeltme commit'i **`b5e0f20`**, aynı yayın dalı / `mode=verify` / `version=1.0`. [Run #2](https://github.com/Cerdukay/daydial-clock/actions/runs/38052123639) **Success**, toplam **3 dakika 46 saniye**. `checks` ve `verify` işleri geçti; native log **BUILD SUCCEEDED**. Tanı artifact'i `ios-simulator-diagnostics-2` (ID `11669731683`); simülatör `.app` artifact'i `Arcelira-simulator-2` (ID `11669926393`, yaklaşık 5,1 MB zip). Artifact'ler 7 gün saklanır. Simülatör çıktısı gerçek iPhone'a kurulamaz. TestFlight işi yine seçilmedi ve atlandı; Apple'a yükleme veya App Review gönderimi yapılmadı. Kanıt: `qa/ios/arcelira-ios-verification-passed.png`.

Sıradaki onaylı aşama: imzalı IPA oluşturma ve yalnızca TestFlight'a yükleme. Şu an GitHub istemci variables değerleri boş olduğundan test build'i **misafir modu** kapsamındadır; giriş/bulut senkronizasyonu doğrulanmış değildir. Bu geçici ilk test kapsamı, mağazaya çıkacak kalıcı özellik kararı değildir. Hesap sahibinden bu kapsamla TestFlight çalıştırması için onay alınıp ardından iPhone 12 kabul testine geçilir.

Bağımlılık yayın kontrolü: bulut `npm ci` raporu **25 uyarı (11 moderate, 10 high, 4 critical)** gösterdi. Bu sayılar çalışan uygulamanın aynı sayıda sömürülebilir açık taşıdığını tek başına kanıtlamaz; üretim/geliştirme kapsamı ve erişilebilirlik ayrıntıları yayın öncesi incelenmelidir. Ayrıntılı yerel `npm audit` sorgusu, bağımlılık metadata'sını npm kayıt defterine gönderdiği için otomatik onay denetimi tarafından engellendi; dış aktarım için kullanıcı onayı alınmadan başka yolla denenmez. `npm audit fix --force` veya geniş bağımlılık güncellemesi yapılmadı.

1. Hazırlanan iOS kaynaklarını ve gerekli son uygulama değişikliklerini ayrı bir yayın dalında gözden geçirip GitHub'a gönder. Mevcut `main` dalında tüm güncel yerel özellikler bulunmadığından yalnızca workflow'u göndermek yeterli değildir. Lovable ile paylaşılan yayın geçmişi yeniden yazılmaz.
2. GitHub'ın Run workflow düğmesi için workflow dosyasının varsayılan dalda da bulunması gerekir. Çalıştırırken güncel iOS yayın dalını seç.
3. İlk çalıştırma: **iOS build and TestFlight → Run workflow → mode: verify**. Bu mod Apple sırları olmadan uygulamayı iOS Simulator için derler. Simülatör `.app` çıktısı iPhone'a kurulamaz.
4. Kaynak doğrulandıktan ve imza sırları hazırlandıktan sonra aynı workflow'u **mode: testflight** ile elle çalıştır. Bu, dağıtım için imzalı IPA'yı App Store Connect'e yükler; uygulamayı App Review'a göndermez ve mağazada yayımlamaz.
5. Apple'ın build işlemesini tamamlamasını bekle. TestFlight iç test grubuna hesap sahibini/test kullanıcılarını ekle ve build'i gruba seç.
6. iPhone 12'ye TestFlight'ı App Store'dan kur ve daveti kabul et. İç test kullanıcıları App Store Connect kullanıcısıdır; dış test kullanıcıları için ilk build beta incelemesi gerektirebilir.

Her yüklemede build numarası artırılır; Android'in `versionCode` değeri iOS build numarasını belirlemez. Workflow bir build numarası üretir, ancak daha önce elle yüklenen daha yüksek numara varsa input ile daha yüksek değer girilir.

Bulut çalışma ortamında `.env` dosyası yoktur. Giriş/senkronizasyon isteniyorsa mevcut istemci yapılandırması GitHub repository **variables** ile sağlanmalıdır (`VITE_CLERK_PUBLISHABLE_KEY`, `VITE_NEON_DATA_API_URL` ve gereken Firebase `VITE_*` değerleri). Bunlar istemciye açık yapılandırma değerleridir. Sunucu `DATABASE_URL`, Clerk secret ve servis hesabı özel anahtarları `VITE_*` değişkenlerine konmaz. Değerler yoksa build mevcut misafir moduyla çalışır; bu yalnızca ilk cihaz testinin kapsamı olarak kaydedilir ve mağazada bulut senkronizasyonu vaat edilmez.

## 4. Yayından önce çözülmesi/doğrulanması gereken işlevler

| Konu | Mevcut kanıt | Yayın geçiş ölçütü |
| --- | --- | --- |
| Yerel bildirim | Android kanalları kullanılıyor; iOS sesi ayrıca verilmelidir | Arka planda ve kilitli ekranda gerçek iPhone'da teslim/ses/tıklama testi |
| Alarm | iOS 26+ AlarmKit köprüsü ve bağımsız izin akışı yazıldı; JS testleri ve Xcode Simulator derlemesi geçti, gerçek cihaz testi yapılmadı | Alarmı seçip izin verme; sessiz/Focus/kilitli ekranda çalma, durdurma, değiştirme/silme ve yeniden açınca tekrar çalmama testi |
| Sunucu push | iOS APNs token'ının yanlışlıkla Android/FCM olarak kaydedilmesi engellendi; iOS remote push yapılandırılmadı, worker durduruldu | APNs/FCM köprüsü ve aktif sunucu işi gerçek cihazda uçtan uca doğrulanır; aksi halde yalnızca cihazda planlanan yerel bildirim/alarm kapsamı |
| Giriş | Clerk bileşeni varsa hesap açılabiliyor; sosyal girişler Clerk paneline bağlı | iOS giriş/oturum devamı doğrulanır; sosyal giriş varsa Apple giriş kuralı kontrol edilir |
| Hesap silme | Gizlilik metni Ayarlar'dan silme vaat ediyor; Ayarlar'da bu eylem yok | Girişli sürümde hesap ve ilişkili veriler için uygulama içinden silme akışı uygulanır, test edilir |
| iCal dışa aktarma | Şu anda tarayıcı Blob/download kullanıyor | WKWebView'de Dosyalar/Paylaş üzerinden `.ics` dışa aktarma gerçek cihazda doğrulanır/gerekirse native paylaşım eklenir |
| Gizlilik/destek | Mevcut metin `daydial.app` alan adı ve eski destek e-postası kullanıyor | Çalışan genel HTTPS gizlilik/destek adresleri ve ulaşılabilir destek e-postası doğrulanır |
| SDK gizliliği | Preferences için UserDefaults neden bildirimi gerekir | Xcode archive privacy raporu ve gerçek SDK/veri akışına göre App Privacy beyanı tamamlanır |

Hesap silme veya platforma özgü özellikleri gizlemek, bulut senkronizasyonunu kaldırmak gibi kalıcı ürün kapsamı değişiklikleri ilk test build'i ile karıştırılmaz; App Store sürümünün kapsamı ayrıca kesinleştirilir.

## 5. iPhone 12 kabul testi

- [ ] İlk açılış: isim/ikon, 12/24 saat seçimi, dil ve tema.
- [ ] Saat üzerinde kaydırma; uzun basmayla düzenleme; kısa etkinliklerde başlık kısaltması.
- [ ] Etkinlik ekleme, değiştirme, tamamlama, silme; tekrarlayan etkinlik ve tek örnek değişikliği.
- [ ] Çentik/home indicator güvenli alanları; klavye açıkken form ve scroll.
- [ ] Misafir verisinin uygulamayı kapatıp açınca korunması; çevrimdışı kullanım.
- [ ] Bildirim izni verme/reddetme; Ayarlar'dan kapatıp açma.
- [ ] İki dakika sonraya hatırlatma: uygulama açık, arka planda, kilitli ve uçak modunda; bildirimden doğru etkinliğe dönüş.
- [ ] Sesli/sessiz tercihi; etkinlik silindiğinde eski bildirimin iptal edilmesi.
- [ ] Gerçek alarm: bildirim izni reddedilmişken alarm izniyle çalma; sessiz/Focus/kilitli ekranda çalma ve Stop; durdurduktan sonra yeniden açınca tekrar çalmama.
- [ ] Alarm izni reddetme/sonradan kapatma; hata mesajı ve standart bildirime geçiş; düzenleme/silme sonrası eski alarm iptali.
- [ ] 64'ten fazla hatırlatma; yakındaki etkinliklerin önceliği ve uygulamayı yeniden açınca kuyruk yenileme.
- [ ] Girişli yayın seçildiyse giriş/senkronizasyon/çıkış/hesap silme ve veri erişimi testi.
- [ ] `.ics` içe ve dışa aktarma.
- [ ] İlk kurulum ve yeni TestFlight build'ine yükseltme; veri kaybı ve çökme kontrolü.

## 6. App Store ürün sayfası ve yayın

- [ ] Uygulama adı/alt başlık, açıklama, anahtar kelimeler ve kategori: Productivity.
- [ ] Gerçek iOS build'inden, Apple'ın kabul ettiği ölçülerde iPhone ekran görüntüleri. iPad desteklenirse iPad görünümü ve gerekli ekran görüntüleri de test edilir/hazırlanır.
- [ ] Genel gizlilik URL'si, destek URL'si, telif bilgisi ve App Review iletişim bilgileri.
- [ ] App Privacy alanları gerçek gönderilen verilere ve üçüncü taraf SDK'lara göre doldurulur; hesaplı sürüme otomatik olarak “Data Not Collected” seçilmez.
- [ ] Güncel yaş derecelendirme soruları; dağıtım ülkeleri, fiyat/ücretsiz kararları ve AB dağıtımı varsa trader status.
- [ ] Şifreleme/export compliance soruları kullanılan TLS/SDK'lara göre yanıtlanır; Info.plist'e kanıtsız muafiyet yazılmaz.
- [ ] Giriş varsa inceleme için çalışan demo hesap ve açık arka uç; bildirim/alarm davranışı review notes'ta açıklanır.
- [ ] Test edilmiş build seçilir; önce App Review'a gönderilir. Yayın yöntemi manuel seçilerek onay sonrası yayın zamanı kontrol edilir.

## Kaynaklar

- [Apple SDK/Xcode gereksinimi](https://developer.apple.com/news/upcoming-requirements/)
- [Capacitor 8 geliştirme ortamı](https://capacitorjs.com/docs/getting-started/environment-setup)
- [GitHub macOS code signing](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications)
- [Apple build yükleme](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
- [TestFlight iş akışı](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-workflow)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Preferences gizlilik bildirimi](https://capacitorjs.com/docs/apis/preferences)
- [Capacitor push/APNs farkı](https://capacitorjs.com/docs/apis/push-notifications)
- [AlarmKit](https://developer.apple.com/documentation/alarmkit)
- [Ekran görüntüsü şartları](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
