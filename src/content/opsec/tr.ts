import type { OpSecContent } from './types';

/** Turkish, translated from the English guide. */
const TR: OpSecContent = {
    title: 'Günlük güvenlik',
    contentsLabel: 'Bu sayfada',
    disclaimerTitle: 'Sorumluluk reddi',
    disclaimer: [
        'Bu rehber, topluluk üyelerinin herkese açık kaynaklardan derlediği genel güvenlik bilgisidir. Projenin resmi görüşü değildir; hukuki, tıbbi, mali ya da başka bir profesyonel tavsiye de değildir.',
        'Buradaki her araç ya da yöntem başarısız olabilir, kurcalanmış olabilir ya da senin durumuna uymayabilir. Ona güvenmeden önce kendin kontrol et, yerel yasalara uy ve asla birine zarar vermek için kullanma.',
        'Fiziksel tehlike altındaysan, takip ediliyor ya da tacize uğruyorsan önce yerel polise, hukuki yardım kuruluşlarına ya da bir destek örgütüne başvur.',
    ],
    intro: 'Burası kendimizi güvende hissedebileceğimiz bir topluluk olmalı. Ama güven tek bir kişiye ya da tek bir siteye inanmaktan gelmez; her birimizin kendini nasıl koruyacağını bilmesinden gelir. Bu rehber seni korkutmak için değil, riski kapının dışında tutmana yardım etmek için var. Önce neyin korunmaya değer olduğuna karar ver, sonra gerçekten sürdürebileceğin basit alışkanlıklar edin.',
    basicHeading: 'Temeller: önce kendini koru',
    advancedHeading: 'İleri düzey: yüksek riskli durumlar ve acil müdahale',
    advancedNote:
        'Bu bölüm daha uç durumlar içindir: sistemli olarak hedef alınmak, takip edilmek, gerçek bir fiziksel tehdit ya da cihazının veya hesaplarının zaten ele geçirildiği şüphesi. Çoğu üyenin buna hiç ihtiyacı olmayabilir. Kendi durumuna göre, yalnızca meşru öz savunma için kullan ve asla yasa dışı bir şey yapma. Fiziksel güvenliğin tehdit altındaysa önce yerel kolluk kuvvetlerine, hukuki yardım kuruluşlarına ya da güvenilir bir profesyonel kuruluşa başvur.',
    extendedHeading: 'Daha fazlası: matematik, anonimlik ağları, mutabakat ve yüksek tehdit ortamları',
    extendedNote:
        'Buradan sonrası isteğe bağlı arka plan okumasıdır. Formülleri öğrenmen gerekmez ve yukarıdaki kontrol listelerini kullanmak için hiçbiri şart değildir. Anonimliğin bir anahtar değil, bir dizi varsayım olduğunu, yani "neden"i açıklarlar. Matematik fikirleri gözünde canlandırmayı kolaylaştırmak için burada, bir kullanım kılavuzu olarak değil. Son birkaç bölüm yüksek tehdit ortamlarını ele alır; yalnızca ilkeleri, riskleri ve alternatifleri anlatır, uygulanabilir adımlar vermez. Çoğu okurun bunlara ihtiyacı olmayacak. İşine yaramayanı atla, gerekirse sonra geri dön.',
    sections: [
        {
            id: 'threat-model',
            title: 'Önce sor: neyi, kimden koruyorsun?',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'Güvenlik, en karmaşık araçları kurmak demek değildir. Üç soruyla başlar: hangi bilgi sızarsa sana zarar verir, onu kim arayabilir ve buna ne kadar zaman ayırmaya hazırsın.',
                },
                {
                    type: 'ul',
                    items: [
                        'Korunacaklar: gerçek kimliğin, evin ve hareketlerin, okulun ya da işyerin, yakın ilişkilerin, tıbbi ve ilaç bilgilerin, paran ve kamuya açılmasını istemediğin geçmişin.',
                        'Olası karşı taraflar: internette rastgele bir yabancı, reddedilmiş bir hayran, bir tanıdık, bir dolandırıcılık şebekesi, platform moderatörleri, hatta sistemli gözetim. Karşı taraf ne kadar güçlüyse o kadar çok ayrıma ihtiyacın olur.',
                        'Sonuçlar: çevrimiçi taciz, takip, istemeden ifşa edilmek, işini kaybetmek ya da fiziksel tehlike. Sonuç ne kadar ağırsa önceden hazırlanmak o kadar değerlidir.',
                        'Sürdürülebilirlik: yıllarca sürdürebileceğin sıradan bir alışkanlık, üç gün sonra bıraktığın aşırı bir düzenden iyidir.',
                    ],
                },
                {
                    type: 'warn',
                    kind: 'note',
                    text: '"Mutlak güvenlik" peşinde koşma. Dünyada mutlak güvenli bir sistem yoktur; yalnızca riski kabul edilebilir bir düzeye indirmenin yolları vardır. Kendini öyle çok korumak ki yalnızlaşmak da bir başarısızlıktır.',
                },
            ],
        },
        {
            id: 'identity',
            title: 'Temel ilke: topluluk kimliğini gerçek kimliğinden ayır',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'Bu rehberin en önemli kuralı budur. İki kimlik arasında doğrulanabilir bir bağ olmadığı sürece, ne kadar iyi ararsa arasın kimsenin seni bulması çok zordur. Amaç kusursuz bir yalan uydurmak değil, gereksiz gerçek bilgilerin hiç ortaya çıkmamasını sağlamaktır.',
                },
                {
                    type: 'ul',
                    items: [
                        'Bu topluluk için ayrı bir takma ad, profil resmi ve tanıtım hazırla. QQ, WeChat, Weibo, oyun kimliğin, e-posta adresinin ilk kısmı ya da her yerde kullandığın kullanıcı adıyla örtüşmesin.',
                        'Gerçek adını, telefon numaranı, okulunu, işyerini, ev adresini, tam konumunu, yüz fotoğraflarını, ses kayıtlarını, kimlik belgelerini ve tıbbi kayıtlarını gönderilerin, özel mesajların ve profilin dışında tut.',
                        'Yaş, hobiler, bölge ve günlük düzen zararsız görünür ama aramayı daraltmanın çoğu zaman en hızlı yoludur. Boş bırakabiliyorsan boş bırak; bırakamıyorsan belirsiz tut.',
                        'Her platformda farklı bir kullanıcı adı kullan. Aynı profil resmini, tanıtım yazısını ya da kayıt e-postasını bir yerden ötekine taşıma.',
                        'Topluluk hesabınla gerçek hayattaki hesaplarını asla aynı cihazda ya da aynı tarayıcıda açık tutma.',
                    ],
                },
                {
                    type: 'p',
                    text: 'Basit bir test dene: bu toplulukta söylediğin ve paylaştığın her şeyi yan yana koy. Biri bunlardan okulunu, işyerini ya da evini çıkarabilir mi? Oraya giden tek bir iz bile varsa onu sil ya da değiştir.',
                },
            ],
        },
        {
            id: 'accounts',
            title: 'Hesaplar, parolalar ve iki adımlı doğrulama',
            level: 'basic',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        'Her hesaba kendi güçlü parolasını ver. Doğum günleri, telefon numaraları, klavye desenleri ve her yerde tekrar kullanılan tek bir parola sayılmaz.',
                        'Parolaları üretmek ve saklamak için bir parola yöneticisi kullan. KeePassXC tamamen çevrimdışı kalabilir; Bitwarden daha pratiktir ama ana parolayı çok iyi koru.',
                        "Bu toplulukta ve tüm önemli hesaplarında 2FA'yı aç. Yalnızca SMS'e güvenmek yerine bir doğrulama uygulaması (Aegis, FreeOTP, Ente Auth) kullan.",
                        'Kurtarma kodlarını kâğıda yaz ya da çevrimdışı bir yerde sakla. Ekran görüntüsünü alıp galerine, bulut depolamana ya da sohbet geçmişine koyma.',
                        'Oturum açılmış cihazları ve etkin oturumları zaman zaman gözden geçir. Bir cihaz senin değilse hemen oturumunu kapat ve parolanı değiştir.',
                        'Güvenlik sorularının cevaplarını, hatırlayabildiğin sürece uydurabilirsin. Annenin kızlık soyadını ya da doğduğun şehri kullanma; bunlar kolayca bulunur.',
                    ],
                },
                {
                    type: 'warn',
                    kind: 'warning',
                    text: 'Gerçek yetkililer senden asla özel mesajla parola, doğrulama kodu ya da kurtarma kodu istemez. Doğrulama kodu hesabın ta kendisidir; onu alan kişi senin yerine oturum açabilir.',
                },
            ],
        },
        {
            id: 'photos',
            title: 'Fotoğraflar, ses ve meta veriler',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'Telefon kamerası GPS koordinatlarını, çekim zamanını ve cihaz modelini sessizce dosyaya yazar. Ses ve video da biyometrik veridir. Tek bir fotoğraf ya da sesli mesaj, yerini sandığından çok daha kesin gösterebilir.',
                },
                {
                    type: 'ul',
                    items: [
                        'Paylaşmadan önce EXIF\'i temizle: bilgisayarda ExifTool ya da ImageOptim, telefonda galerideki "konumu kaldır" veya "meta verileri kaldır" seçeneğini kullan.',
                        'Arka plana bak: penceredeki simgesel yapılar, okul formaları, kapı tabelaları, kargo etiketleri, ders programları, iş kartları, tıbbi kayıtlar ve ilaç kutuları seni ele verir.',
                        'Temizliği bir sosyal medya uygulamasına bırakma. Önemli görselleri kendin işle; gerekirse yeniden ekran görüntüsü al ya da yeniden sıkıştır.',
                        'Elinden geldiğince sesten ve videodan kaçın. Sesin biyometrik bir tanımlayıcıdır; arka plandaki anonslar, durak adları, yerel ağızlar ve odanın yankısı çevreni ele verir.',
                        'Kimlik belgelerinin, tıbbi kayıtların, reçetelerin ya da tahlil sonuçlarının fotoğrafını çekip asla gönderme. Doğrulama istenirse ne için olduğunu ve en az bilginin yetip yetmeyeceğini sor.',
                        'Paylaşmadan önce bir kez daha bak: aynalar, yansımalar, dışarıdaki manzara, masadaki kargo etiketi.',
                    ],
                },
            ],
        },
        {
            id: 'messaging',
            title: 'Özel mesajlaşma: önce SimpleX, sonra Signal',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'WeChat, QQ, SMS, sıradan e-posta ve normal Telegram sohbetleri hassas içerik için uygun değildir. Okunabilir, saklanabilir, incelenebilir ya da tek bir hesap çalınmasıyla toptan sızabilirler.',
                },
                {
                    type: 'ul',
                    items: [
                        "İlk anonim temas için ya da toplulukta yeni tanıştığın ve henüz güvenmediğin biri için SimpleX'i tercih et. Telefon numarası ya da e-posta istemez, sabit bir kullanıcı kimliği yoktur, tek kullanımlık davet bağlantılarıyla bağlanır, mesajları uçtan uca şifreler ve çok az meta veri bırakır.",
                        'Zaten tanıdığın ve uzun süreli, istikrarlı bir kanala ihtiyaç duyduğun kişiler için Signal iyi çalışır. Telefon numarası gerektirir; bu yüzden gerçek adınla kayıtlı ana hattını değil ayrı bir numara kullan. Güvenilir küçük bir çevre için uygundur.',
                        'Uzun mesajlar, dosyalar ya da platformlar arası iletişim için PGP ile şifrelenmiş e-posta kullan. Göndermeden önce açık anahtar parmak izlerini ikinci bir kanaldan doğrula.',
                        'Hangi aracı kullanırsan kullan, kimlik kartlarını, tıbbi kayıtları, adresleri, okulu ya da işyerini, biletleri ve kargo etiketlerini sohbetin dışında tut. Göndermek zorundaysan önce bulanıklaştır, kırp ve şifrele.',
                        'Kilit ekranı önizlemelerini ve bulut yedeklerini kapat. Telefonun kaybolursa ya da incelenirse, önizlemeler ve yedekler çoğu zaman mesajlaşma uygulamasının kendisinden fazlasını sızdırır.',
                    ],
                },
                {
                    type: 'warn',
                    kind: 'warning',
                    text: 'Uçtan uca şifreleme yalnızca aktarımı korur. Kilidi açık bir telefonu, ekran görüntüsünü, iletilmiş bir mesajı ya da bulut yedeğini korumaz. Doğru araç ilk adımdır; alışkanlıklar daha önemlidir.',
                },
            ],
        },
        {
            id: 'browsing',
            title: "Gezinme, Tor ve VPN'ler",
            level: 'basic',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        'Bu siteyi ziyaret ederken Tor Browser ya da güvendiğin bir VPN kullan. Üçüncü taraf yansı siteler için önce onları kimin yönettiğini ve kurcalanıp kurcalanmadığını öğren.',
                        "Mümkünse JavaScript'i kapat; en azından güvenmediğin sitelerde gelişigüzel izin verme. JavaScript, parmak izi çıkarma ve davranış analizinin başlıca giriş kapısıdır.",
                        'Topluluk kimliğini ve gerçek kimliğini tek bir tarayıcıya sıkıştırma. En azından ayrı bir tarayıcı profili, tercihen ayrı bir cihaz kullan.',
                        'Eklentileri en aza indir. Her eklenti ziyaret ettiğin sayfaları görebilir; artık kullanmadıklarını kaldır.',
                        'Önemli adresleri elle yaz ya da yer imlerini kullan. Özel mesajlardaki, e-postalardaki ya da arama reklamlarındaki giriş bağlantılarına tıklama.',
                        'Tarayıcını, işletim sistemini ve uygulamalarını güncel tut. Pek çok saldırı çoktan yamanmış açıkları kullanır.',
                    ],
                },
                {
                    type: 'p',
                    text: "Tor ve VPN aynı şey değildir. Tor trafiğini birden çok aktarıcıdan geçirir ve gerçek IP'ni gizler ama yavaştır ve çıkış düğümü şifrelenmemiş trafiği görebilir. VPN yalnızca seninle VPN sunucusu arasındaki bağlantıyı şifreler; VPN işletmecisi gerçek IP'ni ve gittiğin yerleri yine de görebilir.",
                },
                {
                    type: 'p',
                    text: "Güvenilir bir VPN, bir VPS üzerinde WireGuard ile kendin kurduğun bir VPN ya da iyi bir üne ve açık bir kayıt politikasına sahip ticari bir hizmet olabilir. İşletmecisi belli olmayan ücretsiz bir VPN kullanma. Kendi kurduğun VPN de görünmezlik pelerini değildir: VPS sağlayıcısı sunucunun IP'sini yine görebilir.",
                },
                {
                    type: 'p',
                    text: 'Tehdit modelin yüksekse Tor kullan. Asıl amacın yerel ağının ya da internet sağlayıcının seni izlemesini engellemekse, güvenilir bir VPN genellikle yeterlidir. "VPN"i "tamamen anonim" ile eş anlamlı sayma.',
                },
                {
                    type: 'p',
                    text: 'Gizli gezinme yalnızca cihazdaki izleri azaltır; seni anonim yapmaz. Gerçek anonimlik ağ katmanının (Tor ya da VPN), tarayıcı parmak izinin ve hesap ayrımının bir araya gelmesinden doğar.',
                },
            ],
        },
        {
            id: 'official-site',
            title: '"Resmi site" kesinlikle güvenli demek değildir',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'Burası projenin resmi sitesi ve kodu açık ve denetlenebilir tutmaya çalışıyoruz. Ama "resmi" yalnızca proje tarafından yönetildiği anlamına gelir; ele geçirilemeyeceği anlamına gelmez. Dünyada mutlak güvenli bir sistem yoktur. Kendi mantığımızda hiçbir kusur olmasa bile, yukarı akışta herhangi bir yerdeki sorun tarayıcında çalışan uygulamayı etkileyebilir.',
                },
                {
                    type: 'ul',
                    items: [
                        'Bağımlılık tedarik zinciri: bir npm paketi, açık kaynak kütüphane ya da derleme aracı zehirlenebilir ya da uzaktan kod çalıştırma (RCE) açığı ortaya çıkabilir. Kendi kodumuzun tek satırını değiştirmeden etkilenebiliriz.',
                        'Barındırma ve dağıtım: bir barındırma platformu, CI/CD hattı, alan adı, CDN ya da yönetici hesabı ele geçirilir ve sayfa değiştirilir veya içine zararlı betik yerleştirilir.',
                        'Üçüncü taraf kaynaklar: analiz araçları, yazı tipleri, simgeler, destek bileşenleri ya da başka dış betikler ele geçirilip sayfanın içinde kod çalıştırabilir.',
                        'Kendi ortamın: bir tarayıcı eklentisi, klavye uygulaması, vekil sunucu aracı ya da işletim sistemi ele geçirilmişse, "normal görünen" bir sayfa bile tehlikeli olur.',
                    ],
                },
                {
                    type: 'p',
                    text: 'Yani: yalnızca "resmi site" diye gerçek adını, kimlik belgelerini, adresini ya da işyerini girme. Önemli işlemlerden önce alan adını ve sertifikayı kontrol et. Bağımsız yedekler tut. Sayfa tuhaf davranırsa, sertifika uyarısı gösterirse ya da beklenmedik biçimde yönlendirirse kullanmayı bırak ve güvenilir bir kanaldan bildir. Tehdit modelin yüksekse kendin barındırmayı, sürümleri sabitlemeyi ve her güncellemeyi incelemeyi düşün.',
                },
                {
                    type: 'warn',
                    kind: 'note',
                    text: 'Güvenlik, bir kez kontrol edince seni sonsuza dek güvende tutan bir şey değildir. Olasılığı düşürmenin ve zararı sınırlamanın süregiden işidir. Resmi siteyi, görece güvenilir ama yine de dikkat gerektiren bir araç olarak gör; bir kasa olarak değil.',
                },
            ],
        },
        {
            id: 'money',
            title: 'Para ve kripto para: kolaylık ve gizlilik farklı şeylerdir',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'Aşağıdakiler kişisel para yönetimine dair genel tavsiyelerdir; projenin resmi bir rehberi ya da bağış politikası değildir. Amaçla başla: günlük küçük harcamalar, bağış almak, uzun vadeli birikim ya da gizliliğin önemli olduğu işlemler. Farklı amaçlar için farklı cüzdanlar kullan ve tüm varlıklarını tek bir yerde tutma.',
                },
                {
                    type: 'ul',
                    items: [
                        "İtibari paraya giriş ve çıkış gereken küçük, günlük tutarlar için düzenlemeye tabi bir KYC borsası ya da saklamalı bir cüzdan kabul edilebilir; yeter ki tutar kaybetmeyi göze alabileceğin sınırda kalsın. KYC'nin bedeli kimliğinin fonlara bağlanmasıdır; yani anonimlik aracı değildir.",
                        "Daha büyük tutarlar ya da gizliliğin daha önemli olduğu durumlar için saklamasız bir cüzdan ve bir DEX veya zincir üstü takas kullan, özel anahtarları kendin tut. DEX'ler genellikle KYC istemez ama zincir herkese açıktır, likidite ve kayma riskleri daha yüksektir ve sahte tokenler yaygındır.",
                        "Cake Wallet: Monero, Bitcoin, Ethereum ve daha fazlasını destekleyen, yerleşik takas özelliği olan açık kaynak, saklamasız, çok para birimli bir cüzdan. XMR'yi başka para birimlerine çevirmek için pratiktir. Takaslar genellikle üçüncü taraf likidite sağlayıcıları tarafından gerçekleştirilir ve bazı yollar KYC gerektirebilir; küçük bir tutarla dene ve devam etmeden önce paranın ulaştığını doğrula.",
                        "Monero GUI: Monero'nun resmi cüzdanı. Yerel bir tam düğüm (monerod) çalıştırabilir. Kendi düğümün en iyi gizliliği ve doğrulamayı sağlar ama blok zinciri büyüktür, ilk eşitleme yavaştır ve disk ile bant genişliği tüketir; bu sıradan kullanıcılar için zahmetli olabilir. Uzak düğüm daha kolaydır ama düğüm işletmecisi IP'ni ve sorgu düzenini görebilir.",
                        "Bitcoin Core: Bir Bitcoin tam düğümü en güvenilir doğrulamayı sağlar ama zincirin boyutu ve eşitleme maliyeti daha da yüksektir. Electrum Personal Server ya da Sparrow gibi araçlarla eşleştirip kendi düğümünü kullanırken doğrulamayla gizliliği dengeleyebilirsin. Not: BTC anonim değil, takma adlıdır; adresin yeniden kullanılması ve KYC'li işlemler ödemeleri bağlamayı kolaylaştırır.",
                        'BTC mi Monero mu: BTC son derece merkeziyetsizdir, yaygın olarak kabul görür ve şeffaf bir defteri vardır; bu da onu bağışlar, muhasebe ve uzun vadeli birikim için uygun kılar. Monero varsayılan olarak gizlidir; işlemlerinin herkese açık biçimde bağlanmasını istemeyen bireylere uyar. Amaca göre ayırabilirsin; biri ya da öteki diye bir şart yoktur.',
                        "Bağış almak: ayrı bir alım adresi kullan, BTC gibi yaygın bir varlığı tercih et ve kaynağın ve amacın kaydını tut. Bağış fonlarını kişisel cüzdanlarla karıştırma ve kaynağı bilinmeyen büyük transferleri kabul etme. BTC'nin şeffaf defteri kamuya açık muhasebeyi kolaylaştırır; Monero daha iyi gizlilik sunar ama opaklığı, kamuya açık denetim gerektiren bağışlar için onu uygunsuz kılar.",
                        'Kirli para riski: zincir üstü varlıkların temiz olduğuna dair hiçbir garanti yoktur. Gelen coinler dolandırıcılıktan, kumardan, yaptırım altındaki adreslerden ya da çalıntı fonlardan gelmiş olabilir. Zincir analizi şirketleri adreslere puan verir ve borsalar bu yüzden hesabını dondurabilir. Yabancılardan gelen "ucuz coin" ya da "şunu senin cüzdanından geçireyim" isteklerini kabul etme; seni bir kara para aklama zincirinin parçası yapabilir.',
                        'Kurtarma ifadelerini çevrimdışı sakla: kâğıda ya da metale yaz, asla fotoğrafını çekme, asla buluta koyma, asla sohbette gönderme ve parola yöneticin dışında internete bağlı hiçbir cihazda saklama.',
                        'Büyük tutarlar için donanım cüzdanı kullan; farklı amaçlar için ayrı cüzdanlar kullan; her seferinde küçük bir tutarla dene; göndermeden önce adresi cihazın ekranında doğrula.',
                        'Cüzdanları yalnızca resmi siteden ya da resmi uygulama mağazası bağlantılarından indir. Sahte uygulamalara, sahte destek temsilcilerine, sahte airdrop\'lara ve "varlık kurtarma" dolandırıcılıklarına dikkat et.',
                    ],
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: 'Bu bölüm kişisel paranın ve gizliliğin korunmasıyla ilgilidir. Kara para aklama, vergi kaçırma, yaptırımları aşma ya da dolandırıcılık için bir rehber değildir. Gizlilik teknolojisinin kendisi suç değildir; onu kötüye kullanmak suçtur. Yerel yasalara uy.',
                },
                {
                    type: 'p',
                    text: 'Mevzuat notu: tutar ne olursa olsun, bildirimden, vergiden ya da borsa risk kontrollerinden kaçmak için işlemleri bilerek bölme. Bildirilmesi gerekeni bildir ve tutman gereken kayıtları tut.',
                },
                {
                    type: 'p',
                    text: 'Şüpheli bir fon alırsan: aceleyle taşıma ya da harcama. Kanıtları sakla, cüzdanının ya da borsanın uyum ekibiyle iletişime geç ve gerekirse bir avukata danış.',
                },
            ],
        },
        {
            id: 'phishing',
            title: 'Oltalama ve sosyal mühendislik: beş tehlike işareti',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'Sosyal mühendislik koda değil, insana saldırır. Önce güven kazanır, sonra baskı yaratır ve sonunda bilgiyi kendi elinle vermeni ya da bağlantıya kendin tıklamanı sağlar. Doğrulama kodunu kendin gönderirsen hiçbir teknik beceri seni koruyamaz.',
                },
                {
                    type: 'ul',
                    items: [
                        'Ani yakınlık ya da tesadüf: biri tanışır tanışmaz seni olağanüstü iyi anlıyor, sürekli mesaj atıyor ve samimiyeti aceleye getiriyor.',
                        'Aciliyet ve korku: hemen yap, hesabın kapatılacak, bir yakının başı dertte, polis seni arıyor, fırsatı kaçıracaksın.',
                        'Otorite iddiası: kendini yönetici, moderatör, resmi destek, polis memuru, doktor ya da yatırım danışmanı olarak tanıtıyor.',
                        'Gerekenden fazlasını istemek: okul, şehir, adres, kimlik belgeleri, banka kartı, ses, video, doğrulama kodu, ekran paylaşımı.',
                        'Yalnızlaştırma ya da gizlilik: kimseye söyleme, başka bir platforma geçelim, şu bağlantıya tıkla, şu uzaktan erişim aracını kur.',
                    ],
                },
                {
                    type: 'p',
                    text: 'Bunlardan biri görünürse dur. Karşı tarafın gönderdiği bağlantıdan değil, zaten bildiğin resmi giriş noktasından doğrula. Baskı altında karar verme. Doğrulama kodlarını, parolaları ya da kurtarma kodlarını asla kimseye verme. Uzaktan kontrol yazılımı kurma. Para gönderme.',
                },
                {
                    type: 'warn',
                    kind: 'tip',
                    text: 'Sana gerçekten saygı duyan biri, "önce bunu doğrulamam gerek" dediğin için kızmaz. O anda patlayan, tehdit eden ya da baskı yapan biri zaten bir tehlike işaretidir.',
                },
            ],
        },
        {
            id: 'scenario',
            title: 'Senaryo: neredeyse başarılı olan bir sosyal mühendislik girişimi',
            level: 'basic',
            blocks: [
                {
                    type: 'quote',
                    text: 'Xiao Lu toplulukta ilaç deneyimini paylaştı. Birkaç gün sonra "A-Lan" adında biri ona yazdı: "Yazdıkların çok gerçek geldi. Ben de benzer şeyler yaşadım. Konuşabilir miyiz?"',
                },
                {
                    type: 'p',
                    text: 'A-Lan sohbette iyiydi. Xiao Lu\'nun hangi oyunu sevdiğini hatırlıyor, keyfi kaçtığında onu teselli ediyor ve bilgi için hiç acele etmiyordu. İki hafta sonra A-Lan, "bot olmadığını" doğrulamak için sesli mesaj istedi. Birkaç gün sonra da Xiao Lu\'nun da belli bir şehirde olup olmadığını sordu ve gelecek ay oraya gelebileceğini söyledi. Xiao Lu geniş bir bölgeden bahsetti ama adres vermedi.',
                },
                {
                    type: 'p',
                    text: 'Sonra bir gece işler değişti. A-Lan bir bağlantı gönderdi: "Toplulukta hesap çalınıyormuş. Hesabını kaybetmemek için buradan doğrula." Sayfa resmi siteye neredeyse tıpatıp benziyordu ve kullanıcı adıyla parola istiyordu. Hemen ardından A-Lan kendi hesabının dondurulduğunu söyleyip 0.05 BTC borç istedi, ertesi gün geri ödeyeceğine söz verdi.',
                },
                {
                    type: 'p',
                    text: 'Xiao Lu neredeyse tıklayacaktı. Onu üç şey durdurdu. Birincisi, resmi yetkililer asla özel mesajla giriş bağlantısı göndermez. İkincisi, karşı taraf sürekli aciliyet yaratıyordu: "hemen yap yoksa çok geç olacak." Üçüncüsü, A-Lan bir an şehrini soruyor, sonraki an para istiyordu; zamanlama fazla düzgündü. Tıklamadı. Resmi siteyi kendisi açtı, duyurulardan böyle bir "hesap kaybı doğrulaması" olmadığını teyit etti, sonra konuşmanın ekran görüntüsünü alıp bildirdi ve hesabı engelledi. A-Lan dolandırıcılığın tutmadığını anlayınca önce sinirlenip Xiao Lu\'yu suçladı, sonra hesabını sildi.',
                },
                {
                    type: 'p',
                    text: 'Saldırı zinciri tipiktir: yakınlık kur, küçük isteklerle uyumu test et, adım adım bağlantılı bilgi topla, bir acil durum yarat ve son olarak bir oltalama bağlantısı ya da para transferiyle bitir. Her adım zararsız görünür; bir araya geldiklerinde tehlikelidirler.',
                },
                {
                    type: 'ul',
                    items: [
                        'Yavaşla. Hemen karar vermeni isteyen her talep bekleyebilir.',
                        'Başka bir kanaldan doğrula. Karşı tarafın verdiği bağlantı ya da iletişim bilgisi yerine resmi siteyi, resmi duyuruları ya da zaten tanıdığın bir yöneticiyi kullan.',
                        'Bilgiyi en azda tut. Ses, video, kimlik belgeleri, adres, doğrulama kodları ve kurtarma ifadeleri bir sohbet için asla gerekli değildir.',
                        'Reddetmek kibar olabilir: "Bunu paylaşmak bana iyi gelmiyor", "Resmi siteye kendim bakacağım", "Doğrulama kodunu kimseye vermem."',
                        'Kanıtları sakla ve bildir. Ekran görüntüsü al, hesap kimliğini ve zaman çizelgesini kaydet ve yöneticilere ya da platforma ilet. Kişiyle tek başına tartışmaya devam etme.',
                    ],
                },
            ],
        },
        {
            id: 'persona',
            title: 'İnternette sohbet: bağlantı kurulmadan bir karakteri sürdürmek',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'Burada "karakter" ayrıntılı bir sahte kimlik değildir. En az bilgi içeren, tutarlı ve doğrulanamayan bir dış görünüştür. Amaç insanları kandırmak değil, gerçek hayatının gereksiz ayrıntılarını sohbetin dışında tutmaktır.',
                },
                {
                    type: 'ul',
                    items: [
                        'Yalnızca en temel profili hazırla: bir takma ad, geniş bir yaş aralığı, geniş bir meslek yönü ve iki üç sıradan hobi. Belirli bir okul, işyeri, mahalle, doğum günü ya da aile uydurma.',
                        'Tutarlı ol. Profili şifreli bir notta tut; bugün 20, yarın 25 olma. Ama gerekenden fazla ayrıntı da uydurma; ne kadar basit olursa takılacak o kadar az şey olur.',
                        'Doğrulanamaz tut. Bölgeni yalnızca geniş bir alan ya da ülke olarak, işini yalnızca "tasarımla uğraşıyorum", "kod yazıyorum" ya da "öğrenciyim" diye, programını yalnızca "son zamanlarda" diye anlat. Konumu bulunabilecek fotoğraflar paylaşma.',
                        'Bölmelere ayır. Ayrı hesap, ayrı e-posta, ayrı tarayıcı profili. Gerçek hesaplarının bulunduğu cihazda topluluk kimliğinle oturum açma. Profil resimlerini ya da fotoğrafları tekrar kullanma.',
                        'Yazım tarzından bağlantı kurulmasını önle. Aynı tanıtım yazısını farklı platformlara yapıştırma. Belirgin tekrarlayan sözlerden kaçın. Kimliklerin arasında beğeni, paylaşım ya da etkileşim olmasın.',
                        "Sesten ve videodan kaçın. Sesli mesaj gönderme, görüntülü arama yapma, özçekim paylaşma. Fotoğraf kaçınılmazsa yüzsüz, arka plansız ve EXIF'siz bir tane kullan; yansımaları ve masadaki ayrıntıları kontrol et.",
                        'Sohbette sorular, belirsizlik ve konu değişiklikleri kullan. Her soruya cevap borçlu değilsin. "Bunu konuşmamayı tercih ederim" ve "o önemli değil" tam cümlelerdir.',
                        'Dramatik hikâyeleri kendiliğinden anlatma. Karakter ne kadar sıradan ve sıkıcıysa o kadar güvenlidir. Gerçek bir kişiyi, bir yetkiliyi ya da bir uzmanı taklit etme.',
                    ],
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: 'Karakter bir suç aracı değildir. Onu dolandırmak, birini taklit etmek, yasal sorumluluktan kaçmak ya da başkalarına zarar vermek için kullanma. Amacı gizliliktir, aldatma değil.',
                },
                {
                    type: 'p',
                    text: 'Bir şey ağzından kaçarsa: paniğe kapılıp üstüne daha çok yalan yığma. Neyin sızdığını not et, gerçek kimliğine bağlanıp bağlanamayacağını değerlendir ve gerekirse hesap değiştir, iletişimi kes ve etkilenebilecek arkadaşlarını uyar. Küçük bir hata genellikle toparlanmaya yer bırakır.',
                },
            ],
        },
        {
            id: 'family',
            title: 'Aileyle yaşamak: kontroller, ilaçlar ve saklamak',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'Çoğu insan için risk karanlık ağ değil; yemek masası, yatak odası ve sırt çantasıdır: bir ebeveyn kapıyı çalmadan girer, çekmeceyi karıştırır, telefonu kontrol eder ya da gelişigüzel "Ne içiyorsun?" diye sorar. Amaç kusursuz bir yalan değil; rutini kısa tutmak, daha az iz bırakmak ve sorgulandığında sakin kalmaktır.',
                },
                {
                    type: 'p',
                    text: 'Önce şunu netleştirelim: kullandığın ilaç yüzünden bir ebeveyn sana vurabilecekse, bu bir "aile meselesi" değil, şiddettir. Aşağıdaki adımlar geçici risk azaltmadır, uzun vadeli bir çözüm değil. Mümkün olan en kısa sürede güvendiğin bir yetişkin, doktor, sosyal hizmet uzmanı ya da yerel bir destek kuruluşu bul ve birlikte bir güvenlik planı yapın.',
                },
                {
                    type: 'p',
                    text: 'Önce tabletinin gerçekten dil altı kullanılmak üzere olduğunu doğrula. Her estradiol tableti dil altı ya da yanak içi kullanıma uygun değildir; bazıları yutulmak üzere tasarlanmıştır. Reçeteye, prospektüse ve doktoruna ya da eczacına uy. Kullanım yolunu kendi başına değiştirme. Aşağıdakiler yalnızca zaten dil altı kullanman söylenmişse fark edilme olasılığını azaltmakla ilgilidir; doz tavsiyesi değildir.',
                },
                {
                    type: 'p',
                    text: 'Ağzında dil altı tablet varken konuşup hiçbir şey belli etmemenin garantili bir yolu yoktur. En güvenli yol, tablet erirken konuşmamaktır: dilinin altına koy, ağzını kapalı tut ve çoğu eriyene kadar bekle. Estradiol tabletleri genellikle birkaç dakikadan on dakikanın üstüne kadar sürer; konuşmak, yutkunmak ve dilini oynatmak tableti yerinden oynatıp yuttuğun miktarı artırabilir.',
                },
                {
                    type: 'p',
                    text: 'Tablet ağzındayken bir ebeveyn seslenirse: cevap vermek için ağzını açma. Masaya vur, "Banyodayım, bir dakika" diye mesaj at ya da bir yudum su alıp çalkalıyormuş gibi yap. Mutlaka cevap vermen gerekiyorsa "Geliyorum" ya da "Dişimi fırçalıyorum" gibi mümkün olan en kısa sözü söyle ve ağzını yeniden kapat. Normal bir sohbet sürdürmeye çalışma. Daha iyisi önceden plan yapmaktır: duş alırken, diş fırçalarken, üstünü değiştirirken, çöpü çıkarırken ya da kilitli bir odayı toplarken kullan ve kendine 10–15 dakika ayır.',
                },
                {
                    type: 'p',
                    text: 'İlacınla yaklaşık aynı boyutta bir nane şekeri ya da vitamin tabletiyle alıştırma yap (gerçek hapla tekrar tekrar alıştırma yapma). Dilinin altına koy, beş dakikalık bir zamanlayıcı kur ve konuşmamayı, başını sallamayı, telefonu işaret etmeyi, yazmayı ve yavaş yürümeyi dene. Birkaç turda sınırını görürsün. "Alışmak" için fazladan doz alma.',
                },
                {
                    type: 'p',
                    text: 'Görülürsen: kapma, bir avuç yutma ve karşındaki ambalajı çoktan okuduysa "şeker" diye diretme. Sakin kal ve ilacı kaldır. Reçeteliyse "Doktorumun söylediği gibi kullanıyorum ve şu an bunu konuşmak istemiyorum" diyebilirsin. Değilse olabildiğince az konuş, odadan çık ve karmaşık bir tıbbi hikâye uydurma. Karşındaki şiddete başvurabilecekse kapıya giden yolu açık tut, sırtını dönme ve tartışma.',
                },
                {
                    type: 'p',
                    text: 'Enjeksiyonları saklamak daha zordur ve daha iyi hijyen gerektirir. Yalnızca kapıyı kilitleyebildiğin, ellerini yıkayabildiğin ve malzemeleri düz bir yere koyabildiğin bir yerde enjeksiyon yap. Temiz bir kâğıt havlu ser; alkollü pamukları, pamuğu, iğneleri ve kesici alet kutusunu el altında tut ve doktorun ya da hemşirenin öğrettiği sırayı izle. Acele etme. Acele, kötü ışık ve bölünmek, fark edilmekten daha tehlikelidir. Eğitim almadıysan bir sağlık çalışanından öğrenmeyi iste; doğaçlama yapma. Bu bir enjeksiyon rehberi değildir; doz, bölge, sıklık ve enjeksiyonun uygun olup olmadığı reçetene ve sağlık çalışanına göre belirlenir.',
                },
                {
                    type: 'p',
                    text: 'İğneler yalnızca tek kullanımlıktır: birini aç, bir kez kullan ve hemen kapaklı bir kesici alet kutusuna ya da kalın, sert bir kaba at. Temizleyip dezenfekte ederek sonraya saklama, tekrar kullanma ya da paylaşma. Kesici alet kutusunu kilitli bir kutuda tut. İğneleri asla mutfak çöpüne, naylon poşetlere ya da tuvalete atma. Kullanılmış iğnelerin kapağını geri takma; mutlaka takman gerekiyorsa tek elle yap.',
                },
                {
                    type: 'p',
                    text: 'Saklama yerleri: bilinen yerler işe yarayabilir ama onları "kuru, karanlık, serin, sabit ve gelişigüzel aranmayan" diye seç. Yatak başlığının arkası ya da çekmecenin arka paneli, içinde nem alıcı olan kapalı bir poşet için uygundur. Sırt çantası astarı yalnızca kısa yolculuklar içindir, uzun süreli saklama için değil; okul çantaları aranabilir. Hiç yerinden oynamayan bir saklama kutusu, kalorifere, pencereye, banyoya ya da arabaya yakın değilse uygundur. Eski ders kitaplarının arası düz blister ambalajlar için uygundur; ezme ve okulun ya da kütüphanenin kitaplarını kullanma.',
                },
                {
                    type: 'p',
                    text: 'Daha iyi bir varsayılan, bildiğin sabit bir yerde duran küçük, kilitli bir kutudur: dolabın üstü, yatağın altının en dibi ya da yalnızca senin kullandığın başka bir yer. Kilitli bir kutuyu hatırlamak, sürekli değişen saklama yerlerinden daha kolaydır ve kazara bulunma olasılığı daha düşüktür. İlaçları etiketsiz şişelere, yiyecek kavanozlarına ya da takviye şişelerine koyma; acil bir durumda yanlış şeyi alabilirsin. Orijinal ambalajı ve reçete etiketini kilitli kutunun içinde tut. Mutlaka kamuflaj bir kap kullanman gerekiyorsa içine ilacın adını, dozunu ve tarihi yaz.',
                },
                {
                    type: 'p',
                    text: 'İlaçları banyoda (nem), mutfakta (ısı ve yağ), pencere kenarında ya da kaloriferin üstünde (ısı), arabada (sıcaklık dalgalanmaları), dondurucuda (donma bazı ilaçlara zarar verebilir) ya da evcil hayvanların veya küçük çocukların ulaşabileceği bir yerde saklama.',
                },
                {
                    type: 'p',
                    text: 'Ambalajlar, faturalar ve telefonlar da sızdırır: eczane fişleri, teslimat kutuları, reçete poşetleri, banka ya da sigorta ekstreleri, eczane mesajları ve sağlık uygulaması bildirimleri görülebilir. Çöpü çıkarırken ambalajları opak bir poşete koy; mesaj önizlemelerini kapat; takvimde "randevu" ya da "kargo almak" gibi nötr adlar kullan ve sağlık uygulamalarına ortak bir aile hesabıyla girme.',
                },
                {
                    type: 'p',
                    text: 'Bir ebeveyn odanı ararsa: bunu tamamen önleyemezsin ama zararı sınırlayabilirsin. Gerekli ilaçları kilitli kutuda tut, bulunursa ne söyleyeceğin ve nereye gideceğin konusunda bir planın olsun ve fark edildiğinde tüm hapları üstünde taşıyor olma. İlaçları tuvalete dökme. Sonrasında onları daha güvenli bir yere taşı ve doktorunla ya da güvendiğin biriyle iletişime geç.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Dövülmek, tehdit edilmek ya da evden atılmak "ödemen gereken bedel" değildir. Bunu yaşıyorsan güvendiğin bir yetişkine, öğretmene, doktora, sosyal hizmet uzmanına ya da yerel bir LGBTİ+ veya trans destek örgütüne başvur. Acil tehlikedeysen yerel acil durum numarasını ara. Bunu tek başına taşıma.',
                },
            ],
        },
        {
            id: 'school',
            title: 'Sınıf arkadaşların sorduğunda: az bilgi veren cümleler',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'Okuldaki risk genellikle "bir hacker\'ın seni bulması" değildir. Dik dik bakılmak, alay edilmek ya da bir şeyi açıklaman için baskı görmektir. Kimseye kimliğini kanıtlamak zorunda değilsin. Kullanabileceğin en kısa, en sıkıcı, en kolay geri alınabilir cümleyi kullan ve sohbeti başka yöne çevir.',
                },
                {
                    type: 'p',
                    text: 'Yaygın bir zarar azaltma yolu, hedef alınma olasılığı daha yüksek bir etiket olan "trans" yerine "tarz", "cinsel yönelim" ya da "hâlâ keşfediyorum" demektir. Örneğin:',
                },
                {
                    type: 'ul',
                    items: [
                        '"Ben femboyum. Sadece kız kıyafetleri giymeyi seviyorum, bence tatlı. İlk kez deniyorum."',
                        '"Panseksüelim. Cinsiyete değil insana ilgi duyuyorum. Kıyafetler sadece tarzım."',
                        '"Hâlâ anlamaya çalışıyorum. Kendimi bir etikete kilitlemek istemiyorum."',
                        '"Sadece kişisel bir ilgi. Kimseyi etkilemiyor."',
                        '"Bu konuyu konuşmamayı tercih ederim. Başka bir şeyden bahsedelim."',
                        'Trans erkek: değişimi "Erkek fatmayım, biraz androjen; şu sıralar biraz çocukça bir havalı görünme dönemindeyim, bence havalı duruyor" diye anlat. Yalnızca kıyafet ve tarzdan bahset; hormon, ameliyat, kulüp ya da "katıldığım bir örgüt" uydurma.',
                        'Trans kız: değişimi "Anime ve cosplay\'e merak sardım, kadın kostümlerini deniyorum" diye anlat. Yalnızca hobiden bahset; cosplay fotoğrafı paylaşma, yüz yüze etkinliklere kaydolma, bir yarışma ya da kulüp uydurma.',
                    ],
                },
                {
                    type: 'p',
                    text: 'Bunun bazı yerlerde neden daha güvenli olabileceği: "kız kıyafetleri giymek" ya da "cinsel yönelim" "kişisel tarz" veya "geçici bir dönem" olarak görülebilirken, "trans" daha güçlü bir tepkiyi tetikleyebilir. Ama evrensel bir kalkan değildir. Femboylar ve panseksüel insanlar da homofobi ve transfobinin hedefi olur; karşındaki senin trans olduğuna zaten karar verdiyse farklı bir etiket işe yaramayabilir.',
                },
                {
                    type: 'p',
                    text: 'Nasıl kullanılır: kısa, rahat ve az ayrıntılı tut. Bir cümleden sonra konuyu değiştir. Karmaşık bir geçmiş uydurma; her okul, şehir ve zaman çizelgesi dağılabilecek bir şey daha demektir. Kendini korumak için diğer trans insanları küçümseme. "Ben onlardan değilim" başkalarını incitir ve seni daha da yalnız bırakır.',
                },
                {
                    type: 'p',
                    text: 'Trans erkekler ve trans kızlar daha belirli bir "okul hikâyesi" de ödünç alabilir: trans bir erkek değişimi "erkek fatma, androjen, son zamanlarda biraz çocukça havalı görünme merakı" diye; trans bir kız "anime ve cosplay meraklısı, kadın kostümleri deniyor" diye anlatabilir. Bu, trans erkeklerin erkek fatma olması ya da trans kızların cosplay sevmesi gerektiği anlamına gelmez; yalnızca bazı okullarda maliyeti düşük bir kalkandır ve herkese uymaz.',
                },
                {
                    type: 'ul',
                    items: [
                        'Yalnızca neden böyle giyindiğini ya da son zamanlarda neden değiştiğini açıkla; bedenini, tıbbi bakımını, belgelerini, adını ve zamirlerini ya da ilişkilerini değil. Hormon, ameliyat, kulüp, yarışma ya da "katıldığım bir örgüt" uydurma.',
                        '"Geç gelen havalı görünme dönemi" bir şakadır, teşhis değil; öğretmenlerin davranış sorunun olduğunu düşünmesine ve daha çok dikkat çekmene yol açabilir. Abartma. Bazı okullarda bu "ruhsal bir sorun" olarak görülür ve sınıf öğretmenini, aileni ya da okul rehber öğretmenini işin içine katar; zaten gözetim altındaysan bunu kullanma.',
                        'Cosplay fotoğrafları, hesapları ve yüz yüze etkinlikler bağlantı kurulabilir izler bırakır; özenli cosplay fotoğraf setleri paylaşma, büyük etkinliklere gitme ya da karakteri sürdürmek için borç alıp aksesuar alma. Bazı okullar cosplay\'i "uygunsuz kıyafet" ya da "okulu ciddiye almamak" olarak görür, disiplin puanı verebilir ya da ailene haber verebilir; önce okul kurallarını ve öğretmenin tutumunu kontrol et.',
                        'Bu iki cümle yalnızca sınıf arkadaşlarının gelişigüzel soruları içindir; öğretmenlere, ailene, doktorlara ya da polise karşı karakter kullanma. "Bunu konuşmak istemiyorum" de ya da güvendiğin bir yetişkin bul.',
                        'Bir çıkış cümlesi hazır tut: "Sadece eğlence olsun diye deniyordum; bir süre sonra değiştirebilirim." Böylece ileride tarzındaki bir değişikliği açıklamak zorunda kalmazsın.',
                    ],
                },
                {
                    type: 'p',
                    text: 'Trans kızlar için: cosplay cümlesini kullanmak sende bir sorun olduğunu kabul etmek değildir ve kendini küçük düşürmek de değildir; yalnızca konuyu "trans mısın" sorusundan "anime hayranı mısın" sorusuna kaydırır. Bazı okullar bunu gerçekten yalnızca "uygunsuz kıyafet", "kötü tavır" ya da "okulu ciddiye almamak" olarak görür ve kadın kıyafetlerine el koyabilir, ama yalnızca bu sözden ilaç kullandığını çıkarmaz. Yine de "en kötü ihtimalle el koyarlar" bir garanti değildir: bedenin gözle görülür biçimde değiştiyse, biri seni şikâyet ederse ya da ailen zaten şüpheleniyorsa okul yine de çantanı, telefonunu ya da ilaçlarını arayabilir veya sağlık muayenesi isteyebilir.',
                },
                {
                    type: 'p',
                    text: 'Trans erkekler için: "havalı görünmeye meraklı erkek fatma" kılıfı bazen bazı erkek gruplarıyla sıradan bir yakınlık sağlayabilir: omzuna kol atılması, "kardeşim" denmesi, birlikte top oynamak. Bu gerçek bir tampon olabilir ama güvenliğin kanıtı değildir; seni yalnızca "erkeklerden biri" sandıkları için kabul ediyorlarsa şüphelendikleri anda sana dönebilirler. Bu konumu korumak için yüksek riskli durumlara (yatılı kalmak, tuvaletler, beden muayeneleri) girme ve "kardeşim denmesini" geçmen gereken bir sınav sayma. Bu tür bir yakınlık seni rahatsız ediyorsa uzaklaş; "erkek gibi davranmak" için dokunulmaya katlanmak zorunda değilsin.',
                },
                {
                    type: 'p',
                    text: 'Biri ısrarla "Trans mısın?" diye sorarsa: "Hâlâ düşünüyorum ve şu an konuşmak istemiyorum" ya da "Neden soruyorsun?" Alay etmeye, etrafını sarmaya ya da el kaldırmaya başlarlarsa tartışma. Oradan ayrıl, öğretmenlerin, kameraların ya da başka öğrencilerin olduğu bir yere git ve güvendiğin birini bul.',
                },
                {
                    type: 'p',
                    text: 'Bir öğretmen "Neden normal giyinemiyorsun?" derse: derste toplumsal cinsiyet kuramı tartışmak zorunda değilsin. "Bana doğru gelen şekilde giyiniyorum ve derse engel olmuyor" demek yeterli; sonra derse dön. Bir öğretmen seni aşağılar ya da cezalandırırsa zamanı, yeri ve tam sözleri kaydet ve güvenli bir ebeveyne ya da veliye, okul rehber öğretmenine veya yerel eğitim müdürlüğüne bildir.',
                },
                {
                    type: 'p',
                    text: 'Açılmak tek seferlik bir sınav değildir. Bugün "keşfediyorum", yarın "bunu konuşmak istemiyorum" diyebilirsin. Bu bir çelişki değildir. Etiketler senin araçlarındır, bir sorgunun cevapları değil.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Daha güvenli göründüğü için kendini femboy etiketini kabul etmeye zorlama ve belirli bir gerçek kişiymiş gibi davranma. "Femboy dersem daha az dayak yerim" diye düşünsen bile dövülmek yine de şiddettir, ödemen gereken bir bedel değil. Ortam tehlikeliyse oradan ayrılmayı ve yardım almayı öncele. Karşındaki senin trans olduğuna zaten karar verdiyse farklı bir etiket işe yaramayabilir; bu durumda da ayrılmayı ve güvendiğin birini bulmayı öncele ve bunu kanıtlamak için karakteri tırmandırmaya devam etme.',
                },
            ],
        },
        {
            id: 'medical',
            title: 'Okul sağlık taramaları ve tıbbi gizlilik: kendini kusturma',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'Okul sağlık taramaları yere göre değişir. Yaygın olanlar boy ve kilo, tansiyon, görme, omurga ve kalp ile akciğer dinlemesidir; bazı yerlerde kan da alınır. İlaçlarının, enjeksiyon izlerinin, göğüs bağlamanın ya da bedenindeki değişikliklerin ortaya çıkmasından endişeleniyorsan önceden sor: neye bakılacak, kim yapacak, sonuçları kim görecek, doktorla baş başa konuşabilir misin ve ayrı bir muayene ya da güvendiğin bir yetişkinin eşlik etmesi ayarlanabilir mi. Pek çok okul gizlilik düzenlemelerine izin verir ama kurallar yaşadığın yere bağlıdır; var olduklarını da yok olduklarını da varsayma.',
                },
                {
                    type: 'p',
                    text: 'Daha güvenli bir yol, güvendiğin bir doktora, okul hemşiresine, sosyal hizmet uzmanına ya da yerel bir LGBTİ+ veya trans destek örgütüne yerel kuralları sormaktır. Uygunsa bir sağlık çalışanından yalnızca ayrı bir değerlendirmeye ihtiyacın olduğunu ya da grup içinde muayene edilmemen gerektiğini belirten bir yazı iste. Tıbbi kayıtları, reçeteleri ya da bir ebeveynin imzasını taklit etme; sahtecilik çok daha büyük hukuki ve ailevi riskler doğurur.',
                },
                {
                    type: 'p',
                    text: 'Yalnızca gerginsen ya da gerçekten kendini iyi hissetmiyorsan: bir öğretmene ya da okul hemşiresine "Biraz başım dönüyor, oturmam gerek" de. Otur, yavaş yavaş su iç, bisiklete binme ya da araba kullanma ve güvendiğin birine haber vermelerini iste. Gerçek bir belirti hakkında doğruyu söylemek, seni hastaneye gönderebilecek ya da ailenin aranmasına yol açabilecek bir hikâye uydurmaktan çok daha kontrol edilebilirdir.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Yüksek riskli davranış uyarısı: sağlık taramasından kaçmak için kendini kusturma, kusturucu ilaç kullanma, boğazını uyarma, idrarını tutma, susuz kalma, kendi başına ilaç alma ya da bayılmış numarası yapma. Kendini kusturmak aspirasyona, boğulmaya, yemek borusu yırtılmalarına, elektrolit dengesizliğine, kalp ritmi sorunlarına ve diş aşınmasına yol açabilir. Kustuktan hemen sonra uzanıp uyumak özellikle tehlikelidir, çünkü uykuda kusmuğunla boğulabilirsin. "Kustum, demek ki iyiyim"i bir güvenlik testi olarak kullanma.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Zaten kustuysan: ağzını çalkala, dik ya da yan yat, yudum yudum su iç ve güvendiğin bir yetişkine söyle. Tekrarlayan kusma, göğüs ya da karın ağrısı, kan kusma, ayakta durmayı zorlaştıran baş dönmesi ya da bilinç bulanıklığı varsa acilen tıbbi yardım al. Hemen tek başına uyuma ve bir kez "işe yaradı" diye tekrarlama.',
                },
                {
                    type: 'p',
                    text: 'Sağlık taraması "her şeye uymak" ile "her şeyden kaçmak" arasında bir seçim değildir. O ortamda belirli bir maddeyi reddedip doktorla baş başa konuşmak isteyebilir ya da güvendiğin bir yetişkinin yanında olmasını isteyebilirsin. Asıl tehlike, tek bir muayeneyi atlatmak için kendine zarar vermektir. Hiçbir muayene sonucu aspirasyona, yemek borusu hasarına ya da kalp ritmi sorununa değmez.',
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: 'Bir okul toplu soyunmaya zorlarsa, seni aşağılarsa ya da tıbbi bilgilerini açıklarsa zamanı, yeri, orada bulunanları ve tam sözleri kaydet ve güvendiğin bir veliye, doktora, okul rehber öğretmenine, yerel eğitim müdürlüğüne ya da hukuki yardım kuruluşuna bildir. Bununla tek başına yüzleşme.',
                },
            ],
        },
        {
            id: 'psychiatry',
            title: 'Psikiyatri, "transseksüalizm" tanısı ve "rapor": bedeni yeniden kurmak tek bir commit değildir',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: '"Transseksüalizm" bazı bölgelerde ve eski tanı sistemlerinde kullanılan bir terimdir; adlar, ölçütler ve süreçler yere göre değişir. Bu bölüm bir öz tanı aracı değildir ve bir sağlık çalışanının değerlendirmesinin yerini tutmaz. Yalnızca tek bir şeyi ele alır: bir tanıya, sevke ya da rapora ihtiyacın olduğunda kapı bekçiliğinin nasıl işleyebileceğini ve sistemin gecikmesini "yeterince trans değilim" diye yanlış anlamaktan nasıl kaçınacağını.',
                },
                {
                    type: 'p',
                    text: 'Önce şunu bil: psikiyatri yalnızca "rapor almak" için değildir ve yalnızca kriz içindeki insanlar için de değildir. Süregiden çökkünlük, kaygı, uykusuzluk, iştah değişiklikleri, ders çalışamamak ya da çalışamamak, kendine zarar verme ya da intihar düşünceleri ve madde kullanım sorunları profesyonel yardımı hak eder. Aynı anda hem ruh sağlığı desteğine hem de HRT\'ye veya ameliyata ihtiyacın olabilir; depresyonu tedavi etmek cinsiyet uyumsuzluğunu ortadan kaldırmaz ve depresyonu saklamak başvuruyu kolaylaştırmaz.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Tekrarlayan intihar düşüncelerin, bir planın ya da kendine zarar verme dürtülerin varsa: bu her türlü rapordan önce gelir. Yerel acil servislere ya da bir kriz hattına başvur, acile git, güvendiğin bir yetişkine söyle ve yalnız kalmamaya çalış. "Kaydını temiz tutmak" için saklama; değerlendirme sırasında ağır belirtileri saklamak, en çok risk altında olduğun anda seni yardımsız bırakabilir.',
                },
                {
                    type: 'p',
                    text: 'Yapısal sorun: bazı yerlerde muhafazakâr bir psikiyatrist erteleyebilir, reddedebilir ya da sürekli daha fazla belge isteyerek HRT\'yi veya cerrahi sevki engelleyebilir. Bu senin "gerçekten trans olmadığının" kanıtı değildir ve senin suçun da değildir. Yapabileceklerin: hangi tanının ve belgelerin gerektiğini (gözlem süresi, gerçek yaşam deneyimi, aile onayı vb.), yerelde bilgilendirilmiş onam ya da toplum sağlığı hizmetleri olup olmadığını ve kayıtlarının kopyalarını alıp alamayacağını önceden sor. Reddedilirsen gerekçeyi yazılı iste, neyin eksik olduğunu sor ve trans dostu bir sağlık çalışanı ya da yerel bir destek kuruluşu ara. İkinci görüş almak makuldür; kayıtları, tanıları ya da imzaları taklit etmek değildir.',
                },
                {
                    type: 'p',
                    text: 'Şu anda süregiden, belirgin bir depresyonun, kaygın ya da işlev kaybın yoksa ve acilen bir tanıya veya rapora ihtiyacın yoksa, yalnızca transseksüalizm tanısını "toplamak" için özel olarak psikiyatriye gitmen gerekmez. Ama seçtiğin yol bunu gerektiriyorsa, onu bir kimlik sınavı değil, hazırlanılacak bir belge kapısı olarak gör. Bir sağlık çalışanını memnun etmek için hikâye uydurma ve "dengeli" görünmek için gerçek sıkıntını inkâr etme.',
                },
                {
                    type: 'p',
                    text: 'Gizlilik: psikiyatrik kayıtlar, tanılar ve sevk yazıları hassastır. Bunları kimin görebileceğini, ailene, okuluna ya da işvereninle paylaşılıp paylaşılmayacağını, kopyalarını alıp alamayacağını ve güvenli bir kanaldan iletişim kurup kuramayacağını sor. Kurallar yere göre çok değişir; gizlilik olduğunu da paylaşılacağını da varsayma.',
                },
                {
                    type: 'p',
                    text: 'Yaş da kuralları değiştirir: reşit olmayanlar genellikle bir velinin onayına ya da eşliğine ihtiyaç duyar, yetişkinlerin ise genellikle daha fazla özerkliği vardır ama bu çok değişir. Önceden sor; bir ebeveynin imzasını taklit etme ya da veli gibi davranma. Ailen destekçi değilse bir doktora, sosyal hizmet uzmanına ya da destek kuruluşuna başka yasal yollar olup olmadığını sor.',
                },
                {
                    type: 'p',
                    text: 'GitHub\'ı biliyorsan süreci şöyle düşünebilirsin: Issue "değişmek istiyorum"dur, PR HRT ya da ameliyat başvurusudur, inceleme psikiyatrik değerlendirmedir ve commit bedeni yeniden kurmaktır. Gerçeklik bir depodan çok daha karışıktır: inceleyen kişi onay düğmesine hiç basmayabilir ve PR\'ına yıllarca needs-info etiketi koyabilir. Süreçle dalga geçebilirsin ama merge almak için tek güvenlik testini silme: intihar düşüncelerini, göğüs ağrısını ya da bayılmayı, yani gerçekten tehlikeli olanları saklama. Beden force push ile düzeltilebilecek bir depo değildir ve pek çok değişiklik geri alınamaz.',
                },
                {
                    type: 'p',
                    text: 'Reddedilirsen: gerekçeyi yazılı iste, eksik olanın tanı mı, gözlem süresi mi, aile onayı mı yoksa başka bir şey mi olduğunu sor, kopyaları sakla ve başka bir sağlık çalışanı ya da kurum ara veya bir trans destek örgütüne yerel yolları sor. Gerekirse itiraz et. Bir ret kimliğin hakkında bir hüküm değildir ve kesinlikle kendine zarar vererek "kanıtlaman" gereken bir şey değildir.',
                },
                {
                    type: 'p',
                    text: 'Son olarak: bu bölüm deneyim ve sistemde yol bulma rehberidir, tıbbi tavsiye değil. Belirli tanı ölçütleri, hormon ve ameliyat endikasyonları ve yasal belge gereklilikleri yerel sağlık çalışanları, kılavuzlar ve yasalarca belirlenir.',
                },
            ],
        },
        {
            id: 'emergency',
            title: 'Acil durum planı: bir şeyler ters gittiğinde ne yapmalı',
            level: 'basic',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        'Bir şey olmadan önce temelleri hazırla: önemli hesapların bir listesi, kurtarma kodları, acil durum kişileri, yedek bir cihaz, biraz nakit ve gerekli ilaçlar. Evi altüst etmeye başladığın anı bekleme.',
                        "Hesabının çalındığından şüpheleniyorsan: önce parolanı değiştir, sonra 2FA'yı kontrol et ya da sıfırla, oturum açılmış cihazları ve etkin oturumları gözden geçir ve tanımadığın her cihazın oturumunu kapat. E-posta yönlendirme kurallarını ve kurtarma e-postasını da kontrol et.",
                        'Kimliğinin ortaya çıkarıldığından şüpheleniyorsan: ne kadarının sızdığını değerlendir, yeni paylaşımlara ara ver, herkese açık profilini en aza indir, işin içine çekilebilecek kişileri uyar ve gerekirse kullanıcı adını ve profil resmini değiştir.',
                        'Cihazının ele geçirildiğinden şüpheleniyorsan: ağ bağlantısını kes, kanıtları sakla ve parolaları temiz bir cihazdan değiştir. Şüpheli cihazda hassas hesaplara giriş yapma; gerekirse sistemi yeniden kur.',
                        'Taciz ediliyor ya da tehdit ediliyorsan: ekran görüntüsü al, kaydet ve hesap kimliklerini ve bir zaman çizelgesini not et. Tek başına buluşma. Güvendiğin birine söyle. Gerektiğinde polise ya da hukuki yardım kuruluşuna başvur.',
                        'Ruhsal olarak: ifşa edildikten ya da hedef alındıktan sonra düşülmesi en kolay tuzak kendini suçlamaktır. Bu senin suçun değil. Önce uyu, ye ve temel güvenliğini sağla; teknik sorunlarla sonra ilgilen.',
                    ],
                },
                {
                    type: 'p',
                    text: 'Bunu tek başına taşımak zorunda değilsin. Güvenli bir kanaldan güvendiğin bir yöneticiye, arkadaşa ya da destek kuruluşuna ulaş. Fiziksel güvenlik söz konusuysa önce yerel kolluk kuvvetlerine ya da profesyonel kurtarma ekiplerine başvur.',
                },
            ],
        },
        {
            id: 'body-safety',
            title: 'Fiziksel güvenlik: dövülüyorsan önce uzaklaş, ikna etmeye çalışma',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'Bir aile üyesi, sınıf arkadaşı ya da partner sana vuruyorsa, en önemli şey kazanmak değil, yaralanmayı azaltmak ve oradan çıkmaktır. Biri şiddete başvurduktan sonra ikna etmeye çalışmak, yalvarmak ya da tehdit etmek bunu tırmandırabilir. "Bunu bir daha yaparsan polisi ararım" özellikle tehlikelidir: polisi aramak bir eylemdir, bir replik değil.',
                },
                {
                    type: 'ul',
                    items: [
                        'Önce çıkışı bul: kapı nerede, önünü kim kesiyor, etrafından dolaşabilir misin? Sırtını kapıya dönme ve mutfakta, balkonda ya da merdivenin tepesinde köşeye sıkışmaya izin verme.',
                        'Başını ve boynunu koru: çeneni göğsüne çek, ensen ile kulaklarını kapat; yapabiliyorsan alçal ki başının vurulabilecek alanı küçülsün.',
                        'Bir silaha uzanma, peşinden gitme ve "onu döverek susturmaya" çalışma. Aranızda mesafe olunca uzaklaş.',
                        'İnsanlara, kameralara ve yetişkinlere doğru koş: bir dükkân, bir güvenlik kulübesi, bir sınıf, bir karakol. Çıkmaz sokaklara, şantiyelere ya da ıssız merdiven boşluklarına koşma.',
                        'Kaçamıyorsan: aranıza bir sandalye, çanta ya da battaniye koy ve yardım için bağırmaya devam et. Karşındaki durursa kıpırdama, çıkışı gözle ve yalnızca güvenli olduğunda hareket et; aniden kalkıp peşine düşme.',
                        'Sonrasında: önce olay yerinden ayrıl, güvendiğin birini bul, yaralarının fotoğrafını çek ya da kaydını tut ve hastaneye git. Yeniden dövülebileceksen eve tek başına gitme.',
                    ],
                },
                {
                    type: 'p',
                    text: 'Ortamında dövülmek tek seferlik değilse, kondisyon da güvenliğin bir parçasıdır. Sprintler patlayıcı hız kazandırır; hafif koşu dayanıklılık kazandırır. Amaç bir kavgayı kazanmak değil, mesafe yaratmak ve insanların sana yardım edebileceği bir yere ulaşmaktır. Gerçekten koşman gerekirse: önce aradaki farkı açmak için 20–40 metre son hızla koş, sonra sürdürebileceğin bir tempoya geç. Hafif bir koşuyla başlama ve yeniden dövülebileceğin bir eve koşarak geri dönme.',
                },
                {
                    type: 'ul',
                    items: [
                        'Sprintler: haftada iki kez, 20–40 m × 4–6 tekrar; tekrarlar arasında başlangıç noktasına yürüyerek dön ve tamamen dinlen; bunu her gün yapma.',
                        'Hafif koşular: haftada 2–3 kez, konuşabileceğin bir tempoda 20–30 dakika; yavaş yavaş 40 dakikaya çıkar.',
                        'Temel kuvvet: squat, lunge, baldır kaldırma, plank; her biri 2–3 set.',
                        'Önce 5–10 dakika ısın. Astımın, bir kalp rahatsızlığın ya da eklem sakatlığın varsa önce bir doktora danış. Issız ya da tehlikeli güzergâhlarda antrenman yapma ve yığılana kadar çalışma.',
                    ],
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Antrenman kaçmak içindir, kavga etmek için değil. "Kavgayı bitiren tek hamle" çalışma ve karşındakine meydan okuma. Korkmadığını kanıtlamak zorunda değilsin.',
                },
                {
                    type: 'p',
                    text: 'Açıldığın için, kimliğin yüzünden, ilaç yüzünden ya da "düzeltilmeyi" reddettiğin için dövülüyorsan: bu senin suçun değil ve "yeterince dikkatli olmadığın" için de değil. Mümkün olan en kısa sürede bir güvenlik planı yap: kimlik belgeleri, ilaçlar, para, yedek bir telefon, güvendiğin yetişkinlerin telefon numaraları ve geçici olarak kalabileceğin bir yer.',
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: '"Polisi ararım"ı tehdit olarak söyleme. Karşındaki zaten öfkeliyse o cümle hemen daha sert dövülmene yol açabilir. Gerçekten arayacaksan güvenli bir yerden ara ya da başka birinden senin yerine aramasını iste.',
                },
                {
                    type: 'p',
                    text: 'Zaten yaralandıysan ve baş dönmesi, kusma, bulanık görme, kulaktan ya da burundan kanama, göğüs ağrısı, nefes darlığı, bilinç bulanıklığı ya da geçmeyen karın ağrısı fark edersen hemen tıbbi yardım al; tek başına uyuma.',
                },
            ],
        },
        {
            id: 'advanced-overview',
            title: 'Yüksek riskli durumlar için genel ilkeler',
            level: 'advanced',
            blocks: [
                {
                    type: 'p',
                    text: 'Aşağıdakiler ilkelerdir, adım adım bir kılavuz değil. Sistemli olarak hedef alınıyorsan, takip ediliyorsan ya da fiziksel tehlike altındaysan önce profesyonel kuruluşlara ve hukuki yardıma başvur; tek başına hareket etme.',
                },
                {
                    type: 'ul',
                    items: [
                        'Kimliği ve cihazı ayır: hassas etkinlikler için farklı bir cihaz, hesap ve ağ kullan ve iki tarafı birbirine bağlayan iz bırakma.',
                        'Bilgiyi yalnızca gerektiği kadar ver: amaç için gereken en azını sağla. "Önce gizliliğini teslim et, sonra yardım ederim" türünden her isteği reddet.',
                        'Bölmelere ayır: gerçek kimliğini, topluluk kimliğini, paranı ve sosyal çevreni ayrı tut. Bir bölme sızarsa su ötekilere ulaşmasın.',
                        'Ele geçirildiğini varsay: bir parolayı değiştirip işi bitmiş sayma. Dört hattı ayrı ayrı kontrol et: hesaplar, cihazlar, ağ ve para.',
                        'Önce kanıtı sakla: tehdit edildiğinde ekran görüntülerini, sohbet kayıtlarını, e-posta başlıklarını ve transfer kayıtlarını kaydet, şifreli olarak yedekle ve gerekirse bir zaman çizelgesi çıkar.',
                        'Ruhsal destek al: ifşa edildikten ya da hedef alındıktan sonra en yaygın tuzak kendine saldırmaktır. Erkenden güvendiğin birine ulaş.',
                        'Acil durumlara hazırlan: kimlik belgelerine, ilaçlara ve paraya nasıl ulaşacağına önceden karar ver ki bir krizde hızlı hareket edebilesin.',
                    ],
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: 'Kolluk kuvvetleriyle muhatap olurken: yalan söyleme, az konuş ve avukat iste. Yalan söylememek sana fazladan bir şeye mal olmaz; uydurmak ise her şeye mal olabilir. Bu rehber asla belge sahteciliğini, yetkili taklidi yapmayı ya da yasal süreçleri engellemeyi önermez.',
                },
            ],
        },
        {
            id: 'advanced-targeted',
            title: 'Sistemli olarak hedef alındığında',
            level: 'advanced',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        'Onlarla doğrudan yüzleşme. Bir takipçiyle tek başına buluşma, "karşı hack" yapma ve herkesin önünde kavga ayarlama. Fiziksel güvenlik önce gelir.',
                        'Düzeni boz. Okul ya da iş yolunu, programını ve düzenli gittiğin yerleri değiştir. Sosyal medyada konumunu anlık paylaşma.',
                        'Yakın çevreni koru. Ailene ve arkadaşlarına bilgilerini yabancılara vermemelerini söyle. Yalnızca güvendiğin kişilerin bildiği bir parola kelime belirleyin.',
                        'Dijital ayak izini temizle: eski hesaplar, eski gönderiler, eski e-posta adresleri, eski telefon numaraları. Silebildiğini sil; silemediğinin görünürlüğünü azalt.',
                        'Cihazlarını incele. Olağandışı pil tüketimine, ısınmaya, veri kullanımına, bilinmeyen uygulamalara ve yapılandırma profillerine dikkat et. Gerekirse güvendiğin bir uzmana kontrol ettir.',
                        'Dışarıdan destek bul: hukuki yardım, sosyal hizmetler, ruh sağlığı desteği, yerel LGBTİ+ ya da trans destek örgütleri. Bunu tek başına taşıma.',
                    ],
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Yasa dışı yollarla "ateşe ateşle karşılık verme" ya da karşılık vermek için kimlik uydurma. Bu seni daha büyük bir riske sokar ve gerçekten yardıma ihtiyacı olan insanlara inanılmasını zorlaştırır.',
                },
            ],
        },
        {
            id: 'transmasc',
            title: 'Trans erkekler: gözden kaçan diğer yarı',
            level: 'advanced',
            blocks: [
                {
                    type: 'p',
                    text: 'Bu rehber başlangıçta trans kadınlara ağırlık veriyordu; trans erkeklerin ihtiyaçları yalnızca "tersi" değildir. Trans erkekler sağlık sisteminde gözden kaçabilir, "yeterince trans değil" diye görülebilir ya da yanlış teşhis alabilir ve göğüs bağlama, testosteron, jinekolojik bakım ve gebelik riski konusunda bambaşka sorunlarla karşılaşabilir.',
                },
                {
                    type: 'ul',
                    items: [
                        'Göğüs bağlama: bedenine uygun bir binder kullan, elastik bandaj ya da bant değil. İlk seferde 2–4 saatle başla ve günde 8–12 saati aşma. Uyurken, spor yaparken ya da yüzerken takma. Göğüs ağrısı, nefes darlığı, kaburga ağrısı ya da ciltte yara olursa hemen bırak. Bir beden muayenesi ya da göğüs röntgeni çıkarmanı gerektirebilir; önceden sor.',
                        'Packing ve STP: önce hijyen, yani düzenli temizle ve paylaşma. Rahatsız ya da zahmetliyse packing yapmak zorunda değilsin; geçmek bir zorunluluk değildir.',
                        'Testosteron: yalnızca düzenli tıbbi bakım yoluyla. Ses, vücut kılları, kaslar, adet, klitoris, kan yağları ve hematokrit değişir; düzenli takip gerekir. Dozu kendi başına artırma ya da kaynağı belirsiz ilaç kullanma.',
                        'Doğurganlık ve gebelik: testosteron doğum kontrol yöntemi değildir; trans erkekler yine de hamile kalabilir. Doğum kontrolüne, doğurganlığın korunmasına ya da jinekolojik bakıma ihtiyacın varsa ihtiyaçlarını ve bedenini doktora açıkça anlat.',
                        'Jinekolojik bakım: smear ve HPV testleri, cinsel yolla bulaşan enfeksiyon testleri ve meme ile pelvik muayeneler trans dostu bir doktorla ayarlanabilir. Adını ve bedenin için kullandığın sözcükleri önceden açıklayabilirsin; gerginsen yanında birini götür.',
                        'Adet baskılama: bir doktorla konuş; kaynağı belirsiz hormonlar, bitkisel çözümler ya da aşırı diyetler kullanma.',
                        'Ses, saç ve sakal: ses eğitiminin, saç kesimlerinin ve minoksidilin her birinin kendi riskleri vardır; minoksidil kediler için zehirlidir, bu yüzden kullanmadan önce kontrol et; kanıtlanmamış yöntemler kullanma.',
                        'Tuvaletler ve güzergâhlar: yerel yasaları ve çevreni kontrol et; daha güvenli güzergâhlar seç ve mümkünse biriyle git; durdurulursan kimseyle yüzleşme, oradan ayrıl.',
                    ],
                },
                {
                    type: 'p',
                    text: 'Trans erkekler çoğu zaman "görünmezdir": insanlar seni trans erkek olarak algılamayabilir ya da "sadece erkek fatma" sanabilir. Bu bir örtü olabilir ama yalnızlaştırıcı da olabilir. Okulda soran olursa "erkek fatma, androjen tarz"ı kalkan olarak kullanabilirsin; bu kıyafeti açıklar, bedenini ya da tıbbi bakımını değil. Belirli cümleler için "Sınıf arkadaşların sorduğunda" bölümüne bak. Topluluk bul, senden önce bu yoldan geçmiş trans erkekler bul ve trans dostu doktorlar bul; her soruyu içine atıp tek başına taşıma.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: '"Daha iyi geçmek" için tehlikeli şeyler yapma: aşırı göğüs bağlama, iğne paylaşmak, karaborsa testosteron, aşırı diyet ya da egzersiz veya göğsünü bantlamak. Bunlar kalıcı zarara yol açabilir.',
                },
                {
                    type: 'p',
                    text: 'Hem trans erkek hem de reşit değilsen: tıbbi onam, aile desteği, okul kayıtları ve yasal belgeler daha karmaşık olabilir. Yerel kuruluşlara, bir avukata ya da sosyal hizmet uzmanına başvur; belge sahteciliği yapma.',
                },
                {
                    type: 'p',
                    text: 'Bu bölüm tıbbi tavsiye değildir; hormonlar, ameliyatlar ve testler doktoruna ve yerel kılavuzlara tabidir.',
                },
            ],
        },
        {
            id: 'extended-math',
            title: 'Matematik özeti: entropi, varyans, korelasyon ve karşılıklı bilgi',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'Bu bölüm yalnızca "bu nicelik ne soruyor?" sorusunu yanıtlar. Hiçbir şey türetmen gerekmez. Bir formül göze itici geliyorsa her paragrafın ilk cümlesini oku ve devam et. Bu fikirler esas olarak belirsizliği, benzerliği ve bir ilişkinin gücünü anlatmakta işe yarar.',
                },
                {
                    type: 'p',
                    text: 'Shannon entropisi bir rastgele değişkenin ne kadar belirsiz olduğunu ölçer. Adil bir madeni paranın entropisi bir bittir; her zaman aynı değeri alan bir değişkeninki sıfırdır. Entropi ne kadar yüksekse değeri tahmin etmek o kadar zordur.',
                },
                {
                    type: 'math',
                    text: 'H(X) = -\\sum_{x} p(x)\\log_2 p(x)',
                    caption: 'Shannon entropisi: olasılıklar ne kadar yayılmışsa belirsizlik o kadar fazladır.',
                },
                {
                    type: 'p',
                    text: "Anonimlik kümeleri de entropiyle anlatılabilir. Bir saldırgan N adayın eşit olasılıklı olduğunu düşünüyorsa anonimlik kümesinin entropisi log2 N'dir; aday kümesi her yarıya indiğinde bir bit kaybedilir.",
                },
                {
                    type: 'math',
                    text: 'H_{\\text{anon}} = \\log_2 N',
                    caption: 'Tekdüze anonimlik kümesi: aday ne kadar çoksa entropi o kadar fazladır.',
                },
                {
                    type: 'p',
                    text: "Karşılıklı bilgi, Y'yi bilmenin X hakkındaki belirsizliği ne kadar azalttığını ölçer. X ile Y bağımsızsa sıfırdır, Y X'i tamamen belirliyorsa X'in entropisine eşittir. Bu istatistiksel bir bağımlılıktır, nedenselliğin kanıtı değil.",
                },
                {
                    type: 'math',
                    text: 'I(X;Y) = \\sum_{x,y} p(x,y)\\log_2\\frac{p(x,y)}{p(x)p(y)}',
                    caption: 'Karşılıklı bilgi: iki değişkenin ne kadar bilgi paylaştığı.',
                },
                {
                    type: 'p',
                    text: 'Varyans, değerlerin ortalamaları etrafında ne kadar yayıldığını ölçer. Kovaryans, iki değişkenin birlikte hareket etme eğiliminde olup olmadığını ölçer. Pearson korelasyon katsayısı, -1 ile 1 aralığına normalleştirilmiş kovaryanstır.',
                },
                {
                    type: 'math',
                    text: '\\operatorname{Var}(X)=\\mathbb{E}[(X-\\mu)^2],\\qquad \\rho_{X,Y}=\\frac{\\operatorname{Cov}(X,Y)}{\\sigma_X\\sigma_Y}',
                    caption: 'Varyans, kovaryans ve Pearson korelasyon katsayısı.',
                },
                {
                    type: 'p',
                    text: 'Pearson yalnızca doğrusal ilişkileri yakalar. İki değişken doğrusal olmayan biçimde güçlü bir şekilde ilişkili olup yine de sıfıra yakın bir r değerine sahip olabilir. Korelasyon nedensellik de değildir. Trafik analizinde saldırgan çoğu zaman bir giriş akışını bir çıkış akışıyla eşleştirmek için zamanlamayı, paket boyutlarını ve yönü karşılaştırır; bu, benzerlik ve korelasyonun pratik bir uygulamasıdır.',
                },
                {
                    type: 'warn',
                    kind: 'note',
                    text: 'Formüller sihir değildir. Örneklem yanlılığı, zaman aralığı, ön işleme ve yan bilgiler sonucu değiştirebilir. "İstatistiksel olarak anlamlı" gördüğünde örneklemin nereden geldiğini, hangi varsayımların yapıldığını ve başka bir açıklamanın uyup uymadığını sor.',
                },
            ],
        },
        {
            id: 'extended-rsa',
            title: "RSA: tam sayı çarpanlarına ayırma ve Euler'in totient fonksiyonu",
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: "RSA bir asimetriye dayanır: iki büyük asal sayıyı çarpmak kolaydır ama çarpımı yeniden o asallara ayırmak zordur. Açık anahtar n modülünü içerir; özel anahtar n'nin çarpanlarını bilmeye dayanır.",
                },
                {
                    type: 'math',
                    text: 'n=pq,\\qquad \\varphi(n)=(p-1)(q-1)',
                    caption: "RSA modülü ve Euler'in totient fonksiyonu; p ve q büyük asallardır.",
                },
                {
                    type: 'p',
                    text: "Euler'in totient fonksiyonu φ(n), 1'den n'ye kadar olan ve n ile aralarında asal olan tam sayıları sayar. RSA bir açık üs e seçer ve φ(n) modülüne göre onun tersi olan özel üs d'yi hesaplar.",
                },
                {
                    type: 'math',
                    text: 'e d \\equiv 1 \\pmod{\\varphi(n)}',
                    caption: 'Açık üs ile özel üs arasındaki ilişki.',
                },
                {
                    type: 'p',
                    text: "Şifreleme ve şifre çözme modüler üs almadır. Formüller basit görünür; zor olan, p ve q olmadan n'den d'yi verimli biçimde hesaplayamamaktır.",
                },
                {
                    type: 'math',
                    text: 'c \\equiv m^e \\pmod n,\\qquad m \\equiv c^d \\pmod n',
                    caption: 'Ders kitabı RSA şifrelemesi ve şifre çözmesi; gerçek sistemler dolgu eklemelidir.',
                },
                {
                    type: 'p',
                    text: "Hesabın işlemesinin bir nedeni Euler teoremidir: a ile n aralarında asalsa, a'nın φ(n). kuvveti n modülüne göre 1'e denktir.",
                },
                {
                    type: 'math',
                    text: 'a^{\\varphi(n)} \\equiv 1 \\pmod n \\quad (\\gcd(a,n)=1)',
                    caption: 'Euler teoremi.',
                },
                {
                    type: 'p',
                    text: 'Klasik bilgisayarlardaki en iyi genel amaçlı çarpanlara ayırma algoritmaları, örneğin sayı cismi eleği, polinom değil alt üstel zamanlıdır. 2048 ya da 3072 bitlik RSA klasik olarak hâlâ güvenli kabul edilir ama bu "sonsuza dek güvenli" ile aynı şey değildir: kısa anahtarlar, uygulama hataları ve kötü rastgelelik zor bir matematik problemini bir mühendislik başarısızlığına dönüştürebilir.',
                },
                {
                    type: 'p',
                    text: "Shor algoritması, yeterince büyük ve hataya dayanıklı bir kuantum bilgisayarda büyük tam sayıları çarpanlarına ayırabilir ve ayrık logaritmaları polinom zamanda hesaplayabilir. Yalnızca RSA'yı değil, Diffie-Hellman, ECDH, ECDSA, EdDSA ve ilgili şemaları da tehdit eder.",
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: "RSA'yı kendin uygulama ve mesajları ders kitabı RSA'sıyla şifreleme. OAEP gibi bir dolgu olmadan RSA deterministik ve değiştirilebilirdir; imzalar da PSS gibi uygun bir şemaya ihtiyaç duyar. Kendi dolgunu icat etmek yerine denetlenmiş kütüphaneler ve protokoller kullan.",
                },
            ],
        },
        {
            id: 'extended-ecc',
            title: 'ECC ve Shor: eliptik eğriler neden kuantum bilgisayarlardan da korkar',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'Eliptik eğri kriptografisi (ECC) "daha çok adımlı RSA" değildir. Farklı bir zor problem kullanır: sonlu bir cisim üzerindeki eliptik eğrinin noktalarından oluşan grupta, P ve Q=kP verildiğinde k skalerini bulmak zordur. Bu, eliptik eğri ayrık logaritma problemidir (ECDLP).',
                },
                {
                    type: 'math',
                    text: 'y^2 \\equiv x^3 + ax + b \\pmod p',
                    caption: 'Sonlu bir cisim üzerinde bir eliptik eğri (tekil olmama koşuluyla).',
                },
                {
                    type: 'math',
                    text: 'Q = kP',
                    caption: "Skaler çarpım; P ve Q'dan k'yi geri elde etmek ECDLP'dir.",
                },
                {
                    type: 'p',
                    text: "Zorluk daha yoğun olduğu için ECC, çok daha kısa anahtarlarla RSA'ya denk klasik güvenliğe ulaşır. Bu yüzden telefonlarda, TLS'te, Signal'de ve blok zinciri cüzdanlarında her yerdedir. Ama Shor algoritması ayrık logaritmaları da çözer; eliptik eğriler kendiliğinden kuantum sonrası güvenli değildir.",
                },
                {
                    type: 'p',
                    text: "Shor'un özünde periyot bulma vardır. N'yi çarpanlarına ayırmak için N ile aralarında asal bir a seç ve a'nın N modülüne göre kuvvetlerinin r periyoduna bak:",
                },
                {
                    type: 'math',
                    text: 'f(x)=a^x \\bmod N,\\qquad f(x+r)=f(x)',
                    caption: 'Shor, çarpanlara ayırmayı bir periyot bulma problemine dönüştürür.',
                },
                {
                    type: 'p',
                    text: "Kuantum Fourier dönüşümü r'yi verimli biçimde bulabilir. r bilindiğinde bir en büyük ortak bölen hesabı N'nin çarpanlarını verebilir.",
                },
                {
                    type: 'math',
                    text: '\\gcd(a^{r/2}\\pm 1, N)',
                    caption: 'Periyot bilindikten sonraki klasik son işlem (yeniden denemek gerekebilir).',
                },
                {
                    type: 'p',
                    text: "Grover algoritması çoğu zaman Shor ile birlikte anılır ama yapısız arama için yalnızca karekök kadar hızlanma sağlar. Esas olarak simetrik anahtarların ve hash'lerin güvenlik payını etkiler; Shor'un yaptığı gibi RSA'yı ya da ECC'yi doğrudan kırmaz.",
                },
                {
                    type: 'p',
                    text: 'Kuantum sonrası geçiş bir eklenti değildir. Güncel yönelimler arasında ML-KEM (Kyber), ML-DSA (Dilithium) ve SLH-DSA (SPHINCS+) gibi standartlar ile klasik ve kuantum sonrası algoritmaları birleştiren hibrit şemalar vardır. Geçiş protokollere, sertifikalara, kütüphanelere ve donanıma dokunur; bu yüzden yıllar sürer.',
                },
                {
                    type: 'warn',
                    kind: 'note',
                    text: '"Kuantuma dayanıklı" bir geçiş sürecidir, bir coin ya da uygulama kullandığı için güvenebileceğin bir etiket değil. Bir proje bunu iddia ettiğinde hangi katmanın değiştirildiğini, hangi anahtar ve imza şemalarının kullanıldığını ve bağımsız bir denetim yapılıp yapılmadığını sor.',
                },
            ],
        },
        {
            id: 'extended-tor',
            title: 'Tor: giriş, çıkış ve köprü değiştirme',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'Tor trafiği bir giriş koruyucusu, bir orta aktarıcı ve bir çıkıştan oluşan bir devreye yerleştirir. Her aktarıcı yalnızca komşu atlamayı bilir; normal durumda hiçbir aktarıcı hem kim olduğunu hem de nereye gittiğini bilmez.',
                },
                {
                    type: 'p',
                    text: 'Anonimlik mutlak değildir. Aynı karşı taraf hem girişini hem de çıkışını kontrol ediyor ya da gözlemliyorsa ve zamanlamayı, paket boyutlarını ve yönü ilişkilendirebiliyorsa devrenin iki ucunu eşleştirebilir. Bu bir uçtan uca korelasyon saldırısıdır. İki ucu kontrol etmek her seferinde başarıyı garanti etmez ama riski önemli ölçüde artırır.',
                },
                {
                    type: 'p',
                    text: 'Uzun süreli bir giriş koruyucusu tutmak kötü niyetli bir koruyucuyu tekrar tekrar seçme olasılığını azaltır ama aynı koruyucunun uzun süre gözlemlenmesi karşı tarafa daha çok örnek de verir. Köprüler esas olarak sansürü aşmak içindir; aynı köprüyü uzun süre kullanmak onu listelemeyi, engellemeyi ya da ilişkilendirmeyi kolaylaştırabilir. Köprüleri değiştirmek ve takılabilir taşıma yöntemleri kullanmak bu riski azaltabilir ama koruyucu güvenlik modelini zayıflatacak kadar sık değiştirme.',
                },
                {
                    type: 'p',
                    text: 'Tor ağdaki kaynağını gizler, tarayıcı parmak izini değil. Aynı hesaba giriş yapmak, aynı dili, saat dilimini, yazı tiplerini kullanmak, dosya indirip açmak ya da ayırt edici bir metin bloğu yapıştırmak iki ziyareti birbirine bağlayabilir.',
                },
                {
                    type: 'p',
                    text: "Bir çıkış aktarıcısı şifrelenmemiş HTTP'yi, DNS'i ve bazı düz metin protokollerini görebilir. HTTPS içeriği korur ama alan adları, zamanlama ve trafik boyutu yine de sızabilir. Daha güçlü korumaya ihtiyacın varsa yalnızca Tor'a güvenmek yerine uçtan uca şifreli bir uygulama protokolü kullan.",
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Tor bir gizlilik aracıdır, suç aracı değil. Gazetecileri, hayatta kalanları, azınlıkları ve gündelik hayatını yaşayan sıradan insanları korur. Onu dolandırıcılık, taciz ya da yasal denetimden kaçmak için kullanırsan sonuçlarına sen katlanırsın.',
                },
            ],
        },
        {
            id: 'extended-i2p',
            title: 'I2P ve Sybil saldırıları',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'I2P sarımsak yönlendirmesi kullanır: bir mesaj birden çok şifreli "diş" içerebilir ve tek yönlü tünellerden geçer. Varsayılan olarak sıradan internete bir çıkış sağlamaz; daha çok iç hizmetlere (eepsite\'lar) ve eşler arası uygulamalara yöneliktir.',
                },
                {
                    type: 'p',
                    text: 'Sybil saldırısı, karşı tarafın seçilme olasılığını artırmak için çok sayıda sahte kimlik ya da düğüm oluşturmasıdır. Karşı taraf ne kadar çok düğüm kontrol ederse ya da seçim algoritması ne kadar tahmin edilebilirse, bir tünelde ya da dağıtık bir hash tablosunun kilit konumlarında tekrar tekrar görünmesi o kadar kolaylaşır ve korelasyon, engelleme ya da tutulma saldırıları mümkün olur.',
                },
                {
                    type: 'math',
                    text: 'P_{\\text{all-adversary}} \\approx f^L',
                    caption:
                        "Basitleştirilmiş model: karşı taraf düğümlerin f oranını kontrol eder ve tünelin uzunluğu L'dir; gerçek seçim daha karmaşıktır ama çeşitlilik yine de önemlidir.",
                },
                {
                    type: 'p',
                    text: 'Savunmalar arasında iş kanıtı, stake etme, itibar, düğüm çeşitliliği, floodfill kısıtlamaları, daha uzun tüneller ve daha iyi eş seçimi vardır. Hiçbiri Sybil saldırılarını tamamen ortadan kaldırmaz; yalnızca maliyeti artırır ve merkezileşmeyi azaltır.',
                },
                {
                    type: 'p',
                    text: 'I2P "geliştirilmiş bir Tor" değildir. Amaçları farklıdır: Tor genel amaçlı bir çıkış vekiline daha yakınken I2P daha çok bir iç karanlık ağdır. Hangisini kullanacağın neye ulaşman gerektiğine, tehdit modeline ve daha küçük bir ekosistemi kabul edip edemeyeceğine bağlıdır.',
                },
                {
                    type: 'warn',
                    kind: 'note',
                    text: '"Daha çok düğüm" kendiliğinden "daha güvenli" demek değildir. Karşı taraf bulut sunucuları kiralayabilir, toplu kayıt yapabilir ve uzun süre pusuda bekleyebilir. Bir ağın Sybil saldırılarına dayanıp dayanamayacağı yalnızca düğüm sayısına değil, kimlik maliyetine, seçim algoritmalarına ve merkeziyetsizliğe bağlıdır.',
                },
            ],
        },
        {
            id: 'extended-dcnet',
            title: 'DC-Net, engelleme saldırıları ve Freenet',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: "DC-Net (Dining Cryptographers) bilgi kuramsal anonimliği hedefler: protokolün varsayımları geçerli olduğu sürece sınırsız hesaplama gücüne sahip bir karşı taraf bile mesajı kimin gönderdiğini anlayamaz. Katılımcılar ikili anahtarlar paylaşır ve maskelenmiş değerler yayınlar; tüm değerler XOR'landığında herkesin maskeleri birbirini götürür ve yalnızca gönderenin mesajı kalır.",
                },
                {
                    type: 'math',
                    text: 'M_i = m_i \\oplus \\bigoplus_{j\\ne i} k_{ij}',
                    caption: "Her katılımcı mesajını paylaşılan tüm anahtarlarla XOR'layıp yayınlar.",
                },
                {
                    type: 'math',
                    text: '\\bigoplus_i M_i = \\bigoplus_i m_i',
                    caption:
                        "Tüm yayınları XOR'lamak ikili anahtarları götürür; yalnızca bir kişi gönderdiyse geriye yalnızca o mesaj kalır.",
                },
                {
                    type: 'p',
                    text: '"Bilgi kuramsal güvenlik" "kullanımda güvenli" demek değildir. Güvenli ikili kanallara, dürüst katılımcılara, güvenilir yayına ve gizli anlaşma olmamasına bağlıdır. Bu varsayımlar gerçek dünyada kolayca bozulur.',
                },
                {
                    type: 'p',
                    text: "Engelleme saldırısı DC-Net'in klasik zayıflığıdır: kötü niyetli bir katılımcı göndermeyi reddeder, bozuk veri gönderir ya da sürekli kesintiye uğratarak protokolün tamamlanmasını önler. En iyi ihtimalle bu bir hizmet engellemedir; en kötüsünde tekrarlanan denemeler ve zamanlama farkları anonimlik kümesini küçültür. Suçlama protokolleri, anonim tespit, zaman aşımları ve yedeklilik yardımcı olabilir ama karmaşıklığı ve maliyeti artırır.",
                },
                {
                    type: 'p',
                    text: "Freenet'in iki bağlantı modu vardır. OpenNet düğümlerin yabancılarla bağlanmasına izin verir: katılmak kolaydır ve ağ daha büyüktür ama Sybil saldırılarına, trafik analizine ve kötü niyetli içeriğe daha açıktır. DarkNet yalnızca güvendiğin kişilere bağlanır: dışarıdakilere karşı daha dayanıklıdır ama daha küçüktür ve güven ağı üzerinden sızmaya, sosyal mühendisliğe ve kademeli anonimlik kaybına karşı savunmasızdır.",
                },
                {
                    type: 'p',
                    text: 'Modern tehdit modellerinde OpenNet güçlü anonimlik için uygun değildir. DarkNet de "kesinlikle güvenli" değildir: uzun süreli trafik korelasyonu, içerik parmak izleri, kötü niyetli dosyalar, el konulan düğümler, sohbet kayıtları ve insan hatası "anonim"i yeniden "bağlantılı"ya çevirebilir.',
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: "DC-Net'in bilgi kuramsal garantisi protokol hakkında bir ifadedir, belirli bir istemcinin ya da eklentinin onaylanması değil. Uygulamadaki, kimlik doğrulamadaki, yayın katmanındaki ya da meta verilerdeki bir hata kâğıt üzerindeki güvenliği boşa çıkarabilir.",
                },
            ],
        },
        {
            id: 'extended-monero',
            title: 'Monero çoklu imza ve anonimlik',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'Monero gizliliği varsayılan olarak protokolün içine koyar: halka imzalar kimin harcadığını, gizli adresler kimin aldığını ve RingCT ne kadar harcandığını gizler. Bu, şeffaf bir deftere sonradan karıştırıcı eklemekten çok varsayılan gizliliğe yakındır.',
                },
                {
                    type: 'p',
                    text: 'Halka imza, doğrulayıcının bir kümedeki anahtarlardan birinin imzaladığını bilmesini sağlar ama hangisi olduğunu değil. Daha büyük bir halka daha büyük bir aday kümesi demektir ama nitelik boyuttan daha önemlidir: tuzaklar kolayca ayırt edilebiliyorsa etkili anonimlik kümesi küçülür.',
                },
                {
                    type: 'math',
                    text: '\\operatorname{Verify}(\\sigma,\\{P_1,\\ldots,P_n\\})=1',
                    caption:
                        'Halka imza: doğrulama yalnızca n açık anahtardan birinin imzaladığını gösterir, hangisi olduğunu değil.',
                },
                {
                    type: 'p',
                    text: "Aynı çıktının iki kez harcanmasını önlemek için Monero bir anahtar görüntüsü kullanır. Bu, özel anahtardan ve karşılık gelen açık anahtarın hash'inden türetilir. Doğrulayıcılar daha önce görünüp görünmediğini kontrol edebilir ama ondan özel anahtarı elde edemez.",
                },
                {
                    type: 'math',
                    text: 'I = k\\,\\mathcal{H}_p(P)',
                    caption:
                        'Basitleştirilmiş anahtar görüntüsü; gerçek yapı alan ayrımı ve başka ayrıntılar da içerir.',
                },
                {
                    type: 'p',
                    text: 'Çoklu imza farklı bir sorunu çözer: N anahtarın M tanesi fonları birlikte kontrol eder ve harcamak için en az M imza gerekir. Ortak saklama, emanet, kurum hazineleri ve tek bir anahtarın çalınma riskini azaltmak için yararlıdır. Çoklu imza tek başına bir işlemi daha anonim yapmaz; değiştirdiği şey anahtar yönetimidir, defterin görünürlüğü değil.',
                },
                {
                    type: 'p',
                    text: 'Monero mutabakat için iş kanıtı (RandomX) kullanır. Bitcoin de iş kanıtı kullanır ama Bitcoin\'in defteri şeffaftır ve adresleri anonim değil takma adlıdır. Bir "gizlilik coin\'ini" yasal bir kalkan saymak tehlikelidir: borsalar yatırımları reddedebilir ya da varlıkları dondurabilir ve KYC, IP ve zamanlama verileriyle birleşen zincir analizi seni yine de bulabilir.',
                },
                {
                    type: 'p',
                    text: 'Çoklu imzanın riskleri arasında kayıp anahtarlar, sahipler arasında gizli anlaşma, uygulama hataları, koordinasyon sırasındaki meta veriler ve karmaşık kurtarma vardır. Önce küçük bir tutarla dene; ciddi para emanet etmeden önce adreslerin, imzalamanın ve yedeklerin hepsinin geri yüklenebildiğini doğrula.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: '"Varsayılan olarak gizli" "izlenemez" demek değildir. Zincir üstü gizlilik yalnızca zincir üstündeki kısmı kapsar. Borsa KYC\'si, ağ meta verileri, cüzdan yedekleri, sohbet kayıtları ve insan hatası, bir kişiyi tanımlamak için çoğu zaman kriptografiyi kırmaktan çok daha kolay yollardır.',
                },
            ],
        },
        {
            id: 'extended-consensus',
            title: 'PoW, PoS, PoA ve Bitcoin neden izlenebilir',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: "Bir mutabakat mekanizması sonraki bloğu kimin yazabileceğine karar verir. İşlemlerin gizli olup olmadığına karar vermez. PoW'u, PoS'u ya da PoA'yı bir gizlilik özelliğiyle karıştırmak kriptodaki en yaygın kategori hatalarından biridir.",
                },
                {
                    type: 'p',
                    text: 'İş kanıtı (PoW) blok üretme hakkı için bilgi işlem gücü ve enerjiyle yarışır; zinciri yeniden düzenlemek için saldırganın hash gücünün büyük bir payına sahip olması gerekir. Hisse kanıtı (PoS) önericileri ve onaylayıcıları stake edilen ekonomik değerle seçer ve kötü davranış için kesinti (slashing) uygular. Yetki kanıtı (PoA) yetkilendirilmiş doğrulayıcılar kullanır; konsorsiyum zincirlerine ya da test ağlarına uyar ama daha merkezi bir güven modeline sahiptir.',
                },
                {
                    type: 'math',
                    text: '\\mathbb{E}[T_{\\text{PoW}}]=\\frac{D}{h},\\qquad P_i^{\\text{PoS}}=\\frac{s_i}{\\sum_j s_j}',
                    caption:
                        "Basitleştirilmiş sezgi: PoW blok süresi zorluğa ve hash oranına bağlıdır; PoS'ta seçilme olasılığı stake payına bağlıdır.",
                },
                {
                    type: 'p',
                    text: "Pek çok gizlilik coin'i gerçekten PoW kullanır: bazıları ön madenciliği ve ICO merkezileşmesini önlemek istedi, bazıları ASIC direnci istedi (örneğin Monero'nun RandomX'i), bazıları ise bu seçimi yalnızca devraldı. Ama \"PoW coin'lerinin çoğu gizlilik coin'idir\" yanlıştır; PoW projelerinin büyük çoğunluğu gizlilik coin'i değildir. Korelasyon nedensellik değildir.",
                },
                {
                    type: 'p',
                    text: "Bitcoin anonim değil, takma adlıdır. UTXO defteri herkese açık, kalıcı ve izlenebilirdir. Zincir analizi genellikle ortak girdi sahipliğini (birlikte harcanan adresler tek bir cüzdana ait olabilir), para üstü adreslerini, zamanlamayı, tutar desenlerini, adreslerin yeniden kullanımını, borsa KYC'sini, IP ve düğüm gözlemini ve zincir dışı sohbet kayıtlarını kullanır. Bunlardan birkaçı örtüşürse bir takma ad bir insana dönüşebilir.",
                },
                {
                    type: 'p',
                    text: 'İnsanlar bazen sorar: Ethereum PoS olduğuna göre adresleri dondurulmaktan kurtulamaz mı? Daha doğrusu: Ethereum protokolünde banka tarzı bir "bu adresi dondur" düğmesi yoktur ama dondurma ve sansür pek çok katmanda gerçekleşebilir. Doğrulayıcılar ve aktarıcılar bir işlemi eklemeyi reddedebilir; stake edilen fonlar kesintiye uğrayabilir; USDC ve USDT gibi stabil coin sözleşmeleri ihraççının talimatıyla bakiyeleri dondurabilir; borsalar yatırma ve çekmeleri dondurabilir; köprüler durabilir; RPC sağlayıcıları ve ön yüzler erişimi engelleyebilir. PoS dondurmaya karşı bir sihir değildir.',
                },
                {
                    type: 'p',
                    text: 'PoS kesinliği yeniden düzenlemeleri pahalı hâle getirir ama bu yalnızca zincir düzeyinde geri almanın zor olduğu anlamına gelir; her adresin koşulsuz işlem yapabileceği anlamına gelmez. Sansür direnci protokolün, ekonominin ve sosyal katmanın birleşik bir özelliğidir, bir mutabakat algoritmasının tek bir özelliği değil.',
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: 'Bir tehdit modeli kurarken "mutabakat mekanizması"nı "gizlilik" ya da "sansür direnci" ile eş anlamlı sayma. Zincir analizini, borsa uyumunu, stabil coin ihraççılarını, RPC sağlayıcılarını, cüzdan ön yüzlerini, ağ katmanını ve kendi kullanım alışkanlıklarını da düşünmen gerekir.',
                },
            ],
        },
        {
            id: 'extended-high-threat',
            title: 'Yüksek tehdit ortamları: önce bunu oku',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'Bu grup "daha ileri bir güvenlik rehberi" değil, "maliyeti yüksek istisna"dır. Yalnızca internette geziniyor, okula gidiyor ve ilacını alıyorsan yukarıdaki temel bölümler yeterlidir. Buradaki her şeyi kullanmak genellikle başarısızlık noktalarını artırır, seni daha dikkat çekici yapar ve hatta dışarıdan gelecek yardımdan koparabilir.',
                },
                {
                    type: 'p',
                    text: 'Kimin için: zaten takip edilen ya da tehdit edilen, cihazları kontrol ediliyor olabilecek, güvensiz bir ilişkinin içinde bilgi iletmek zorunda olan ya da zorla tıbbi tedavi veya zorla "düzeltme" ile karşı karşıya olan insanlar. Kimin için değil: yalnızca bir ebeveynin sohbet kaydını görmesinden endişe eden ya da sadece "biraz daha güvende" olmak isteyen biri.',
                },
                {
                    type: 'p',
                    text: 'Yüksek tehdit önlemlerinin ortak bedelleri: bağlantıyı kaybetmek ya da sessizliğe gömülmek, bakım yükü, olağandışı davranış, fark edilirsen daha ağır sonuçlar ve bir şey ters giderse başvuracak kimsenin olmaması.',
                },
                {
                    type: 'p',
                    text: 'Tek bir ilke: önce sonuçları azalt, sonra olasılığı. Fark edilme olasılığını sıfıra indiremezsin; yapabileceğin şey, fark edilirsen gidecek bir yerin, yardım edecek birinin, kanıtların ve ilacının olmasını sağlamaktır.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Fiziksel güvenliğin tehdit altındaysa güvendiğin bir yetişkine, yerel polise ya da acil servislere, hukuki yardım kuruluşuna veya bir trans destek örgütüne başvurmayı öncele. Yüksek tehdit teknikleri dış yardımın yerini tutmaz.',
                },
                {
                    type: 'p',
                    text: 'Aşağıdaki her bölüm yalnızca ilkeleri, riskleri ve alternatifleri ele alır; adım adım gizli prosedürler vermez. Nedeni "ahlak" değildir. Herkese açık bir belgeyi senin yanında dolandırıcılar, istismarcılar ve kolluk kuvvetleri de okur ve bu prosedürler gerçek hayatta çoğu zaman başarısız olur.',
                },
                {
                    type: 'p',
                    text: "Bu grup, herkese açık görüşme ve gerginlik azaltma araştırmalarından yararlanır: Dianiska, Quas ve Lyon (2024), ergenlerle yapılan görüşmelere dair sistematik bir derlemede önce yakınlık kurmanın, açık uçlu sorular kullanmanın ve tehditten kaçınmanın anlatılanların eksiksizliğini ve doğruluğunu artırdığını buldu; Price ve Baker'ın (2012) gerginlik azaltma derlemesi uyaranı azaltmayı, seçenek sunmayı ve güvenli bir mesafeyi korumayı vurgular; Fenaughty ve arkadaşları (2023) cinsel yönelimi ya da cinsiyet kimliğini değiştirme girişimlerinin daha kötü ruh sağlığıyla ilişkili olduğunu buldu; Bersani ve arkadaşları (2020) sanrılı ya da zorlayıcı bağlamlarda EKT için bilgilendirilmiş onamın etik güçlüklerini tartıştı. Bu çalışmalar kullanım kılavuzu değildir; hangi uygulamaların kanıta dayandığını, hangilerinin ise yalnızca sert laf olduğunu söylerler.",
                },
            ],
        },
        {
            id: 'extended-high-threat-device',
            title: 'Cihazlar ve konum: "kapalı" "çevrimdışı" demek değildir',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'İlkeyle başla: bir telefonun konumunun bulunup bulunamayacağı hâlâ bir ağa bağlı olup olmadığına, onun yerine bildirim yapabilecek yakındaki cihazlara ve hesabı kimin kontrol ettiğine bağlıdır. Telefonu kapatmak yalnızca ana işlemciyi ve çoğu telsizi kapatır; bazı düşük güçlü bulma özellikleri yine de çalışabilir.',
                },
                {
                    type: 'p',
                    text: 'iPhone 11 ve sonrasında, iOS 15 ve sonrasıyla, "Bul ağı" açıksa telefon kapatıldıktan sonra da yakındaki Apple cihazları aracılığıyla, genellikle sınırlı bir süre (yaklaşık 24 saat) bulunabilir. Sistem sürümleri, bölgeler ve ayarlar davranışı değiştirir; "kapalı = güvenli" diye varsayma.',
                },
                {
                    type: 'p',
                    text: 'Faraday çantası radyo sinyallerini metalle engelleyerek çalışır. Yararlıdır ama bedeli, mesaj ya da arama alamaman ve yardım çağıramamandır; sık kullanmak gözlemlenebilir bir davranış örüntüsü yaratır. Gündelik bir eşya değil, çevrimdışı olman gereken belirli durumlar için bir araçtır.',
                },
                {
                    type: 'p',
                    text: "Sistem kademeleri: temel düzey sistem güncellemeleri, güçlü bir kilit ekranı parolası, tam disk şifreleme ve gereksiz konum, reklam ve bulut eşitlemesinin kapatılmasıdır. Bir sonraki kademe GrapheneOS (uyumlu bir Pixel gerektirir) ya da Tails'tir. Üst kademe, tam disk şifrelemeyle birlikte Qubes, Whonix ya da OpenBSD'dir. Her kademe bakım maliyetini artırır; sürdüremediğin bir Qubes kurulumu varsayılan sistemden daha tehlikelidir.",
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: '"Gizlilik odaklı bir işletim sistemi kurdum"u güvenliğin kanıtı sayma. Telefon numaran, hesapların, ödemelerin, okulun ya da işyerin, ailen, kameralar, baz istasyonları ve gerçek dünyadaki hareketlerin seni yine de birbirine bağlayabilir.',
                },
                {
                    type: 'p',
                    text: 'İzlendiğinden şüpheleniyorsan: yalnızca telefonunu değil, çantanı, arabanı, hediyeleri, şarj aletlerini, anahtarlıkları ve duman dedektörlerini de kontrol et; güzergâhlarını ve saatlerini değiştir; güvendiğin birine söyle ve gerekirse profesyonel bir kuruluşa başvur. Kişiyle tek başına yüzleşme.',
                },
                {
                    type: 'p',
                    text: 'Düşük maliyetli bir alternatif: hassas işleri gündelik telefonundan ayır. Hassas işler için başka bir cihaz, hesap ve ağ kullan; gündelik telefonu normal tut ki "birden ortadan kaybolmuş" gibi görünmesin.',
                },
                {
                    type: 'warn',
                    kind: 'note',
                    text: '"Kapalıyken konum takibi" fikriyle kendini korkutma ve onu her şeyi açıklayan bir neden sayma. Cihazlar, sistemler ve hesap ayarları çok farklıdır; önce kendi ayarlarını kontrol et, sonra tehdit modelini kur.',
                },
            ],
        },
        {
            id: 'extended-high-threat-money',
            title: 'Cüzdanlar ve yedekler: kurtarma ifadesi kök anahtardır',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'Donanım cüzdanı nasıl çalışır: özel anahtar ya da kurtarma ifadesi çevrimdışı saklanır ve imzalama cihazın içinde gerçekleşir. Bilgisayarındaki zararlı yazılımın özel anahtarı doğrudan çalmasına karşı korur ama "kurtarma ifadesinin fotoğrafını çekip telefonunda saklamana", "cihazı ve ifadeyi aynı kutuda tutmana" ya da "zorlanmana" karşı korumaz.',
                },
                {
                    type: 'p',
                    text: 'Kurtarma ifadesi kök anahtardır: ona sahip olan herkes cüzdanı geri yükleyip varlıkları taşıyabilir. Monero\'nun defter gizliliği "dışarıdakilerin işlemi görememesini" korur, "ifadeye sahip olan kişiye" karşı korumaz.',
                },
                {
                    type: 'p',
                    text: 'Yedekleme ilkeleri: kurtarma ifadesini ve cihazı ayrı tut; farklı yerlerde en az iki kopya bulundur; bir parola katmanı ekle; büyük tutarlar için çoklu imza ya da Shamir bölmesi kullan; geri yüklemeyi düzenli olarak dene.',
                },
                {
                    type: 'p',
                    text: 'Ortamlar: metal plakalar yangına ve suya dayanır ama daha dikkat çekicidir ve saklaması zordur; kâğıt saklaması kolaydır ama ateşe, suya ve böceklere karşı savunmasızdır. Kurtarma ifadesini fotoğraflanacak, taranacak ya da buluta eşitlenecek hiçbir yere yazma; "bir yığın USB belleğin arasına sakladım"ı tek planın yapma, çünkü cihaz alınırsa ifade de onunla birlikte kaybolabilir.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Kâğıt ya da metal plaka yutma. Yemek borunu tıkamayacaklarını ya da kesmeyeceklerini garanti edemezsin; bunu yaparken görülmek kanıt yok etmek gibi görünür ve yedeğin de gider. Uç bir durumda ihtiyacın olan şey vücuduna bir şey sokmak değil, "ayrı saklama ve güvendiğin birinin bir kopyayı tutması"dır.',
                },
                {
                    type: 'p',
                    text: 'Varlıkların ailen ya da partnerin tarafından kontrol edilebilecekse: önce küçük bir tutarla dene; tüm paranı tek bir cüzdanda tutma; işlem kayıtlarını sakla; yerel yasaları öğren ve gerekirse bir avukata danış. Mahkeme kararlarından, nafaka ya da borç yükümlülüklerinden kaçmak için kripto para kullanma.',
                },
                {
                    type: 'p',
                    text: 'Daha teknik ayrıntılar için "Monero çoklu imza ve anonimlik" bölümüne bak; bu bölüm yalnızca yedeklemeyi ve fiziksel güvenliği ele alır.',
                },
            ],
        },
        {
            id: 'extended-high-threat-comms',
            title: 'Gözetim altında iletişim: önce dijital, sonra fiziksel',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'Telefonun ya da odan aranabiliyorsa ya da dışarı çıkmana izin verilmiyorsa, ilk ilke "daha derine sakla" değil, "saklanması gerekeni azalt"tır. Yüz yüze söyleyebiliyorsan yazılı iz bırakma; sıradan bir bahane açıklıyorsa karmaşık bir hikâye uydurma.',
                },
                {
                    type: 'p',
                    text: 'Önce dijital: güvendiğin yetişkinleri, okulun ya da kütüphanenin cihazlarını, Signal ya da SimpleX gibi uçtan uca şifreli araçları, ayrı hesapları ve cihazları, kilit ekranlarını, kapalı bildirim önizlemelerini ve geçmişin düzenli temizlenmesini kullan. İki kimliği aynı telefon numarası, e-posta ya da profil resmiyle birbirine bağlama.',
                },
                {
                    type: 'p',
                    text: 'Ailenin bilgisayarını ya da telefonunu kullanmak zorundaysan: gizli pencere güvenlik değildir; izleme ya da ebeveyn denetimi yazılımı olup olmadığını kontrol et; hassas hesaplara giriş yapma; işin bitince oturumu kapat; otomatik doldurma ya da indirme geçmişi bırakma.',
                },
                {
                    type: 'p',
                    text: 'Güvenilir aracı: ailenin şüphelenmeyeceği bir yetişkin, arkadaş, öğretmen ya da sosyal hizmet uzmanı bul ve senin yerine mesaj iletmesini iste; sıradan bir parola kelime üzerinde anlaşın; ondan kaldırabileceğinden fazla risk üstlenmesini isteme.',
                },
                {
                    type: 'p',
                    text: 'Ölü posta kutusu nasıl çalışır: bir "değiş tokuşu" bırakma, işaretleme ve alma adımlarına böler, böylece iki taraf aynı anda orada bulunmaz. "Aynı anda buluşamıyoruz" sorununu çözer; sahte malları, araya girilmeyi, kontrollü teslimatı, zorlamayı, satış sonrası desteği ya da kanıtı çözmez. Herhangi bir halka görülürse bütün zincir açığa çıkar.',
                },
                {
                    type: 'p',
                    text: 'Bu bölüm neden yer seçimini, işaretlemeyi, bırakmayı ya da almayı anlatmıyor: herkese açık bir belgeyi dolandırıcılar, istismarcılar, kolluk kuvvetleri ve kötü niyetli okurlar da okur; tek bir örnek bir şablona dönüşür; gerçekte hava durumu, hayvanlar, yoldan geçenler, kameralar, sabit güzergâhlar, parmak izleri, DNA ve ıssız bir yerde almanın fiziksel riski bir "zekice numarayı" kanıta çevirebilir.',
                },
                {
                    type: 'p',
                    text: 'Fiziksel bir aktarıma ihtiyacın varsa: güvenilir bir aracıyı, okulda ya da işte herkesin önünde bir teslimi veya posta ve kargoyu (adrese ve alıcıya dikkat ederek) tercih et ya da bilgiyi küçük, göze çarpmayan parçalara böl. Evinin ya da okulunun yakınında alma; sabit bir saat kullanma; ıssız bir yere tek başına gitme; eksiksiz okunabilir bilgi bırakma.',
                },
                {
                    type: 'p',
                    text: 'Karşındakini savunmaya geçirmeden bilgi nasıl sorulur: açık uçlu sorular kullan ("Sonra ne olacak?", "Bu tahlili kim istedi?"), önce yakınlık kur, sonra ayrıntıları sor; sorgu ya da tehditle başlama; doğru duyduğundan emin olmak için karşındakinin sözlerini tekrarla; reddederse zorlamak yerine başka bir zaman ya da başka bir kişiyle dene. Ergen görüşmeleri üzerine araştırmalar, daha eksiksiz anlatım için "önce yakınlık, açık uçlu sorular, tehditten kaçınma" yaklaşımını destekler (Dianiska ve ark., 2024; Nahouli ve ark., 2021).',
                },
                {
                    type: 'ul',
                    items: [
                        'Nedeni değil süreci sor: "Bu tahlili kim ayarladı?", "Sonuçları kim görecek?", "Yaptırmazsam sonra ne olur?" Süreç soruları "Benden şüpheleniyor musunuz?" sorusundan daha kolay yanıtlanır.',
                        'Her seferinde tek bir soru sor; karşındaki savunmaya geçerse konuyu değiştir ve sonra geri dön; tekrar tekrar sorgulamak insanların sohbeti bitirmek istemesine yol açar.',
                        'Onların sözleriyle doğrula: "Yani imzalamazsam okul aileme haber verecek, öyle mi?" Sonuçları kendi ağızlarıyla açıkça söylesinler.',
                        '"Herkes böyle yapıyor" ya da "ailen zaten biliyor" derlerse ayrıntı iste: "Bunu kim söyledi? Ne zaman? Aslını görebilir miyim?"',
                        'Çelişkileri o anda yüzlerine vurma; not al ve sonra güvendiğin bir yetişkinle kontrol et. O an bir cümleyi kazanmak sana güvenliğine mal olabilir.',
                    ],
                },
                {
                    type: 'p',
                    text: 'Ağzından laf alınmasına nasıl izin vermezsin: yalnızca gerekeni yanıtla; emin değilsen "Bilmiyorum" ya da "Sormam gerek" de; işbirliği yapıyor görünmek için bir şey uydurma; biri "herkes böyle yapıyor" ya da "ailen zaten biliyor" diye baskı yaparsa ayrıntı iste; duygusal olarak gerginken karar verme.',
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: '"Polisi ararım"ı tehdit olarak söyleme ve karşındakini "kanıtım var" ya da "tanıdıklarım var" diye korkutmaya çalışma. Sert laf güvenli bir durumda işe yarayabilir; şiddet içeren bir durumda genellikle işleri tırmandırır. Polisi aramak bir eylemdir, bir replik değil.',
                },
            ],
        },
        {
            id: 'extended-high-threat-medical',
            title: 'Zorla kan tahlili ve zorla tıbbi bakım: önce neye bakıldığını öğren',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'Kan tahlili kanındaki belirteçleri ölçer; "yakın zamanda ilaç aldın mı" sorusu için bir yalan makinesi değildir. Cinsiyet hormonları, karaciğer ve böbrek fonksiyonları, prolaktin ve tam kan sayımı farklı şeylere işaret eder; tek bir anormal sonuç susuzluktan, uykudan, başka ilaçlardan ya da hastalıktan da kaynaklanabilir. Kendine "bir kez kusarsam sorun kalmaz" deme.',
                },
                {
                    type: 'p',
                    text: 'Okul sağlık taramaları (üniversite sınavı için yapılan sağlık kontrolleri dahil) yere göre değişir. Yaygın maddeler boy ve kilo, tansiyon, görme, kalp ve akciğer dinlemesi, omurga ve uzuvlar ve akciğer röntgenidir; bazı yerler karaciğer fonksiyonu ya da tam kan sayımı ekler. Cinsiyet hormonları rutin değildir. "Kan aldılar" "hormonlara baktılar" demek değildir.',
                },
                {
                    type: 'p',
                    text: 'Gerçekten bir hormon testi yapılıyorsa: önce neye bakılacağını, nedenini, sonuçları kimin göreceğini, sonuçların yalnızca bir veliye ya da doktora verilip verilemeyeceğini, gizlilik koruması isteyip isteyemeyeceğini ve testin ertelenip ertelenemeyeceğini ya da başka bir hastaneye alınıp alınamayacağını sor. Doktordan açıklama isteyebilir ve ikinci bir görüş talep edebilirsin.',
                },
                {
                    type: 'p',
                    text: 'Ertelemeye karar verirsen: en az kötü şiddetsiz yol, muayene alanından normal biçimde ayrılmak ve zaman kazanmak için "Tuvalete gitmem gerek" ya da "Kendimi iyi hissetmiyorum" demektir; bir süre sınırı koy, kendini bir yere kilitleme, telefonunu kapatıp ortadan kaybolma ve ortalık boşalana kadar saklanma. Bulunduğunda kimseyle yüzleşme; önceden belirlediğin bir cümleyi kullan: "Korkuyorum", "Kendimi iyi hissetmiyorum", "Başka bir gün yapmak istiyorum" ya da "Önce güvendiğim biriyle iletişime geçmek istiyorum." Bu yalnızca bir kez erteler; bir sonraki sefer yine gelecektir ve gözetim artabilir.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Kendini kusturma. Kusmak zaten emilmiş hormonları çıkaramaz; enjeksiyon ya da jel için işe yaramaz; kusma ve susuzluk karaciğer enzimlerinin, kreatininin ve elektrolit düzeylerinin anormal çıkmasına ve daha fazla teste yol açabilir; riskleri arasında aspirasyon, yemek borusu yırtılmaları, düşük potasyum ve aritmi vardır. "Normal görünmek" için ilacını kendi başına bırakma ya da dozunu değiştirme.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Göğüs bağlamayı bir örtü olarak kullanma. Bir beden muayenesi onu çıkarmanı gerektirebilir; uzun süreli bağlama nefes almayı, kaburgaları ve cildi etkileyebilir; elastik bandaj ve bant daha tehlikelidir. Bağlaman gerekiyorsa bedenine uygun bir binder kullan, süreyi sınırla ve ağrı ya da nefes darlığında hemen bırak.',
                },
                {
                    type: 'p',
                    text: 'Sonuçlar çoktan çıktıysa ya da ailen öğrendiyse: önce kimin ve ne kadarını bildiğini doğrula; raporu kapma ya da değiştirme; seninle birlikte açıklaması için bir doktor, sosyal hizmet uzmanı ya da güvendiğin bir yetişkin bul; kısa bir cümle hazırla; aile içi şiddet riski varsa önce bir güvenlik planı yap ve eve tek başına gitme.',
                },
                {
                    type: 'p',
                    text: 'Zorla "dönüştürme" ya da "internet bağımlılığını düzeltme": bunlar meşru tıbbi bakım değildir. Tehlike işaretleri telefonlara ve kimliklere el konulması, iletişimin kısıtlanması, fiziksel ceza, ziyaretçilerin engellenmesi, "hatanı kabul et" diye dayatılması ve bir tanı ya da tedavi planı vermeyi reddetmektir. Bunlarla karşılaşırsan önce fiziksel güvenliğini koru ve doğrudan karşı koyma; kanıtları sakla; güvendiğin birine konumunu ve haberleşme saatini söyle; kapı açıksa ve dışarıda biri seni karşılayabilecekse ancak o zaman ayrılmayı düşün; tek başına yürüyerek kaçma ve güvendiğin yetişkinlerle iletişimi kesme.',
                },
                {
                    type: 'p',
                    text: 'MEKT (modifiye elektrokonvülsif tedavi), belirli ağır ruhsal hastalıklar için anestezi altında yapılan tıbbi bir işlemdir; "trans olmanın tedavisi" değildir. Asıl sorman gerekenler şunlardır: tanının dayanağı ne, ayırıcı tanı yapıldı mı, endikasyon ne, alternatifler neler, bilgilendirilmiş onamı kim imzaladı ve bellek etkileri dahil yan etkiler neler. Zorlanıyorsan tıbbi kaydı ve bilgilendirilmiş onam formunu sakla ve ikinci bir görüş, hukuki yardım ya da sağlık otoritesine başvur.',
                },
                {
                    type: 'p',
                    text: 'Bir psikiyatristle görüşmek ("sınamak" değil): doğrudan sor: "Kaç trans danışanla çalıştınız? WPATH ya da ICD-11 kullanıyor musunuz? Cinsiyet uyumsuzluğunu psikozdan nasıl ayırıyorsunuz? Tanıya katılmazsam bunu nasıl ele alırsınız? Trans olmayı başlı başına bir sanrı olarak mı görüyorsunuz?" Tehlike işaretleri: trans olmayı bir hastalık olarak görmek, tanıyı açıklamayı reddetmek, uymazsan EKT ile tehdit etmek, "gerçekten trans olduğunu kanıtlamanı" istemek ve baş başa konuşmana izin vermemek.',
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: 'İntihar ya da kendine zarar verme riskin varsa önce onu ele al; yalnızca "kaydını temiz tutmak" için saklama. Zorlayıcı tedavi korkusu gerçektir ama ağır belirtileri saklamak seni daha büyük tehlikeye sokabilir.',
                },
            ],
        },
        {
            id: 'extended-high-threat-exposure',
            title: 'İfşadan sonra: ilk 72 saat ve ilk ay',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'İfşanın kendisi son değildir; sonrasında gelen zincirleme tepkiler öyledir. İlk amaç "her şeyi açıkça anlatmak" değil, "yayılmayı durdurmak, fiziksel güvenliği sağlamak ve müttefik bulmak"tır.',
                },
                {
                    type: 'p',
                    text: 'İlk 72 saat içinde: sızıntının kapsamını doğrula (kim gördü, ekran görüntüleri var mı, iletildi mi); yeni paylaşımlara ara ver; herkese açık bilgileri en aza indir; profil resmini, kullanıcı adını ve parolalarını değiştir; cihazlarını ve hesaplarını kontrol et; güvendiğin 1–2 kişiye söyle; yorumları tek başına okuyup durma.',
                },
                {
                    type: 'p',
                    text: 'Kime ne söylemeli: hemen ailene ya da okuluna söylemeyecek kişileri öncele; "Yargılanmaya değil, yardıma ihtiyacım var" diye başla; yalnızca gerekli bilgiyi ver; somut bir şey yapıp yapamayacaklarını sor (sana eşlik etmek, kalacak yer vermek, mesaj iletmek, polisi aramak).',
                },
                {
                    type: 'p',
                    text: 'Kanıt: ekran görüntüleri, ekran kayıtları, bağlantılar, saatler ve hesap kimlikleri; düzenleme; şifreli yedekle; adalet istemek için herkese açık paylaşma.',
                },
                {
                    type: 'p',
                    text: 'İlk ay: okulda, evde, işte ve tıbbi bakımda sonrasıyla ilgilen; evde şiddet riski varsa bir güvenlik planı yap (kimlik, ilaç, para, yedek telefon, geçici kalacak yer); okul değiştirmeyi, taşınmayı ya da iş değiştirmeyi düşünebilirsin ama önce maliyeti ve riski değerlendir; geri dönüşü olmayan kararları dürtüsel olarak verme.',
                },
                {
                    type: 'p',
                    text: 'Reşit olmayanlar ve yetişkinler: "hayatı baştan kurmak" reşit olmayanlar için genellikle gerçekçi değildir ve polisi aramak ya da kayıp ihbarı yapılması seni daha büyük tehlikeye sokabilir; güvendiğin yetişkinleri, sosyal hizmet uzmanlarını, hukuki yardımı ve geçici barınağı öncele. Taşınan yetişkinlerin de parayı, işi, belgeleri ve tıbbi bakımın sürekliliğini düşünmesi gerekir.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Yalnızca "iyi olduğunu kanıtlamak" için karşındakiyle yüzleşme, kavga etme ya da kişisel bilgilerini ifşa etme. İfşadan sonra öfke normaldir ama misilleme genellikle riski yeniden sana getirir.',
                },
            ],
        },
        {
            id: 'extended-high-threat-circle',
            title: 'Güvendiğin küçük bir çevren varsa',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'Küçük bir çevre bilgi, geçici barınak, eşlik, borç ve mesaj iletme sağlayabilir ama riski de bir yerde toplar. İlkeler: güven kademeli olmalı, para az olmalı, kayıtlar en az olmalı ve kararlar geri alınabilir olmalı.',
                },
                {
                    type: 'ul',
                    items: [
                        'Güven merdiveni: düşük riskli şeylerle başla (dinlemek, seninle birlikte bir telefon görüşmesi yapmak), sonra orta riskli şeylere geç (küçük bir miktar borç vermek, bir paket teslim almak) ve ancak ondan sonra yüksek riskli şeylere (adresini, gerçek kimliğini, mali durumunu bilmek).',
                        'Para: küçük tutarlar, kaybetmeyi göze alabileceğin para ve borç mu hediye mi olduğunu yaz; tüm paranı tek bir kişiye verme; büyük tutarlar için çoklu imza ya da şeffaf defterler kullan; "dayanışma" adı altında kayıtsız para toplama.',
                        'Bilgi: yalnızca bilmesi gerekenlere söyle; büyük bir grup kurma; sohbet kayıtlarını düzenli olarak temizle; tüm sırları tek bir kişinin eline verme.',
                        'Güvenlik: düzenli haberleşme, parola kelimeler ve acil durum kişileri üzerinde anlaşın; birbirinizin sınırlarını bilin; biri tehdit edildiğinde köstebek avına değil, önce o kişiyi korumaya odaklanın.',
                    ],
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Sahte "karşılıklı tanıklık" organize etme, belge sahteciliği yapma ve şiddetle misilleme yapma. Bunlar küçük bir çevreyi suç ortaklığına dönüştürür; biri zorlanırsa herkes daha büyük tehlikeye girer.',
                },
                {
                    type: 'p',
                    text: 'Başka birine yardım ediyorsan: önce "Şu an güvende misin? Neye ihtiyacın var?" diye sor. Onun yerine karar verme; yerine getiremeyeceğin sözler verme; reşit olmayanlar, şiddet ya da tıbbi bakım söz konusuysa profesyonel kuruluşları işin içine kat.',
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: 'Bu bölüm bir örgütlenme kılavuzu değildir. Bilgi havuzları, dayanışma fonları ve bölgeler arası ağlar hukuki, mali ve güvenlik incelemesi gerektirir; bu olmadan yapma.',
                },
            ],
        },
    ],
};

export default TR;
