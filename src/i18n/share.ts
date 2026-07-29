import { Lang } from './translations';

export interface ShareCopy {
    action: string;
    modalTitle: string;
    modalDescription: string;
    snapshotNote: string;
    liveSnapshotNote: string;
    liveToggle: string;
    liveBadge: string;
    updatedOn: string;
    passwordToggle: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    passwordHint: string;
    expiryLabel: string;
    expiryHint: string;
    create: string;
    creating: string;
    created: string;
    copy: string;
    copied: string;
    createError: string;
    tooLarge: string;
    limitReached: string;
    invalidExpiry: string;
    loginRequired: string;
    noData: string;
    publicTitle: string;
    publicEyebrow: string;
    sharedOn: string;
    expiresOn: string;
    neverExpires: string;
    protected: string;
    chartTitle: string;
    historyTitle: string;
    records: string;
    disclaimer: string;
    loading: string;
    unlockTitle: string;
    unlockDescription: string;
    unlock: string;
    unlocking: string;
    wrongPassword: string;
    unavailableTitle: string;
    unavailableDescription: string;
    expiredTitle: string;
    expiredDescription: string;
    retry: string;
    manageTitle: string;
    manageDescription: string;
    noneActive: string;
    revoke: string;
    revokeConfirm: string;
    revokeError: string;
}

const en: ShareCopy = {
    action: 'Share',
    modalTitle: 'Share dosage details',
    modalDescription: 'Create a read-only snapshot of your dosage chart and history.',
    snapshotNote: 'A copy of your dosage records, modelled curve, and timezone is uploaded to this service and kept until the link expires. Later changes will not appear. Lab results, weight, profile details, and account data are not included.',
    liveSnapshotNote: 'While you are signed in with HRT Tracker open, later dosage changes are copied to this link. Lab results, weight, profile details, and account data are not included.',
    liveToggle: 'Keep this link updated',
    liveBadge: 'Live',
    updatedOn: 'Updated',
    passwordToggle: 'Protect with a password',
    passwordLabel: 'Link password',
    passwordPlaceholder: 'At least 8 characters',
    passwordHint: 'Send the password separately from the link.',
    expiryLabel: 'Expiration date',
    expiryHint: 'The link stops working after this time.',
    create: 'Create link',
    creating: 'Creating…',
    created: 'Your share link is ready',
    copy: 'Copy link',
    copied: 'Copied',
    createError: 'Could not create the link. Please try again.',
    tooLarge: 'This history is too large to share in one link.',
    limitReached: 'You have reached the active-link limit. Try again after an older link expires.',
    invalidExpiry: 'Choose an expiration time in the future.',
    loginRequired: 'Sign in to create a share link.',
    noData: 'Add a dosage record before creating a share link.',
    publicTitle: 'Shared dosage record',
    publicEyebrow: 'HRT Tracker · read-only snapshot',
    sharedOn: 'Shared',
    expiresOn: 'Expires',
    neverExpires: 'No expiration',
    protected: 'Password protected',
    chartTitle: 'Dosage chart',
    historyTitle: 'Dosage history',
    records: 'records',
    disclaimer: 'This chart is a modelled estimate based on logged doses. It is not medical advice and should not replace blood tests or care from a clinician.',
    loading: 'Opening shared record…',
    unlockTitle: 'This record is protected',
    unlockDescription: 'Enter the password supplied by the person who shared this link.',
    unlock: 'View record',
    unlocking: 'Checking…',
    wrongPassword: 'That password is not correct.',
    unavailableTitle: 'This shared record is unavailable',
    unavailableDescription: 'The link may be invalid, removed, or no longer available.',
    expiredTitle: 'This shared record has expired',
    expiredDescription: 'Ask the sender to create a new link.',
    retry: 'Try again',
    manageTitle: 'Active share links',
    manageDescription: 'Revoke a link at any time. For security, an existing link cannot be shown again.',
    noneActive: 'No active links',
    revoke: 'Revoke',
    revokeConfirm: 'Revoke this share link? Anyone using it will immediately lose access.',
    revokeError: 'Could not revoke the link. Please try again.',
};

