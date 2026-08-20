# Admin Giriş ve Yetki Kılavuzu

Tarih: 2026-08-20

## Normal giriş

1. `https://militaristhumanism.com/community/sign-in` adresini aç.
2. **Continue with Google** düğmesini seç.
3. Cloudflare Worker içinde `ADMIN_BOOTSTRAP_EMAILS` listesine güvenli biçimde eklenmiş Google hesabıyla devam et. Bu rapor e-posta adresini veya herhangi bir gizli değeri yayımlamaz.
4. OAuth dönüşünden sonra `https://militaristhumanism.com/admin` adresini aç.
5. `admin` rolü `/admin/overview` ekranına, `moderator` rolü `/admin/moderation` ekranına yönlendirilir. Normal üyeler yönetim verisini göremez ve `403` alır.

Apple sağlayıcısı yapılandırılmadığı sürece düğmesi gösterilmez; canlı giriş için Google yeterlidir.

## İlk admin hesabının oluşması

Üretim D1 kontrolünde henüz kullanıcı profili bulunmadı. Bu nedenle yapılandırılmış yönetici Google hesabının ilk başarılı girişinde profil otomatik oluşturulur ve e-posta eşleşmesi sunucu tarafında `admin` rolünü verir. Eşleşme yalnızca ilk profil oluşturulurken yapılır; istemci, URL veya form alanı rol veremez.

## Yönetim rotaları

- `/admin/overview`: topluluk özet metrikleri; yalnızca admin.
- `/admin/analytics`: D1/Analytics Engine ürün analitiği; yalnızca admin.
- `/admin/community`: kategori ve yazma durumu yönetimi; yalnızca admin.
- `/admin/moderation`: moderasyon kuyruğu; admin veya moderator.
- `/admin/users`: üye arama ve moderasyon; admin veya moderator. Rol değiştirme yalnızca admin.
- `/admin/reports`: rapor kuyruğu; admin veya moderator.
- `/admin/audit`: değiştirilemez denetim izi görünümü; yalnızca admin.

Tüm yönetim sayfaları `noindex, nofollow`, sunucu tarafı rol kontrolü, güvenli oturum çerezi ve durum değiştiren işlemlerde CSRF doğrulaması kullanır.

## Giriş çalışmazsa

1. Önce `/community/sign-in` sayfasında yalnızca Google düğmesinin göründüğünü doğrula.
2. Google hesabının üretim Worker ayarındaki `ADMIN_BOOTSTRAP_EMAILS` listesiyle eşleştiğini doğrula; değeri ekran görüntüsüne veya rapora koyma.
3. Google OAuth istemcisinde yetkili dönüş URI'sinin tam olarak `https://militaristhumanism.com/api/auth/callback/google` olduğunu doğrula.
4. Giriş başarılı fakat `/admin` erişimi `403` ise profil daha önce normal üye olarak oluşmuş olabilir. Rolü yalnızca mevcut bir adminin **Users** ekranından, gerekçe girerek değiştir; doğrudan istemci verisiyle rol atama yapma.
5. Oturum sorununda çıkış yapıp Google hesap seçimini yeniden başlat; çerezleri veya OAuth tokenlarını rapora kopyalama.

## Güncel doğrulama

- Google OAuth uygulaması: üretim durumunda.
- Canlı giriş sayfası: Google açık, koşulsuz Apple/GitHub seçeneği yok.
- Üretim D1 rol sayımı: sıfır profil; ilk yetkili giriş bootstrap akışını kullanacak.
- Yetkisiz `/admin/*` erişimi: sunucu tarafında engelleniyor ve yönetim verisi döndürmüyor.