const copy: Record<Lang, ShareCopy> = {
    en,
    zh: {
        ...en,
        action: '分享', modalTitle: '分享用药详情', modalDescription: '创建一个仅可查看的快照，包含您的剂量图表和用药记录。',
        snapshotNote: '您的用药记录、模型曲线和时区副本会上传至本服务，并保存到链接过期。之后的修改不会同步；检查结果、体重、个人资料和账户数据不会被包含。',
        liveSnapshotNote: '登录并打开 HRT Tracker 时，后续用药修改会自动同步至此链接；检查结果、体重、个人资料和账户数据不会被包含。',
        liveToggle: '实时同步', liveBadge: '实时', updatedOn: '更新于',
        passwordToggle: '使用密码保护', passwordLabel: '链接密码', passwordPlaceholder: '至少 8 个字符', passwordHint: '请将密码和链接分开发送。',
        expiryLabel: '过期时间', expiryHint: '超过此时间后，链接将无法访问。', create: '创建链接', creating: '正在创建…', created: '分享链接已就绪',
        copy: '复制链接', copied: '已复制', createError: '无法创建链接，请重试。', tooLarge: '用药记录过大，无法放入一个分享链接。', limitReached: '您已达到有效链接数量上限，请在旧链接过期后重试。', invalidExpiry: '请选择将来的过期时间。', loginRequired: '请先登录，再创建分享链接。', noData: '请先添加一条用药记录。',
        publicTitle: '分享的用药记录', publicEyebrow: 'HRT Tracker · 只读快照', sharedOn: '分享于', expiresOn: '过期于', neverExpires: '永不过期', protected: '密码保护',
        chartTitle: '剂量图表', historyTitle: '用药记录', records: '条记录', disclaimer: '此图表是根据用药记录生成的模型估算，不构成医疗建议，也不能替代血液检查或医生诊疗。',
        loading: '正在打开分享记录…', unlockTitle: '此记录受密码保护', unlockDescription: '请输入分享者提供的密码。', unlock: '查看记录', unlocking: '正在验证…',
        wrongPassword: '密码不正确。', unavailableTitle: '无法查看此分享记录', unavailableDescription: '链接可能无效、已被移除或无法再访问。', expiredTitle: '此分享记录已过期', expiredDescription: '请让分享者创建一个新链接。', retry: '重试', manageTitle: '有效的分享链接', manageDescription: '您可以随时撤销链接。出于安全原因，已有链接不会再次显示。', noneActive: '暂无有效链接', revoke: '撤销', revokeConfirm: '撤销此分享链接？所有使用者将立即失去访问权限。', revokeError: '无法撤销链接，请重试。',
    },
    'zh-TW': {
        ...en,
        action: '分享', modalTitle: '分享用藥詳情', modalDescription: '建立一個僅供檢視的快照，包含劑量圖表與用藥紀錄。',
        snapshotNote: '您的用藥紀錄、模型曲線與時區副本會上傳至本服務，並保存到連結到期。之後的修改不會同步；檢查結果、體重、個人資料與帳戶資料不會被包含。',
        liveSnapshotNote: '登入並開啟 HRT Tracker 時，之後的用藥修改會自動同步至此連結；檢查結果、體重、個人資料與帳戶資料不會被包含。',
        liveToggle: '即時同步', liveBadge: '即時', updatedOn: '更新於',
        passwordToggle: '使用密碼保護', passwordLabel: '連結密碼', passwordPlaceholder: '至少 8 個字元', passwordHint: '請將密碼與連結分開傳送。',
        expiryLabel: '到期時間', expiryHint: '超過此時間後，連結將無法存取。', create: '建立連結', creating: '正在建立…', created: '分享連結已就緒',
        copy: '複製連結', copied: '已複製', createError: '無法建立連結，請再試一次。', tooLarge: '用藥紀錄過大，無法放入一個分享連結。', limitReached: '您已達到有效連結數量上限，請在舊連結到期後再試。', invalidExpiry: '請選擇未來的到期時間。', loginRequired: '請先登入，再建立分享連結。', noData: '請先新增一筆用藥紀錄。',
        publicTitle: '分享的用藥紀錄', publicEyebrow: 'HRT Tracker · 唯讀快照', sharedOn: '分享於', expiresOn: '到期於', neverExpires: '永不到期', protected: '密碼保護',
        chartTitle: '劑量圖表', historyTitle: '用藥紀錄', records: '筆紀錄', disclaimer: '此圖表是根據用藥紀錄產生的模型估算，不構成醫療建議，也不能取代驗血或醫師診療。',
        loading: '正在開啟分享紀錄…', unlockTitle: '此紀錄受密碼保護', unlockDescription: '請輸入分享者提供的密碼。', unlock: '查看紀錄', unlocking: '正在驗證…',
        wrongPassword: '密碼不正確。', unavailableTitle: '無法查看此分享紀錄', unavailableDescription: '連結可能無效、已被移除或無法再存取。', expiredTitle: '此分享紀錄已到期', expiredDescription: '請讓分享者建立新連結。', retry: '重試', manageTitle: '有效的分享連結', manageDescription: '您可以隨時撤銷連結。基於安全理由，現有連結不會再次顯示。', noneActive: '沒有有效連結', revoke: '撤銷', revokeConfirm: '撤銷此分享連結？所有使用者將立即失去存取權。', revokeError: '無法撤銷連結，請再試一次。',
    },
    yue: {
        ...en,
        action: '分享', modalTitle: '分享用藥詳情', modalDescription: '建立一個只可以睇嘅快照，包含劑量圖表同用藥紀錄。',
        snapshotNote: '您嘅用藥紀錄、模型曲線同時區副本會上傳到本服務，保存到連結到期。之後嘅修改唔會同步；檢查結果、體重、個人資料同帳戶資料唔會包括。',
        liveSnapshotNote: '登入並開住 HRT Tracker 時，之後嘅用藥修改會自動同步到呢條連結；檢查結果、體重、個人資料同帳戶資料唔會包括。',
        liveToggle: '即時同步', liveBadge: '即時', updatedOn: '更新於',
        passwordToggle: '用密碼保護', passwordLabel: '連結密碼', passwordPlaceholder: '最少 8 個字元', passwordHint: '請將密碼同連結分開傳送。',
        expiryLabel: '到期時間', expiryHint: '過咗呢個時間，連結就唔可以再用。', create: '建立連結', creating: '建立緊…', created: '分享連結已準備好',
        copy: '複製連結', copied: '已複製', createError: '建立唔到連結，請再試。', tooLarge: '用藥紀錄太大，放唔入一條分享連結。', limitReached: '已達有效連結上限，請等舊連結到期後再試。', invalidExpiry: '請揀一個將來嘅到期時間。', loginRequired: '請先登入，再建立分享連結。', noData: '請先加一筆用藥紀錄。',
        publicTitle: '分享嘅用藥紀錄', publicEyebrow: 'HRT Tracker · 唯讀快照', sharedOn: '分享於', expiresOn: '到期於', neverExpires: '永不到期', protected: '密碼保護',
        chartTitle: '劑量圖表', historyTitle: '用藥紀錄', records: '筆紀錄', disclaimer: '呢個圖表係根據用藥紀錄產生嘅模型估算，唔係醫療建議，亦唔可以代替驗血或醫護診療。',
        loading: '開緊分享紀錄…', unlockTitle: '呢份紀錄有密碼保護', unlockDescription: '請輸入分享者提供嘅密碼。', unlock: '查看紀錄', unlocking: '驗證緊…',
        wrongPassword: '密碼唔啱。', unavailableTitle: '睇唔到呢份分享紀錄', unavailableDescription: '連結可能無效、已刪除或者已經用唔到。', expiredTitle: '呢份分享紀錄已到期', expiredDescription: '請叫分享者建立新連結。', retry: '再試', manageTitle: '有效分享連結', manageDescription: '你可以隨時撤銷連結。為咗安全，舊連結唔會再次顯示。', noneActive: '暫時冇有效連結', revoke: '撤銷', revokeConfirm: '撤銷呢條分享連結？所有使用者會即時失去存取權。', revokeError: '撤銷唔到連結，請再試。',
    },
    ja: {
        ...en,
        action: '共有', modalTitle: '投与情報を共有', modalDescription: '投与量グラフと履歴の閲覧専用スナップショットを作成します。',
        snapshotNote: '投与記録、モデル曲線、タイムゾーンのコピーが本サービスへアップロードされ、リンクの期限まで保存されます。後の変更は反映されず、検査結果、体重、プロフィール、アカウント情報は含まれません。',
        liveSnapshotNote: 'HRT Trackerにログインして開いている間、以後の投与変更がこのリンクへ自動同期されます。検査結果、体重、プロフィール、アカウント情報は含まれません。',
        liveToggle: 'リアルタイム同期', liveBadge: 'ライブ', updatedOn: '更新',
        passwordToggle: 'パスワードで保護', passwordLabel: 'リンクのパスワード', passwordPlaceholder: '8文字以上', passwordHint: 'パスワードはリンクとは別に送ってください。',
        expiryLabel: '有効期限', expiryHint: 'この日時を過ぎるとリンクは開けなくなります。', create: 'リンクを作成', creating: '作成中…', created: '共有リンクを作成しました',
        copy: 'リンクをコピー', copied: 'コピー済み', createError: 'リンクを作成できませんでした。もう一度お試しください。', tooLarge: '履歴が大きすぎるため、1つのリンクでは共有できません。', limitReached: '有効なリンク数の上限に達しました。古いリンクの期限後に再試行してください。', invalidExpiry: '未来の有効期限を選択してください。', loginRequired: '共有リンクを作成するにはサインインしてください。', noData: '先に投与記録を追加してください。',
        publicTitle: '共有された投与記録', publicEyebrow: 'HRT Tracker · 閲覧専用スナップショット', sharedOn: '共有日時', expiresOn: '有効期限', neverExpires: '期限なし', protected: 'パスワード保護',
        chartTitle: '投与量グラフ', historyTitle: '投与履歴', records: '件', disclaimer: 'このグラフは記録された投与量に基づくモデル推定です。医療上の助言ではなく、血液検査や医療機関での診療に代わるものではありません。',
        loading: '共有記録を開いています…', unlockTitle: 'この記録は保護されています', unlockDescription: '共有した人から受け取ったパスワードを入力してください。', unlock: '記録を見る', unlocking: '確認中…',
        wrongPassword: 'パスワードが正しくありません。', unavailableTitle: '共有記録を表示できません', unavailableDescription: 'リンクが無効、削除済み、または利用できなくなった可能性があります。', expiredTitle: '共有記録の有効期限が切れました', expiredDescription: '共有した人に新しいリンクの作成を依頼してください。', retry: '再試行', manageTitle: '有効な共有リンク', manageDescription: 'リンクはいつでも取り消せます。安全のため、既存のリンクは再表示できません。', noneActive: '有効なリンクはありません', revoke: '取り消す', revokeConfirm: 'この共有リンクを取り消しますか？利用者はすぐにアクセスできなくなります。', revokeError: 'リンクを取り消せませんでした。もう一度お試しください。',
    },
    ko: {
        ...en,
        action: '공유', modalTitle: '복용 정보 공유', modalDescription: '복용량 차트와 기록의 읽기 전용 스냅샷을 만듭니다.',
        snapshotNote: '복용 기록, 모델 곡선 및 시간대 사본이 이 서비스에 업로드되어 링크 만료 시점까지 보관됩니다. 이후 변경 사항은 반영되지 않으며 검사 결과, 체중, 프로필 및 계정 정보는 포함되지 않습니다.',
        liveSnapshotNote: 'HRT Tracker에 로그인한 상태로 앱을 열어 두면 이후 복용 변경 사항이 이 링크에 자동 동기화됩니다. 검사 결과, 체중, 프로필 및 계정 정보는 포함되지 않습니다.',
        liveToggle: '실시간 동기화', liveBadge: '실시간', updatedOn: '업데이트',
        passwordToggle: '비밀번호로 보호', passwordLabel: '링크 비밀번호', passwordPlaceholder: '8자 이상', passwordHint: '비밀번호는 링크와 별도로 보내세요.',
        expiryLabel: '만료 날짜', expiryHint: '이 시간이 지나면 링크가 열리지 않습니다.', create: '링크 만들기', creating: '만드는 중…', created: '공유 링크가 준비되었습니다',
        copy: '링크 복사', copied: '복사됨', createError: '링크를 만들 수 없습니다. 다시 시도해 주세요.', tooLarge: '기록이 너무 커서 하나의 링크로 공유할 수 없습니다.', limitReached: '활성 링크 한도에 도달했습니다. 이전 링크가 만료된 후 다시 시도하세요.', invalidExpiry: '미래의 만료 시간을 선택하세요.', loginRequired: '공유 링크를 만들려면 로그인하세요.', noData: '먼저 복용 기록을 추가하세요.',
        publicTitle: '공유된 복용 기록', publicEyebrow: 'HRT Tracker · 읽기 전용 스냅샷', sharedOn: '공유', expiresOn: '만료', neverExpires: '만료 없음', protected: '비밀번호 보호',
        chartTitle: '복용량 차트', historyTitle: '복용 기록', records: '개 기록', disclaimer: '이 차트는 기록된 복용량을 기반으로 한 모델 추정치입니다. 의료 조언이 아니며 혈액 검사나 의료진의 진료를 대체하지 않습니다.',
        loading: '공유 기록을 여는 중…', unlockTitle: '이 기록은 보호되어 있습니다', unlockDescription: '링크를 공유한 사람이 제공한 비밀번호를 입력하세요.', unlock: '기록 보기', unlocking: '확인 중…',
        wrongPassword: '비밀번호가 올바르지 않습니다.', unavailableTitle: '공유 기록을 볼 수 없습니다', unavailableDescription: '링크가 잘못되었거나 삭제되었거나 더 이상 사용할 수 없습니다.', expiredTitle: '공유 기록이 만료되었습니다', expiredDescription: '공유한 사람에게 새 링크를 요청하세요.', retry: '다시 시도', manageTitle: '활성 공유 링크', manageDescription: '언제든 링크를 취소할 수 있습니다. 보안을 위해 기존 링크는 다시 표시되지 않습니다.', noneActive: '활성 링크 없음', revoke: '취소', revokeConfirm: '이 공유 링크를 취소할까요? 모든 사용자가 즉시 접근할 수 없게 됩니다.', revokeError: '링크를 취소할 수 없습니다. 다시 시도해 주세요.',
    },
    tr: {
        ...en,
        action: 'Paylaş', modalTitle: 'Doz bilgilerini paylaş', modalDescription: 'Doz grafiğinizin ve geçmişinizin salt okunur bir anlık görüntüsünü oluşturun.',
        snapshotNote: 'Doz kayıtlarınızın, modellenmiş eğrinin ve saat diliminin bir kopyası bu hizmete yüklenir ve bağlantı sona erene kadar saklanır. Sonraki değişiklikler yansımaz; test sonuçları, kilo, profil ve hesap verileri dahil edilmez.',
        liveSnapshotNote: 'HRT Tracker açık ve oturumunuz etkin olduğu sürece sonraki doz değişiklikleri bu bağlantıya otomatik eşitlenir. Test sonuçları, kilo, profil ve hesap verileri dahil edilmez.',
        liveToggle: 'Canlı eşitleme', liveBadge: 'Canlı', updatedOn: 'Güncellendi',
        passwordToggle: 'Parolayla koru', passwordLabel: 'Bağlantı parolası', passwordPlaceholder: 'En az 8 karakter', passwordHint: 'Parolayı bağlantıdan ayrı gönderin.',
        expiryLabel: 'Son kullanma tarihi', expiryHint: 'Bu saatten sonra bağlantı açılmaz.', create: 'Bağlantı oluştur', creating: 'Oluşturuluyor…', created: 'Paylaşım bağlantınız hazır',
        copy: 'Bağlantıyı kopyala', copied: 'Kopyalandı', createError: 'Bağlantı oluşturulamadı. Lütfen yeniden deneyin.', tooLarge: 'Bu geçmiş tek bir bağlantıda paylaşmak için çok büyük.', limitReached: 'Etkin bağlantı sınırına ulaştınız. Eski bir bağlantı sona erdikten sonra yeniden deneyin.', invalidExpiry: 'Gelecekte bir son kullanma zamanı seçin.', loginRequired: 'Paylaşım bağlantısı oluşturmak için giriş yapın.', noData: 'Önce bir doz kaydı ekleyin.',
        publicTitle: 'Paylaşılan doz kaydı', publicEyebrow: 'HRT Tracker · salt okunur anlık görüntü', sharedOn: 'Paylaşıldı', expiresOn: 'Sona erer', neverExpires: 'Süresiz', protected: 'Parola korumalı',
        chartTitle: 'Doz grafiği', historyTitle: 'Doz geçmişi', records: 'kayıt', disclaimer: 'Bu grafik, kaydedilen dozlara dayalı modellenmiş bir tahmindir. Tıbbi tavsiye değildir; kan testlerinin veya klinik bakımın yerini tutmaz.',
        loading: 'Paylaşılan kayıt açılıyor…', unlockTitle: 'Bu kayıt korunuyor', unlockDescription: 'Bağlantıyı paylaşan kişinin verdiği parolayı girin.', unlock: 'Kaydı görüntüle', unlocking: 'Kontrol ediliyor…',
        wrongPassword: 'Parola doğru değil.', unavailableTitle: 'Bu paylaşılan kayıt kullanılamıyor', unavailableDescription: 'Bağlantı geçersiz, kaldırılmış veya artık kullanılamıyor olabilir.', expiredTitle: 'Bu paylaşılan kaydın süresi doldu', expiredDescription: 'Gönderenden yeni bir bağlantı oluşturmasını isteyin.', retry: 'Tekrar dene', manageTitle: 'Etkin paylaşım bağlantıları', manageDescription: 'Bir bağlantıyı istediğiniz zaman iptal edin. Güvenlik nedeniyle mevcut bağlantı yeniden gösterilemez.', noneActive: 'Etkin bağlantı yok', revoke: 'İptal et', revokeConfirm: 'Bu paylaşım bağlantısı iptal edilsin mi? Kullanan herkes erişimini hemen kaybeder.', revokeError: 'Bağlantı iptal edilemedi. Lütfen yeniden deneyin.',
    },
};

export const getShareCopy = (lang: Lang): ShareCopy => copy[lang] ?? en;
