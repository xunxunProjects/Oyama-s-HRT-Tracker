export type OpSecLang = 'zh' | 'zh-TW' | 'yue' | 'en' | 'ja' | 'ko' | 'tr';

export type OpSecBlock =
    | { type: 'p'; text: string }
    | { type: 'ul'; items: string[] }
    | { type: 'ol'; items: string[] }
    | { type: 'quote'; text: string }
    | { type: 'warn'; text: string };

export interface OpSecSection {
    id: string;
    title: string;
    level: 'basic' | 'advanced';
    blocks: OpSecBlock[];
}

export interface OpSecContent {
    title: string;
    disclaimerTitle: string;
    disclaimer: string[];
    intro: string;
    basicHeading: string;
    advancedHeading: string;
    advancedNote: string;
    sections: OpSecSection[];
}

const ZH: OpSecContent = {
    title: '日常操作与安全',
    disclaimerTitle: '免责声明（请先阅读）',
    disclaimer: [
        '本指南由社区成员根据公开资料和常见安全实践整理，是一般性的科普与自我保护建议，不是项目组的官方教程、官方政策或官方收款指南，也不代表项目组对任何工具、服务、币种或平台的背书。',
        '本指南不构成法律、金融、投资、税务、医疗或安全审计建议。不同国家和地区的法律与监管要求差异很大；在采取任何可能影响自己或他人权利、资金、隐私或人身安全的行动前，请咨询当地合格的专业人士。',
        '任何安全措施都有局限。我们无法保证文中提到的工具、链接、方法或第三方服务始终安全、可用、未被篡改或适合你的具体情况。使用任何软件、网站或服务前，请自行核实来源、许可证、权限和风险。',
        '你对自己的行为负全部责任。请遵守当地法律，不要利用本指南从事诈骗、洗钱、逃税、规避制裁、跟踪、骚扰、冒充他人、侵犯隐私或其他违法活动。',
        '隐私技术本身是中性的：它保护记者、家暴与性侵幸存者、性少数群体、慢性病患者和普通人的正常生活；但技术也可能被滥用。我们反对任何形式的滥用，也不为滥用行为提供便利。',
        '加密货币价格波动剧烈，链上交易不可逆，钱包、交易所、DEX、兑换服务和稳定币都可能出现故障、被攻击、被冻结或跑路。本节关于钱包和兑换的内容只讨论个人资金管理与隐私，不构成投资建议，也不承诺任何收益。',
        '如果你面临人身危险、跟踪、勒索、骚扰或心理健康危机，请优先联系当地警方、法律援助、医疗机构或专业支持组织，不要只依赖本指南。',
        '文中出现的第三方名称、商标和项目仅用于说明，不表示任何关联、赞助或认可。继续阅读即表示你理解并同意自行评估并承担使用本指南的全部风险。',
    ],
    intro: '这里应该是一个让人安心的社区，而“安心”不是靠信任某一个人或某一个网站，而是靠每个人都知道怎样保护自己。下面这份指南不想吓你，只想帮你把风险挡在门外：先分清什么值得保护，再学会用简单、可持续的习惯守住它。',
    basicHeading: '基础：先保护好自己',
    advancedHeading: '进阶：高风险与应急处置',
    advancedNote:
        '下面这部分针对更极端的情况：被系统性针对、被跟踪、面临真实人身威胁，或怀疑设备与账号已经失守。大多数成员可能一辈子都用不上；请按自己的实际情况取用，只用于正当自卫，不要做违法的事。如果人身安全受到威胁，优先联系当地警方、法律援助或可信赖的专业机构。',
    sections: [
        {
            id: 'threat-model',
            title: '先问自己：我要保护什么，防谁？',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: '安全不是把最复杂的工具全装上，而是先搞清楚：哪些信息一旦泄露会伤害你，谁有可能来拿它，以及你愿意为此付出多少时间。',
                },
                {
                    type: 'ul',
                    items: [
                        '要保护的东西：现实身份、住址与行踪、学校/单位、亲密关系、医疗与用药信息、资金，以及你不想被公开的过去。',
                        '可能的对手：路过的网友、被拒绝的追求者、熟人、诈骗团伙、平台审核，甚至系统性的监控。对手越强，你需要的隔离越多。',
                        '泄露的后果：是被网暴、被骚扰、被出柜、被开除，还是有人身危险？后果越重，越要提前准备。',
                        '可持续性：一个你能长期坚持的普通习惯，胜过一套坚持三天就放弃的“终极方案”。',
                    ],
                },
                {
                    type: 'warn',
                    text: '不要追求“绝对安全”。世界上没有绝对安全的系统，只有把风险降到可接受程度的方案。过度防护让你与世隔绝，也是一种失败。',
                },
            ],
        },
        {
            id: 'identity',
            title: '核心原则：把社区身份和现实身份分开',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: '这是整份指南里最重要的一条。只要两个身份之间没有可验证的连接点，别人再会搜也很难找到你。身份隔离的目标不是“编一个完美的谎”，而是让不必要的真实信息根本不出现。',
                },
                {
                    type: 'ul',
                    items: [
                        '为这个社区单独准备一套昵称、头像和简介；不要和 QQ、微信、微博、游戏 ID、邮箱前缀或你常用的网名产生重复。',
                        '帖子、私信、个人资料里都不要出现真实姓名、手机号、学校、单位、家庭住址、精确位置、正脸照、原声录音、证件或病历。',
                        '年龄、爱好、地区、作息看起来无害，却最容易把搜索范围缩小；能空着就空着，必须填就写得模糊。',
                        '每个平台用不同的网名；头像、自我介绍、注册邮箱都不要复制粘贴。',
                        '社区账号和现实账号不要在同一台设备、同一个浏览器里同时登录。',
                    ],
                },
                {
                    type: 'p',
                    text: '可以做一个小测试：把你在社区里说过的话、发过的图全部摊开，能不能拼出你的学校、单位或住址？只要能拼出一点，就删掉或改掉。',
                },
            ],
        },
        {
            id: 'accounts',
            title: '账号、密码与双重验证',
            level: 'basic',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        '每个账号都要有独立的强密码；生日、手机号、键盘顺序和“一个密码走天下”都不合格。',
                        '用密码管理器生成并保管密码；KeePassXC 可以完全离线，Bitwarden 更方便但要把主密码守好。',
                        '本社区和所有重要账号都开 2FA；能用验证器 App（Aegis、FreeOTP、Ente Auth）就不要只靠短信。',
                        '恢复码抄在纸上或存进离线保险处；不要截图放相册、网盘、聊天记录。',
                        '隔一段时间检查登录设备和活跃会话；看到不认识的设备，立刻踢下线并改密码。',
                        '安全问题的答案可以是编的，只要你自己记得住；别用母亲姓氏、出生城市这类一查就中的信息。',
                    ],
                },
                {
                    type: 'warn',
                    text: '真正的工作人员不会私信问你要密码、验证码或恢复码。验证码就是账号本身，谁拿走谁就能登录。',
                },
            ],
        },
        {
            id: 'photos',
            title: '照片、声音与元数据',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: '手机拍照会顺手把 GPS、拍摄时间、机型写进文件；声音和影像本身也是生物特征。一张图、一条语音，可能比你想象中更能定位你。',
                },
                {
                    type: 'ul',
                    items: [
                        '发图前先清 EXIF：电脑上用 ExifTool 或 ImageOptim，手机上用相册的“移除位置/元数据”。',
                        '背景要检查：窗外地标、校服、门牌、快递面单、课表、工牌、病历、药盒都可能出卖你。',
                        '别把清理工作交给社交 App；重要图片自己处理，必要时重新截图或压缩。',
                        '尽量不发语音和视频；声音是生物特征，背景里的广播、报站、方言、室内回声也会暴露环境。',
                        '证件、病历、处方、检查报告不要拍照外发；如果对方要求验证，先问清楚用途，能只给最小信息就只给最小信息。',
                        '发之前多看一眼：镜子、反光、窗外、桌上的快递单。',
                    ],
                },
            ],
        },
        {
            id: 'messaging',
            title: '私密沟通：优先 SimpleX，其次 Signal',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: '微信、QQ、短信、普通邮件和 Telegram 的普通聊天，都不适合放敏感内容：它们可能被读取、留存、审查，也可能因为一次盗号全部泄露。',
                },
                {
                    type: 'ul',
                    items: [
                        '第一次匿名联系，或者社区里刚认识、还没建立信任的人：优先 SimpleX。它不要手机号和邮箱，没有固定用户 ID，用一次性邀请链接建立连接，消息端到端加密，留下的元数据很少。',
                        '已经认识、需要长期稳定联系的人：可以用 Signal。它要手机号，最好用独立号码，别用实名主号；适合和信任的小圈子沟通。',
                        '要发长文、文件或跨平台沟通，可以用 PGP 加密邮件；发之前通过另一个渠道核对公钥指纹。',
                        '不管用什么工具，聊天里都不要出现身份证、病历、住址、学校/单位、车票、快递单；必须发就先打码、裁剪、加密。',
                        '关掉锁屏消息预览和云端备份；手机丢了或被检查时，预览和备份往往比聊天软件本身更容易泄露内容。',
                    ],
                },
                {
                    type: 'warn',
                    text: '端到端加密只保护传输过程，不保护已经解锁的手机、截图、对方转发和云端备份。工具选对只是第一步，习惯才是关键。',
                },
            ],
        },
        {
            id: 'browsing',
            title: '浏览、Tor 与 VPN',
            level: 'basic',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        '访问本站时，可以用 Tor Browser，或者你信任的 VPN；第三方镜像要先搞清楚是谁在维护、有没有被篡改。',
                        '能关 JavaScript 就关；至少不要在不信任的站点上随手给权限。JS 是指纹采集和行为分析的主要入口之一。',
                        '社区身份和现实身份不要挤在同一个浏览器里；至少开独立的浏览器 Profile，最好用独立设备。',
                        '扩展能少装就少装；每个扩展都能看到你访问的页面，定期清理不用的。',
                        '重要站点手动输入地址或用书签，不要点私信、邮件、搜索广告里的登录链接。',
                        '浏览器、系统、应用要及时更新；很多入侵利用的是早就修好的旧漏洞。',
                    ],
                },
                {
                    type: 'p',
                    text: 'Tor 和 VPN 不是一回事。Tor 把你的流量经过多个节点转发，隐藏你的真实 IP，但速度慢，出口节点能看到未加密的流量；VPN 只加密你到 VPN 服务器这一段，VPN 运营者仍然能看到你的真实 IP 和访问目标。',
                },
                {
                    type: 'p',
                    text: '可信 VPN 可以是你用 WireGuard 在 VPS 上自建的，也可以是口碑好、日志政策清晰的商业 VPN；不要用来路不明的免费 VPN。自建 VPN 也不是隐身衣：VPS 提供商仍然能看到你的服务器 IP。',
                },
                {
                    type: 'p',
                    text: '如果威胁模型很高，用 Tor；如果只是防止本地网络或 ISP 窥探，可信 VPN 通常够用。不要把 VPN 当成“绝对匿名”的同义词。',
                },
                {
                    type: 'p',
                    text: '隐私浏览模式只能减少本地痕迹，不能让你匿名。真正的匿名来自网络层（Tor/VPN）、浏览器指纹和账号隔离的组合。',
                },
            ],
        },
        {
            id: 'official-site',
            title: '“官方网站”不等于绝对安全',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: '本站是项目的官方网站，代码也尽量开源、可审查。但“官方”只说明它由项目维护，不说明它不会被攻破。世界上没有绝对安全的系统；即使我们的业务代码逻辑没有问题，只要上游的任何一环出问题，你的浏览器里运行的应用也可能被波及。',
                },
                {
                    type: 'ul',
                    items: [
                        '依赖供应链：npm 包、开源库、构建工具被投毒，或爆出远程代码执行（RCE）漏洞，我们即使没改代码也会中招。',
                        '托管与部署：托管平台、CI/CD、域名、CDN 或管理员账号被盗，页面可能被篡改或注入恶意脚本。',
                        '第三方资源：统计、字体、图标、客服组件等外部脚本被劫持，同样能在页面里执行代码。',
                        '你自己的环境：浏览器插件、输入法、代理工具或系统被入侵，也会让“看起来正常”的页面变危险。',
                    ],
                },
                {
                    type: 'p',
                    text: '所以：不要因为“这是官网”就输入真实姓名、证件、住址或工作单位；重要操作前核对域名和证书；保持独立备份；发现页面异常、证书警告或莫名跳转时立即停止使用，并通过可信渠道报告。威胁模型较高的人，可以考虑自建实例、锁定版本并审查每次更新。',
                },
                {
                    type: 'warn',
                    text: '安全不是“通过一次检查就永远安全”，而是持续降低概率、限制损失。请把官网当作“可信度较高，但仍需保持警惕”的工具，而不是保险箱。',
                },
            ],
        },
        {
            id: 'money',
            title: '资金与加密货币：方便和隐私要分开看',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: '以下只是一般性的个人资金管理建议，不是项目组的官方教程或收款政策。先想清楚这笔钱用来做什么：日常小额、收捐赠、长期储值，还是隐私敏感的交易。不同用途用不同钱包，不要把全部资产放在一个地方。',
                },
                {
                    type: 'ul',
                    items: [
                        '小额、日常、需要法币出入金：可以走合规的 KYC 交易所或托管钱包，金额控制在自己能承受的范围内。KYC 的代价是身份和这笔资金被绑定，所以它不适合用来保护匿名性。',
                        '金额较大、或更在意隐私：用非托管钱包加 DEX/链上兑换，自己保管私钥。DEX 通常不要求 KYC，但链上记录公开，流动性和滑点风险更高，也可能遇到假币。',
                        'Cake Wallet：开源、非托管的多币种钱包，支持 Monero、Bitcoin、Ethereum 等，内置兑换/闪兑，适合把 XMR 换成其他币种。兑换通常由第三方流动性方完成，部分通道可能需要 KYC；先用小额测试，确认到账再继续。',
                        'Monero GUI：Monero 官方钱包，可以运行本地全节点（monerod）。自建节点隐私和验证最好，但区块链体积大、首次同步慢、占磁盘和带宽，对普通用户可能很麻烦；用远程节点更方便，但节点运营者能看到你的 IP 和查询模式。',
                        'Bitcoin Core：比特币全节点，验证最可靠，但链体积和同步成本更高。可以配合 Electrum Personal Server / Sparrow 等使用自己的节点，兼顾验证与隐私。注意：BTC 是假名而非匿名，地址复用和 KYC 交易很容易把交易串起来。',
                        'BTC 还是 Monero：BTC 去中心化程度高、接受度广、账本公开透明，适合捐赠、记账和长期储值；Monero 默认隐私，适合不希望交易被公开关联的个人使用。可以按用途分开，不必二选一。',
                        '收捐赠：用独立的收款地址，优先主流资产（如 BTC），保留来源和用途记录；不要和个人钱包混用，也不要收来路不明的大额转账。BTC 的透明账本便于公开对账；Monero 隐私更好，但来源不透明，不适合需要公开审计的捐赠。',
                        '黑钱风险：链上资产没有“干净”的保证。对方转来的币可能来自诈骗、赌博、制裁地址或被盗资金，链上分析公司会给地址打分，交易所可能因此冻结你的账户。不要接受陌生人“低价出币”或“帮忙过账”的请求，这可能让你成为洗钱链条的一环。',
                        '种子短语离线保存：手写在纸上或金属板上，不拍照、不上云、不发聊天、不存密码管理器以外的联网设备。',
                        '大额资产用硬件钱包；不同用途分钱包；每次先小额测试；转账前在设备屏幕上核对地址。',
                        '只从官网或官方应用商店链接下载钱包，警惕假 App、假客服、假空投和“帮你找回资产”的骗局。',
                    ],
                },
                {
                    type: 'warn',
                    text: '本节讲的是个人资金保护和隐私，不是洗钱、逃税、规避制裁或诈骗的教程。隐私技术本身无罪，但滥用技术的行为有罪。请遵守当地法律。',
                },
                {
                    type: 'p',
                    text: '合规提示：无论金额大小，都不要为了规避申报、税务或交易所风控而故意拆分交易；该申报的申报，该留记录的留记录。',
                },
                {
                    type: 'p',
                    text: '如果你收到可疑资金：不要急着转移或花掉，先保留证据，联系钱包或交易所的合规部门，必要时咨询律师。',
                },
            ],
        },
        {
            id: 'phishing',
            title: '钓鱼与社会工程：记住五个危险信号',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: '社会工程不攻击代码，它攻击人：先取得信任，再制造压力，最后让你自己交出信息或点下链接。技术再强，也挡不住你亲手把验证码发出去。',
                },
                {
                    type: 'ul',
                    items: [
                        '突然的热情或巧合：刚认识就特别懂你、频繁私聊、迅速拉近关系。',
                        '制造紧急与恐惧：限时处理、账号将被封、家人出事、警察找你、错过就来不及。',
                        '冒充权威：自称管理员、版主、官方客服、警察、医生、投资顾问。',
                        '索取超出必要的信息：学校、城市、住址、证件、银行卡、语音、视频、验证码、屏幕共享。',
                        '要求隔离或保密：别告诉别人、换个平台聊、点这个链接、装这个远程软件。',
                    ],
                },
                {
                    type: 'p',
                    text: '遇到以上任何一条，先停下来。通过你本来就知道的官方入口（而不是对方给的链接）去核实；不要在压力下做决定；验证码、密码、恢复码不给任何人；不装远程控制软件；不转账。',
                },
                {
                    type: 'warn',
                    text: '真正尊重你的人，不会因为你说“我需要先核实一下”而生气。会因此暴怒、威胁或催促的人，本身就值得警惕。',
                },
            ],
        },
        {
            id: 'scenario',
            title: '情景案例：一次差点成功的社工',
            level: 'basic',
            blocks: [
                {
                    type: 'quote',
                    text: '小陆在社区里发了一条关于用药体验的帖子。几天后，一个叫“阿岚”的人私信他：“你写得很真实，我也有类似经历，可以聊聊吗？”',
                },
                {
                    type: 'p',
                    text: '阿岚很会聊天：记得小陆说过喜欢哪款游戏，会在他情绪低落时安慰他，从不急着要信息。两周后，阿岚说想确认他不是“机器人”，请他发一条语音；又过几天，问他是不是也在某个城市，说下个月可能过去。小陆含糊地说了大概区域，但没有说具体地址。',
                },
                {
                    type: 'p',
                    text: '转折发生在一个晚上。阿岚发来一个链接：“社区最近有人盗号，你点这里做个防丢号验证，不然会被踢。”页面看起来和官网几乎一样，要求输入用户名和密码。紧接着阿岚又说自己的账号被冻结，想借 0.05 BTC 应急，明天就还。',
                },
                {
                    type: 'p',
                    text: '小陆差点就点了。但他想起三件事：第一，官方从来不会私信发登录链接；第二，对方一直在制造“现在不做就来不及”的紧迫感；第三，阿岚前一秒还在聊城市，后一秒就要借钱，节奏太巧了。他没有点链接，而是自己打开官网，从站内公告确认没有所谓的“防丢号验证”，然后把对话截图、举报、拉黑。阿岚发现骗不到，先是生气指责，随后注销了账号。',
                },
                {
                    type: 'p',
                    text: '拆开看，这条攻击链很典型：先建立好感（rapport）→ 用小事测试你是否愿意配合 → 逐步套取可关联的信息 → 制造紧急事件 → 用钓鱼链接或转账完成收割。每一步都不起眼，合起来才危险。',
                },
                {
                    type: 'ul',
                    items: [
                        '慢下来：任何要求你“立刻”做决定的请求，都先放一放。',
                        '换渠道核实：用你原本就知道的官网、官方公告或认识的管理员去确认，不要用对方给的链接和联系方式。',
                        '守住最小信息：语音、视频、证件、住址、验证码、助记词，没有一项是“聊天必须”的。',
                        '拒绝也可以很礼貌：“这个我不方便提供”“我自己去官网查”“验证码不给任何人”。',
                        '留下证据并举报：截图、保存账号 ID、时间线，交给管理员或平台；不要独自和对方纠缠。',
                    ],
                },
            ],
        },
        {
            id: 'persona',
            title: '和网友聊天：如何维持人设、又不被关联',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: '这里说的“人设”不是让你编一个惊天动地的假身份，而是建立一个最小、稳定、不可验证的公开形象。目标不是骗人，而是让真实生活中不必要的细节留在门外。',
                },
                {
                    type: 'ul',
                    items: [
                        '只准备最小设定：一个昵称、一个大致的年龄段、一个宽泛的职业方向、两三个普通爱好。不要编具体的学校、公司、小区、生日、家庭成员。',
                        '保持一致：把设定记在加密笔记里，别今天说 20 岁明天说 25 岁。但也不要编太多需要圆谎的细节——越简单越不容易穿帮。',
                        '保持不可验证：地点只说到大区或国家，职业只说“做设计/写代码/学生”，时间只说“最近”。不要发能定位到具体地点的照片。',
                        '做好隔离：独立账号、独立邮箱、独立浏览器 Profile；不要在登录真实账号的设备上登录社区身份；头像和照片不要复用。',
                        '防文风关联：不要在不同平台复制同一段自我介绍；少用独特的口头禅；不同身份之间不要互相点赞、转发或互动。',
                        '防声音与影像：尽量不语音、不视频、不自拍。必须发照片时，用无脸、无背景、无 EXIF 的图，并检查反光和桌面细节。',
                        '聊天时用“反问、模糊、转移话题”：不需要回答每一个问题。“我不太想聊这个”“这个不重要吧”都是完整句子。',
                        '不要主动编戏剧性的故事。越普通、越无聊的人设越安全；也不要冒充真实存在的人、官方人员或专业人士。',
                    ],
                },
                {
                    type: 'warn',
                    text: '人设不是犯罪工具。不要用它诈骗、冒充他人、逃避法律责任或伤害别人。它的用途是保护隐私，不是欺骗。',
                },
                {
                    type: 'p',
                    text: '如果哪句话说漏了：不要慌乱地继续加码圆谎。先记下泄露了什么，评估它能不能和你的真实身份连起来；必要时换号、切断联系、提醒可能被波及的朋友。一次小失误通常还有补救空间。',
                },
            ],
        },
        {
            id: 'family',
            title: '和家人同住：查岗、吃药与藏药',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: '大多数人的风险不在暗网，而在饭桌、卧室和书包：父母可能突然进门、翻抽屉、查手机，或者随口问一句“你在吃什么”。目标不是编一个完美的谎，而是让流程短、痕迹少、被问到时能稳住。',
                },
                {
                    type: 'p',
                    text: '先说清楚：如果父母可能因为你吃什么药而打你，这不是“家务事”，而是暴力。下面的做法是降低风险的权宜之计，不是长期方案。请尽快找一个可信的成年人、医生、社工或当地支持组织，一起做安全计划。',
                },
                {
                    type: 'p',
                    text: '先确认你的药片是否适合舌下含服。不是所有雌二醇片都适合舌下或颊含，有些是设计为吞服的。按处方、药品说明书或医生/药师的建议做，不要自行改变用法。下面只讨论“已经按医嘱需要舌下含服时，怎样减少被发现”，不是用药指导。',
                },
                {
                    type: 'p',
                    text: '舌下含服没有“说话完全看不出来”的保证。最稳的办法是避免在含药时说话：把药片放在舌下，闭紧嘴，等它基本溶解再开口。雌二醇药片通常需要几分钟到十几分钟；说话、吞咽、用舌头搅动都会让药片移位，增加被吞下去的比例。',
                },
                {
                    type: 'p',
                    text: '如果父母在你含药时叫你：先别张嘴回答。可以敲一下桌子、发消息说“我在刷牙/上厕所，等一下”，或者先含一口水、装作在漱口。必须应答时，用最短的句子，比如“马上出来”“在刷牙”，说完立刻闭嘴；不要尝试正常聊天。更好的做法是提前避开：洗澡、刷牙、换衣服、倒垃圾、锁门收拾东西时含药，给自己留 10–15 分钟。',
                },
                {
                    type: 'p',
                    text: '练习：用一颗和药片差不多大的薄荷糖或维生素片（不要用真药反复练）放在舌下，设 5 分钟计时，练习不说话、点头、指手机、写字、慢慢走路。练几次就知道自己的极限；不要为了“练耐受力”重复吃药。',
                },
                {
                    type: 'p',
                    text: '万一被看到：不要抢、不要一次吞掉整把药、也不要在对方已经看清包装时硬说“这是糖”。先保持平静，把药收好。如果这是医生开的，可以说“我在按医生的安排吃药，我现在不想讨论”；如果不是，尽量少说，先离开现场，不要编复杂的医疗说法。如果对方有暴力倾向，先保证出口，不要背对门，不要争论。',
                },
                {
                    type: 'p',
                    text: '注射比口服更难藏，也更需要卫生条件。只在能锁门、能洗手、能平放物品的地方做；铺一张干净的纸或毛巾，把酒精棉、棉签、针具、锐器盒放在手边，按医生或护士教过的顺序做，不要赶时间。匆忙、光线差、被打断，比“被父母发现”更危险。如果你没有受过正规培训，先找医生或护士教你，不要自己摸索。这不是注射教程；剂量、部位、频率和是否适合注射，以处方和医护指导为准。',
                },
                {
                    type: 'p',
                    text: '针具只推荐一次性使用：开封后只用一次，用完立刻丢进带盖的锐器盒或厚实的硬壳容器，不再清洗、消毒或保存。不要重复使用，也不要共用。锐器盒放在锁盒里；绝不把针头丢进厨房垃圾、塑料袋或马桶。用过的针头不要回套针帽；如果必须回套，用单手回套。',
                },
                {
                    type: 'p',
                    text: '藏药位置：常见的藏药点都能用，但要按“干燥、避光、避热、固定、不会被随手翻到”来选。床头板或床靠背后面、抽屉背板反面适合放密封袋加干燥剂；书包夹层只适合短途携带，不适合长期存放，学校书包也可能被检查；长期不动的收纳盒要确认不在暖气、窗台、浴室或车里；废弃教科书缝隙适合放扁平的药板，别压碎，也别用学校或图书馆的书。',
                },
                {
                    type: 'p',
                    text: '更稳的做法是一个带锁的小盒子，放在衣柜顶层、床底深处或只有你知道的固定位置。锁盒比“到处换地方”更不容易忘，也更不容易被意外翻到。不要把药放进没有标签的瓶子、食品罐或保健品瓶里——紧急情况下你自己也可能拿错。保留原包装和处方标签，放在锁盒里；如果必须用伪装容器，至少在里面写清楚药名、剂量和日期。',
                },
                {
                    type: 'p',
                    text: '不要放在：浴室（潮湿）、厨房（高温和油烟）、窗台或暖气旁（高温）、车里（温度剧烈变化）、冰箱冷冻层（冻结可能破坏药物）、宠物或小孩够得到的地方。',
                },
                {
                    type: 'p',
                    text: '包装、账单和手机也会暴露：药店小票、快递盒、处方袋、银行或保险账单、药房短信、健康 App 通知都可能被看到。自己扔垃圾时把包装放进不透明袋子；关掉短信预览；用中性名称做提醒（“复诊”“取快递”）；不要用家庭共享账号登录健康 App。',
                },
                {
                    type: 'p',
                    text: '如果父母翻房间：你无法完全阻止，但可以降低损失。重要药物集中在锁盒里，准备一个“万一被找到”的说法和离开路线；不要在被发现时把所有药都带在身上，也不要把药冲进马桶。事后把药转移到安全地方，联系医生或信任的人。',
                },
                {
                    type: 'warn',
                    text: '被殴打、被威胁、被赶出家门不是“应该承受的代价”。如果你正在经历这些，先联系可信的成年人、老师、医生、社工或当地 LGBTQ+ / 跨性别支持组织；有立即危险时打当地报警或急救电话。不要一个人扛。',
                },
            ],
        },
        {
            id: 'school',
            title: '同学问起时：低信息量话术',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: '学校里的风险通常不是“被黑客定位”，而是被围观、被起哄、被逼着表态。你不需要向任何人证明你的身份；可以用最短、最无聊、最可撤回的句子把话题挡回去。',
                },
                {
                    type: 'p',
                    text: '一个常见的避险思路是：把“跨性别”这个更容易被针对的标签，换成“穿着风格 / 性取向 / 还在探索”的说法。比如：',
                },
                {
                    type: 'ul',
                    items: [
                        '“我是 femboy，就是喜欢女装，觉得 cute，第一次尝试。”',
                        '“我是泛性恋，喜欢的是人，不是性别；女装只是我的风格。”',
                        '“我还在探索，不想给自己贴死标签。”',
                        '“这就是我个人爱好，不影响别人。”',
                        '“我不想聊这个，换个话题吧。”',
                    ],
                },
                {
                    type: 'p',
                    text: '为什么这类说法有时更安全：在一些环境里，“穿女装 / 性取向”比“跨性别”更容易被当成“个人风格”或“还没定性”，对方可能不会立刻升级到“你是不是要变性”的恐惧。但它不是万能盾牌：femboy、泛性恋同样可能被恐同或恐跨的人攻击；如果对方已经认定你是跨性别，换标签也可能没用。',
                },
                {
                    type: 'p',
                    text: '使用原则：短、随意、不解释太多；说完就转话题；不要编复杂的背景故事（学校、城市、时间线越多越容易穿帮）；不要为了自保去贬低其他跨性别者。“我才不是那种人”会伤害别人，也会让你更孤立。',
                },
                {
                    type: 'p',
                    text: '如果被追问“你是不是 trans？”：可以说“我还在想，不想现在讨论”，或者反问“你为什么这么问？”；如果对方开始起哄、围堵、动手，不要辩论，先离开，去有老师、监控或其他同学的地方，找可信的人。',
                },
                {
                    type: 'p',
                    text: '如果老师说“你为什么不穿得正常一点”：你不需要在课堂上辩论性别理论。可以说“我在按自己的方式穿着，没有影响课堂”，然后把话题带回学习。如果老师羞辱或惩罚你，记录时间、地点和原话，告诉安全的家长或监护人、学校心理老师或当地教育部门。',
                },
                {
                    type: 'p',
                    text: '出柜不是一次性的考试。你可以今天说“我在探索”，明天说“我不想聊”，这不矛盾。标签是你的工具，不是别人审问你的口供。',
                },
                {
                    type: 'warn',
                    text: '不要因为“说自己是 femboy 比较安全”就强迫自己接受这个标签，也不要假装成另一个真实存在的人。即使你认为“说 femboy 会被打得轻一点”，被打仍然是暴力，不是你需要接受的成本；如果环境危险，优先离开和求助。',
                },
            ],
        },
        {
            id: 'medical',
            title: '学校体检与医疗隐私：不要用催吐逃避',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: '学校体检的项目各地不同，常见的有身高体重、血压、视力、脊柱、心肺听诊，有些地方还会抽血。如果你担心体检暴露用药、注射痕迹、束胸或身体变化，先问清楚：检查哪些项目、由谁做、结果给谁看、能不能单独和医生沟通、能不能申请隐私检查或由监护人/可信成年人陪同。很多学校允许学生提出隐私方面的安排，但规则因地区而异；不要假设一定有，也不要假设一定没有。',
                },
                {
                    type: 'p',
                    text: '更安全的做法是找可信的医生、校医、社工或当地 LGBTQ+ / 跨性别支持组织，问清楚当地规定；必要时请医生写一封只说明“需要隐私评估/不宜集体检查”的说明。不要伪造病历、处方或家长签字；伪造文件会带来更大的法律和家庭风险。',
                },
                {
                    type: 'p',
                    text: '如果你只是紧张或真的不舒服：告诉老师或校医“我有点头晕/恶心，想坐一下”，坐下、慢慢喝水，不要骑车或开车，让他们联系可信的人。把真实症状说出来，比编一个会被送医、通知家长的故事更可控。',
                },
                {
                    type: 'warn',
                    text: '高危险行为警告：不要用催吐、催吐药、刺激咽喉、憋尿、脱水、擅自吃药或装晕倒来逃避体检。催吐可能导致误吸、窒息、食管撕裂、电解质紊乱、心律不齐和牙齿腐蚀；呕吐后立刻躺下睡觉尤其危险，可能在睡梦中被呕吐物呛住。不要用“吐完就没事”来判断安全。',
                },
                {
                    type: 'warn',
                    text: '如果已经呕吐：先漱口，保持坐姿或侧卧，少量喝水，告诉可信的成年人；如果反复呕吐、胸痛、腹痛、呕血、头晕到站不稳或意识不清，立即就医。不要马上独自睡觉，也不要因为一次“成功”就重复。',
                },
                {
                    type: 'p',
                    text: '体检不是“必须全部配合”或者“必须全部逃避”的二选一。你可以只对必要的项目说“我不想在这里做，能不能和医生单独说”，也可以请可信成年人陪同。真正危险的是用伤害身体的方式换一次检查的通过；一次体检的结果，不值得用窒息、食管损伤或心律问题去换。',
                },
                {
                    type: 'warn',
                    text: '如果学校强制集体脱衣检查、羞辱你或泄露你的医疗信息，记录时间、地点、在场人员和原话，告诉可信监护人、医生、学校心理老师或当地教育部门/法律援助。不要一个人对抗。',
                },
            ],
        },
        {
            id: 'psychiatry',
            title: '精神科、易性症诊断与“开证”：身体重构不是一次 commit',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: '“易性症”是一些地区、较旧诊断体系里的说法，不同地方的名称、标准和流程不一样。这一节不是自我诊断工具，也不替代医生评估；它只讨论一件事：当你需要诊断、转诊或证明时，这道门可能怎么卡人，以及怎样少把系统的拖延误解成“我不够跨”。',
                },
                {
                    type: 'p',
                    text: '先说清楚：精神科不是只为“开证”存在的，也不是只有崩溃时才去。持续的情绪低落、焦虑、失眠、食欲变化、无法上学或工作、自伤或自杀想法、物质使用问题，都值得找专业帮助。你可以同时需要心理支持和激素/手术；治疗抑郁不会让性别认同消失，隐瞒抑郁也不会让申请更容易。',
                },
                {
                    type: 'warn',
                    text: '如果你反复出现自杀想法、已经有计划或自伤冲动：这比任何证明都优先。联系当地急救或危机热线、去急诊、告诉可信的成年人，尽量不要独处。不要为了“保持记录干净”而隐瞒；在评估里隐瞒严重症状，可能让你在最危险的时候得不到帮助。',
                },
                {
                    type: 'p',
                    text: '现实里的结构性问题：在一些地方，保守的精神科医生可以拖延、拒绝或反复要求补充材料，从而卡住 HRT 或手术转诊。这不是你“不够真”的证据，也不是你的错。可以做的准备：提前问清楚需要哪些诊断和材料（观察期、现实生活体验、家属同意等）、当地是否有 informed consent 或社区健康服务、能否带走病历副本；被拒时要求书面理由，问清缺什么，换一位对跨性别友好的医生，或找当地支持组织协助。第二意见是合理的，伪造病历、诊断或签字不是。',
                },
                {
                    type: 'p',
                    text: '如果你目前没有长期、明显的抑郁、焦虑或功能受损，也不急需诊断或证明，不必为了“先攒一个易性症诊断”专门跑精神科；但如果你选择的医疗路径要求它，就把它当成一个需要准备的材料关卡，而不是身份考试。不要为了迎合医生编故事，也不要为了显得“稳定”而否认真实的痛苦。',
                },
                {
                    type: 'p',
                    text: '隐私：精神科记录、诊断和转诊信都是敏感信息。问清楚谁能看到、会不会通知家长/学校/单位、病历能否复印、是否可以通过安全渠道沟通。不同地区规则差别很大；不要假设一定保密，也不要假设一定泄露。',
                },
                {
                    type: 'p',
                    text: '年龄也会改变规则：未成年人往往需要监护人同意或陪同，成年人通常有更多自主权，但各地差异很大。提前问清楚；不要伪造家长签字或冒充监护人。如果家庭不支持，找医生、社工或支持组织问是否有其他合法路径。',
                },
                {
                    type: 'p',
                    text: '如果你熟悉 GitHub，可以把这套流程想成：Issue 是“我想改变”，PR 是“HRT/手术申请”，review 是精神科评估，commit 是身体重构。现实比代码仓库麻烦：reviewer 可能永远不点 approve，还会给你挂一个 needs-info。你可以吐槽这个流程，但别为了 merge 去删掉唯一的安全测试——别隐瞒自杀想法、胸痛、晕厥这些真正危险的东西。身体不是 force push 能修好的仓库，很多改动不可回滚。',
                },
                {
                    type: 'p',
                    text: '被拒绝时：先要书面理由，问清楚缺的是诊断、观察时间、家属同意还是别的材料；保留副本；换医生或机构，或找跨性别支持组织问当地路径；必要时走申诉。拒绝不是对你身份的判决，更不是你该用伤害自己的方式去“证明”的东西。',
                },
                {
                    type: 'p',
                    text: '最后：这一节是经验和系统导航，不是医疗建议。具体诊断标准、激素和手术的适应证、法律文件要求，以当地医生、指南和法律为准。',
                },
            ],
        },
        {
            id: 'emergency',
            title: '应急计划：出问题了怎么办',
            level: 'basic',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        '平时就把重要账号、恢复码、紧急联系人、备用设备、少量现金和必要药物准备好，别等出事再翻箱倒柜。',
                        '怀疑账号被盗：先改密码，再检查/重设 2FA，然后看登录设备和活跃会话，把不认识的设备全部踢掉；顺手检查邮件转发规则和恢复邮箱。',
                        '怀疑身份被挖出来：先判断泄露到什么程度，暂停发新内容，把公开资料缩到最小，提醒可能被牵连的人；必要时换用户名和头像。',
                        '怀疑设备中招：先断网，保留证据，换一台干净设备改密码；可疑设备上不要再登录敏感账号，必要时重装系统。',
                        '被骚扰、被威胁：截图、录音、记下账号 ID 和时间线；不要单独赴约；告诉信任的人；必要时报警或找法律援助。',
                        '心理上：被曝光或被针对时，最容易陷入自责。这不是你的错；先睡觉、吃饭、保证基本安全，再处理技术问题。',
                    ],
                },
                {
                    type: 'p',
                    text: '不用一个人扛。通过安全渠道找信任的管理员、朋友或支持机构；涉及人身安全时，先找当地警方或专业救援。',
                },
            ],
        },
        {
            id: 'advanced-overview',
            title: '高风险场景的通用原则',
            level: 'advanced',
            blocks: [
                {
                    type: 'p',
                    text: '下面只讲原则，不写具体操作步骤。如果你正在被系统性针对、被跟踪，或面临人身危险，请先找专业机构和法律援助，不要一个人行动。',
                },
                {
                    type: 'ul',
                    items: [
                        '身份和设备分开：敏感活动用另一套设备、账号和网络，别让两边留下能对上的痕迹。',
                        '信息给到够用为止：只提供完成目的所必需的部分；凡是“先交隐私再帮忙”的要求，一律拒绝。',
                        '分区隔离：把真实身份、社区身份、资金和社交圈分开放；一个隔间漏水，不要淹到其他隔间。',
                        '先假设已经中招：不要只改一个密码；按账号、设备、网络、资金四条线分别排查。',
                        '证据先留住：被威胁时先截图、保存聊天记录、邮件头和转账记录，加密备份，必要时整理时间线。',
                        '心理支持：被曝光或被针对时，自我攻击是最常见的陷阱；尽早找可信赖的人。',
                        '应急准备：提前想好证件、药物和资金怎么拿，突发时才能走得动。',
                    ],
                },
                {
                    type: 'warn',
                    text: '和执法部门打交道时：不要撒谎，少说，要求律师。不撒谎不会让你多损失什么；编造可能让你失去一切。本指南绝不建议伪造文件、冒充官员或妨碍司法程序。',
                },
            ],
        },
        {
            id: 'advanced-targeted',
            title: '被系统性针对时',
            level: 'advanced',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        '不要正面硬刚：不要独自去见跟踪者，不要“反黑”对方，也不要公开约架；先保证人身安全。',
                        '打破规律：换通勤路线、作息和常去地点；不要在社交平台实时发位置。',
                        '保护核心圈子：提醒家人朋友不要向陌生人透露你的信息；和重要联系人约定一个只有你们知道的暗号。',
                        '清理数字足迹：旧账号、旧帖子、旧邮箱、旧手机号；能删就删，删不掉就降低可见性。',
                        '检查设备：注意异常耗电、发热、流量、陌生应用和配置描述文件；必要时找可信的专业人士检查。',
                        '找外部支持：法律援助、社工机构、心理支持、当地 LGBTQ+ / 跨性别支持组织；不要一个人扛。',
                    ],
                },
                {
                    type: 'warn',
                    text: '不要试图用违法手段“以暴制暴”或伪造身份反击。那会把你自己置于更大的风险里，也会让真正需要帮助的人更难被相信。',
                },
            ],
        },
    ],
};

const EN: OpSecContent = {
    title: 'Everyday Operations & Security',
    disclaimerTitle: 'Disclaimer (please read first)',
    disclaimer: [
        'This guide was compiled by community members from public materials and common security practices. It is general educational and self-protection information, not an official tutorial, official policy, or official donation guide from the project, and it does not represent the project’s endorsement of any tool, service, coin, or platform.',
        'This guide is not legal, financial, investment, tax, medical, or security-audit advice. Laws and regulations vary widely between jurisdictions. Before taking any action that could affect your rights, money, privacy, or physical safety — or those of others — consult a qualified professional in your area.',
        'Every security measure has limits. We cannot guarantee that any tool, link, method, or third-party service mentioned here will remain safe, available, untampered with, or suitable for your situation. Verify the source, license, permissions, and risks of any software, website, or service before using it.',
        'You are fully responsible for your own actions. Follow local law. Do not use this guide for fraud, money laundering, tax evasion, sanctions evasion, stalking, harassment, impersonation, privacy violations, or any other illegal activity.',
        'Privacy technology is neutral: it protects journalists, survivors of domestic and sexual violence, sexual and gender minorities, people with chronic illness, and ordinary people going about their lives. But technology can also be abused. We oppose abuse in all forms and do not provide assistance for it.',
        'Cryptocurrency is highly volatile, on-chain transactions are irreversible, and wallets, exchanges, DEXs, swap services, and stablecoins can fail, be attacked, be frozen, or disappear. The wallet and exchange material here is about personal money management and privacy only. It is not investment advice and promises no returns.',
        'If you face physical danger, stalking, extortion, harassment, or a mental-health crisis, contact local law enforcement, legal aid, medical services, or a professional support organization first. Do not rely on this guide alone.',
        'Third-party names, trademarks, and projects appear for explanation only and do not imply any affiliation, sponsorship, or endorsement. By continuing to read, you understand and agree that you evaluate and bear all risks of using this guide.',
    ],
    intro: 'This should be a community where we can feel safe — but safety does not come from trusting one person or one website. It comes from each of us knowing how to protect ourselves. This guide is not meant to scare you. It is meant to help you keep risk outside the door: first decide what is worth protecting, then build simple habits you can actually sustain.',
    basicHeading: 'Basics: protect yourself first',
    advancedHeading: 'Advanced: high-risk scenarios and incident response',
    advancedNote:
        'The following section is for more extreme situations: systematic targeting, stalking, a real physical threat, or a suspicion that your device or accounts have already been compromised. Most members may never need it. Use it according to your own situation, only for legitimate self-defense, and never do anything illegal. If your physical safety is threatened, contact local law enforcement, legal aid, or a trusted professional organization first.',
    sections: [
        {
            id: 'threat-model',
            title: 'First ask: what are you protecting, and from whom?',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'Security is not about installing the most complicated tools. It starts with three questions: which information would hurt you if it leaked, who might come looking for it, and how much time you are willing to spend.',
                },
                {
                    type: 'ul',
                    items: [
                        'What to protect: your real identity, home and movements, school or employer, close relationships, medical and medication information, money, and any part of your past you do not want public.',
                        'Possible adversaries: a passing stranger online, a rejected admirer, an acquaintance, a scam ring, platform moderators, or even systematic surveillance. The stronger the adversary, the more separation you need.',
                        'Consequences: online harassment, stalking, being outed, losing a job, or physical danger. The heavier the consequence, the more preparation is worth it.',
                        'Sustainability: an ordinary habit you can keep for years beats an extreme routine you abandon after three days.',
                    ],
                },
                {
                    type: 'warn',
                    text: 'Do not chase “absolute security.” No system in the world is absolutely secure; there are only ways to reduce risk to an acceptable level. Protecting yourself so hard that you become isolated is also a failure.',
                },
            ],
        },
        {
            id: 'identity',
            title: 'Core principle: separate your community identity from your real identity',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'This is the most important rule in this guide. As long as there is no verifiable link between the two identities, it is very hard for anyone to find you no matter how well they search. The goal is not to invent a perfect lie; it is to keep unnecessary real information from appearing at all.',
                },
                {
                    type: 'ul',
                    items: [
                        'Prepare a separate nickname, avatar, and bio for this community. Do not let them overlap with your QQ, WeChat, Weibo, game ID, email prefix, or the handle you use everywhere else.',
                        'Keep real names, phone numbers, schools, employers, home addresses, exact locations, face photos, voice recordings, ID documents, and medical records out of posts, DMs, and your profile.',
                        'Age, hobbies, region, and daily schedule look harmless, but they are often the fastest way to narrow a search. Leave them blank when you can; when you cannot, keep them vague.',
                        'Use a different handle on every platform. Do not copy the same avatar, self-introduction, or registration email from place to place.',
                        'Never keep your community account and your real-life accounts signed in on the same device or in the same browser.',
                    ],
                },
                {
                    type: 'p',
                    text: 'Try a simple test: lay out everything you have said and posted in this community. Could someone piece together your school, employer, or home? If even one thread leads there, delete it or change it.',
                },
            ],
        },
        {
            id: 'accounts',
            title: 'Accounts, passwords, and two-factor authentication',
            level: 'basic',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        'Give every account its own strong password. Birthdays, phone numbers, keyboard patterns, and one password reused everywhere do not count.',
                        'Use a password manager to generate and store them. KeePassXC can stay fully offline; Bitwarden is more convenient, but guard the master password carefully.',
                        'Enable 2FA on this community and every important account. Use an authenticator app (Aegis, FreeOTP, Ente Auth) instead of relying on SMS alone.',
                        'Write recovery codes on paper or keep them somewhere offline. Do not screenshot them into your gallery, cloud drive, or chat history.',
                        'Review signed-in devices and active sessions from time to time. If a device is not yours, sign it out and change the password immediately.',
                        'Security-question answers can be invented as long as you can remember them. Do not use your mother’s maiden name or birth city — those are easy to look up.',
                    ],
                },
                {
                    type: 'warn',
                    text: 'Real staff will never DM you for your password, verification code, or recovery code. A verification code is the account itself; whoever takes it can sign in as you.',
                },
            ],
        },
        {
            id: 'photos',
            title: 'Photos, voice, and metadata',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'A phone camera quietly writes GPS coordinates, capture time, and device model into the file. Voice and video are biometric data too. A single photo or voice message can locate you more precisely than you expect.',
                },
                {
                    type: 'ul',
                    items: [
                        'Strip EXIF before posting: use ExifTool or ImageOptim on desktop, and the “remove location / metadata” option in your phone’s gallery.',
                        'Check the background: landmarks outside the window, school uniforms, door plates, courier labels, class schedules, work badges, medical records, and medication boxes all give you away.',
                        'Do not outsource cleanup to a social app. Process important images yourself, and re-screenshot or re-compress them when needed.',
                        'Avoid voice and video when you can. Your voice is a biometric identifier, and background announcements, station names, local accents, and room echo reveal your environment.',
                        'Never photograph and send ID documents, medical records, prescriptions, or test reports. If verification is demanded, ask what it is for and whether the minimum information would be enough.',
                        'Before you post, look again: mirrors, reflections, the view outside, the courier label on the desk.',
                    ],
                },
            ],
        },
        {
            id: 'messaging',
            title: 'Private messaging: SimpleX first, Signal second',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'WeChat, QQ, SMS, ordinary email, and normal Telegram chats are not suitable for sensitive material. They can be read, retained, reviewed, or leaked wholesale after one account theft.',
                },
                {
                    type: 'ul',
                    items: [
                        'For first anonymous contact, or someone you just met in the community and do not yet trust: prefer SimpleX. It asks for no phone number or email, has no fixed user ID, connects through one-time invitation links, encrypts messages end-to-end, and leaves very little metadata.',
                        'For people you already know and need a stable long-term channel with: Signal works well. It needs a phone number, so use a separate number rather than your real-name primary line; it suits a trusted small circle.',
                        'For long messages, files, or cross-platform contact, use PGP-encrypted email. Verify public-key fingerprints through a second channel before sending.',
                        'Whatever tool you use, keep ID cards, medical records, addresses, schools or employers, tickets, and courier labels out of chat. If you must send them, blur, crop, and encrypt first.',
                        'Turn off lock-screen previews and cloud backups. If your phone is lost or inspected, previews and backups often leak more than the messaging app itself.',
                    ],
                },
                {
                    type: 'warn',
                    text: 'End-to-end encryption protects the transport only. It does not protect an unlocked phone, a screenshot, a forwarded message, or a cloud backup. The right tool is step one; habits matter more.',
                },
            ],
        },
        {
            id: 'browsing',
            title: 'Browsing, Tor, and VPNs',
            level: 'basic',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        'When visiting this site, use Tor Browser or a VPN you trust. For third-party mirrors, first find out who maintains them and whether they have been tampered with.',
                        'Disable JavaScript when you can; at the very least, do not grant permissions casually on sites you do not trust. JavaScript is a major entry point for fingerprinting and behavior analysis.',
                        'Do not squeeze your community identity and real identity into one browser. Use a separate browser profile at minimum, and ideally a separate device.',
                        'Keep extensions to a minimum. Every extension can see the pages you visit; remove the ones you no longer use.',
                        'Type important addresses manually or use bookmarks. Do not click login links from DMs, emails, or search ads.',
                        'Keep your browser, operating system, and apps updated. Many intrusions exploit vulnerabilities that were patched long ago.',
                    ],
                },
                {
                    type: 'p',
                    text: 'Tor and VPNs are not the same thing. Tor routes your traffic through multiple relays and hides your real IP, but it is slow, and the exit node can see unencrypted traffic. A VPN encrypts only the link between you and the VPN server; the VPN operator can still see your real IP and the destinations you visit.',
                },
                {
                    type: 'p',
                    text: 'A trusted VPN can be one you build yourself with WireGuard on a VPS, or a commercial service with a good reputation and a clear logging policy. Do not use a free VPN from an unknown operator. A self-hosted VPN is not an invisibility cloak either: the VPS provider can still see your server’s IP.',
                },
                {
                    type: 'p',
                    text: 'If your threat model is high, use Tor. If you mainly want to stop your local network or ISP from watching, a trusted VPN is usually enough. Do not treat “VPN” as a synonym for “absolutely anonymous.”',
                },
                {
                    type: 'p',
                    text: 'Private browsing only reduces local traces; it does not make you anonymous. Real anonymity comes from the combination of network layer (Tor/VPN), browser fingerprint, and account separation.',
                },
            ],
        },
        {
            id: 'official-site',
            title: '“Official website” does not mean absolutely secure',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'This is the project’s official site, and we try to keep the code open and auditable. But “official” only means it is maintained by the project; it does not mean it cannot be compromised. No system in the world is absolutely secure. Even if our business logic has no flaw, a problem anywhere upstream can affect the app running in your browser.',
                },
                {
                    type: 'ul',
                    items: [
                        'Dependency supply chain: an npm package, open-source library, or build tool is poisoned or exposes a remote code execution (RCE) vulnerability. We can be affected without changing a line of our own code.',
                        'Hosting and deployment: a hosting platform, CI/CD pipeline, domain, CDN, or administrator account is compromised, and the page is altered or injected with malicious scripts.',
                        'Third-party resources: analytics, fonts, icons, support widgets, or other external scripts are hijacked and can execute code inside the page.',
                        'Your own environment: a browser extension, input method, proxy tool, or operating system is compromised, making a “normal-looking” page dangerous.',
                    ],
                },
                {
                    type: 'p',
                    text: 'So: do not enter your real name, ID documents, address, or employer just because “it is the official site.” Check the domain and certificate before important actions. Keep independent backups. If the page behaves strangely, shows a certificate warning, or redirects unexpectedly, stop using it and report it through a trusted channel. If your threat model is high, consider self-hosting, pinning versions, and reviewing every update.',
                },
                {
                    type: 'warn',
                    text: 'Security is not a one-time check that makes you safe forever. It is the ongoing work of lowering probability and limiting damage. Treat the official site as a relatively trustworthy tool that still deserves caution — not as a vault.',
                },
            ],
        },
        {
            id: 'money',
            title: 'Money and cryptocurrency: convenience and privacy are different things',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'The following is general personal money-management advice, not an official project tutorial or donation policy. Start with the purpose: small everyday spending, receiving donations, long-term savings, or privacy-sensitive transactions. Use different wallets for different purposes, and do not keep all your assets in one place.',
                },
                {
                    type: 'ul',
                    items: [
                        'Small, everyday amounts that need fiat on- and off-ramps: a regulated KYC exchange or custodial wallet can be acceptable, as long as the amount stays within what you can afford to lose. The cost of KYC is that your identity is tied to the funds, so it is not a tool for anonymity.',
                        'Larger amounts, or situations where privacy matters more: use a non-custodial wallet plus a DEX or on-chain swap, and hold the private keys yourself. DEXs usually do not require KYC, but the chain is public, liquidity and slippage risks are higher, and fake tokens are common.',
                        'Cake Wallet: an open-source, non-custodial multi-currency wallet supporting Monero, Bitcoin, Ethereum, and more, with built-in exchange/swap. It is convenient for swapping XMR into other currencies. Swaps are usually fulfilled by third-party liquidity providers, and some routes may require KYC; test with a small amount and confirm arrival before continuing.',
                        'Monero GUI: the official Monero wallet. It can run a local full node (monerod). A self-hosted node gives the best privacy and verification, but the blockchain is large, the first sync is slow, and it consumes disk and bandwidth — it can be a hassle for ordinary users. A remote node is easier, but the node operator can see your IP and query patterns.',
                        'Bitcoin Core: a Bitcoin full node gives the most reliable verification, but the chain and sync cost are even higher. You can pair it with Electrum Personal Server / Sparrow and similar tools to use your own node while balancing verification and privacy. Note: BTC is pseudonymous, not anonymous; address reuse and KYC transactions make it easy to link payments.',
                        'BTC or Monero: BTC is highly decentralized, widely accepted, and has a transparent ledger, which makes it suitable for donations, accounting, and long-term savings. Monero is private by default, which suits individuals who do not want their transactions publicly linked. You can split them by purpose; it is not either/or.',
                        'Receiving donations: use a dedicated receiving address, prefer a mainstream asset such as BTC, and keep records of source and purpose. Do not mix donation funds with personal wallets, and do not accept large transfers of unknown origin. BTC’s transparent ledger makes public accounting easier; Monero offers better privacy, but its opacity makes it unsuitable for donations that need public auditing.',
                        'Tainted-money risk: on-chain assets come with no guarantee of cleanliness. Incoming coins may originate from fraud, gambling, sanctioned addresses, or stolen funds. Chain-analysis firms score addresses, and exchanges may freeze your account as a result. Do not accept “cheap coins” or “help me move this through your wallet” requests from strangers; that can make you part of a money-laundering chain.',
                        'Store seed phrases offline: write them on paper or metal, never photograph them, never put them in the cloud, never send them in chat, and never store them on a networked device outside your password manager.',
                        'Use a hardware wallet for large amounts; use separate wallets for separate purposes; test with a small amount every time; verify the address on the device screen before sending.',
                        'Download wallets only from the official website or official app-store links. Beware of fake apps, fake support agents, fake airdrops, and “asset recovery” scams.',
                    ],
                },
                {
                    type: 'warn',
                    text: 'This section is about personal money protection and privacy. It is not a tutorial for money laundering, tax evasion, sanctions evasion, or fraud. Privacy technology itself is not a crime; abusing it is. Follow local law.',
                },
                {
                    type: 'p',
                    text: 'Compliance note: whatever the amount, do not deliberately split transactions to evade reporting, tax, or exchange risk controls. Report what must be reported and keep the records you are required to keep.',
                },
                {
                    type: 'p',
                    text: 'If you receive suspicious funds: do not rush to move or spend them. Preserve evidence, contact the compliance team of your wallet or exchange, and consult a lawyer if necessary.',
                },
            ],
        },
        {
            id: 'phishing',
            title: 'Phishing and social engineering: five red flags',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'Social engineering does not attack code; it attacks people. First it earns trust, then it creates pressure, and finally it gets you to hand over information or click a link yourself. No amount of technical skill protects you if you send the verification code yourself.',
                },
                {
                    type: 'ul',
                    items: [
                        'Sudden warmth or coincidence: someone understands you unusually well right after meeting, messages you constantly, and rushes intimacy.',
                        'Urgency and fear: act now, your account will be banned, a family member is in trouble, the police are looking for you, you will miss out.',
                        'Authority claims: self-described administrator, moderator, official support, police officer, doctor, or investment adviser.',
                        'Requests beyond what is necessary: school, city, address, ID documents, bank card, voice, video, verification code, screen sharing.',
                        'Isolation or secrecy: do not tell anyone, let us move to another platform, click this link, install this remote-access tool.',
                    ],
                },
                {
                    type: 'p',
                    text: 'If any of these appear, stop. Verify through the official entry point you already know — not the link the other person sent. Do not decide under pressure. Never give verification codes, passwords, or recovery codes to anyone. Do not install remote-control software. Do not transfer money.',
                },
                {
                    type: 'warn',
                    text: 'People who genuinely respect you will not get angry because you say “I need to verify this first.” Anyone who explodes, threatens, or pressures you at that point is already a red flag.',
                },
            ],
        },
        {
            id: 'scenario',
            title: 'Scenario: a social-engineering attempt that almost worked',
            level: 'basic',
            blocks: [
                {
                    type: 'quote',
                    text: 'Xiao Lu posted about his medication experience in the community. A few days later, someone named “A-Lan” messaged him: “What you wrote felt real. I have been through something similar — can we talk?”',
                },
                {
                    type: 'p',
                    text: 'A-Lan was good at conversation. He remembered which game Xiao Lu liked, comforted him when he seemed low, and never rushed him for information. Two weeks later, A-Lan asked for a voice message to confirm he was “not a bot.” A few days after that, he asked whether Xiao Lu was also in a certain city, saying he might visit next month. Xiao Lu mentioned a broad region but not an address.',
                },
                {
                    type: 'p',
                    text: 'Then one night came the turn. A-Lan sent a link: “People have been stealing accounts in the community. Click here to verify your account so you do not lose it.” The page looked almost identical to the official site and asked for a username and password. Right after that, A-Lan said his account had been frozen and asked to borrow 0.05 BTC, promising to repay tomorrow.',
                },
                {
                    type: 'p',
                    text: 'Xiao Lu almost clicked. Then three things stopped him. First, official staff never send login links by DM. Second, the other person kept creating urgency — “do it now or it will be too late.” Third, A-Lan had been asking about his city one moment and asking for money the next; the timing was too neat. He did not click. He opened the official site himself, confirmed from the announcements that no “account-loss verification” existed, then screenshotted the conversation, reported it, and blocked the account. When A-Lan realized the scam had failed, he first got angry and accused Xiao Lu, then deleted the account.',
                },
                {
                    type: 'p',
                    text: 'The attack chain is typical: build rapport → test compliance with small requests → gradually extract linkable information → create an emergency → finish with a phishing link or a transfer. Each step looks harmless; together they are dangerous.',
                },
                {
                    type: 'ul',
                    items: [
                        'Slow down. Any request that demands an immediate decision can wait.',
                        'Verify through another channel. Use the official site, official announcements, or an administrator you already know — not the link or contact details the other person gave you.',
                        'Keep information minimal. Voice, video, ID documents, address, verification codes, and seed phrases are never required for a chat.',
                        'Refusing can be polite: “I am not comfortable sharing that,” “I will check the official site myself,” “I never give verification codes to anyone.”',
                        'Preserve evidence and report. Screenshot, save the account ID and timeline, and give it to the administrators or platform. Do not keep arguing with the person alone.',
                    ],
                },
            ],
        },
        {
            id: 'persona',
            title: 'Chatting online: keeping a persona without getting linked',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'A “persona” here is not an elaborate fake identity. It is a minimal, stable, unverifiable public image. The goal is not to deceive people; it is to keep unnecessary details of your real life outside the conversation.',
                },
                {
                    type: 'ul',
                    items: [
                        'Prepare only a minimal profile: a nickname, a broad age range, a broad occupational direction, and two or three ordinary hobbies. Do not invent a specific school, employer, neighborhood, birthday, or family.',
                        'Stay consistent. Keep the profile in an encrypted note; do not be 20 today and 25 tomorrow. But do not invent more details than you need — the simpler it is, the less there is to trip over.',
                        'Keep it unverifiable. Give your region only as a broad area or country, your job only as “I work in design / write code / am a student,” and your schedule only as “recently.” Do not post photos that can be geolocated.',
                        'Compartmentalize. Separate account, separate email, separate browser profile. Do not sign in to the community identity on the device where your real accounts live. Do not reuse avatars or photos.',
                        'Avoid writing-style linkage. Do not paste the same self-introduction across platforms. Avoid distinctive catchphrases. Do not like, repost, or interact between your identities.',
                        'Avoid voice and video. Do not send voice messages, make video calls, or post selfies. If a photo is unavoidable, use one with no face, no background, and no EXIF, and check reflections and desk details.',
                        'In conversation, use questions, vagueness, and topic changes. You do not owe an answer to every question. “I would rather not talk about that” and “that is not important” are complete sentences.',
                        'Do not volunteer dramatic stories. The more ordinary and boring the persona, the safer it is. Do not impersonate a real person, an official, or a professional.',
                    ],
                },
                {
                    type: 'warn',
                    text: 'A persona is not a crime tool. Do not use it to defraud, impersonate someone, evade legal responsibility, or harm others. Its purpose is privacy, not deception.',
                },
                {
                    type: 'p',
                    text: 'If you slip: do not panic and pile on more lies. Note what leaked, assess whether it can be linked to your real identity, and if necessary change accounts, cut contact, and warn friends who might be affected. A small mistake usually still leaves room to recover.',
                },
            ],
        },
        {
            id: 'family',
            title: 'Living with family: check-ins, medication, and hiding it',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'For most people, the risk is not the dark web. It is the dinner table, the bedroom, and the backpack: a parent walks in without knocking, searches a drawer, checks a phone, or casually asks, “What are you taking?” The goal is not a perfect lie. It is to keep the routine short, leave fewer traces, and stay steady if questioned.',
                },
                {
                    type: 'p',
                    text: 'First, be clear about this: if a parent might hit you because of medication you take, that is not a “family matter.” It is violence. The steps below are temporary risk reduction, not a long-term solution. Find a trusted adult, doctor, social worker, or local support organization as soon as you can and make a safety plan together.',
                },
                {
                    type: 'p',
                    text: 'First confirm that your tablet is actually meant to be taken sublingually. Not every estradiol tablet is suitable for sublingual or buccal use; some are designed to be swallowed. Follow the prescription, the patient leaflet, and your doctor or pharmacist. Do not change the route on your own. What follows is only about reducing discovery when you have already been told to take it sublingually; it is not dosing advice.',
                },
                {
                    type: 'p',
                    text: 'There is no guaranteed way to talk with a sublingual tablet in your mouth and show nothing. The safest approach is not to talk while it dissolves: place it under your tongue, keep your mouth closed, and wait until most of it is gone. Estradiol tablets usually take several minutes to more than ten; talking, swallowing, and moving your tongue can dislodge the tablet and increase the amount you swallow.',
                },
                {
                    type: 'p',
                    text: 'If a parent calls you while it is in your mouth: do not open your mouth to answer. Knock on the table, text “I’m brushing my teeth / in the bathroom, one minute,” or take a sip of water and pretend to rinse. If you must answer, use the shortest possible phrase — “Coming,” “Brushing my teeth” — then close your mouth again. Do not try to hold a normal conversation. Better yet, plan ahead: take it while showering, brushing your teeth, changing clothes, taking out the trash, or organizing a locked room, and give yourself 10–15 minutes.',
                },
                {
                    type: 'p',
                    text: 'Practice with a mint or a vitamin tablet about the same size as your medication (do not practice repeatedly with the real pill). Put it under your tongue, set a five-minute timer, and practice not speaking, nodding, pointing at your phone, writing, and walking slowly. A few rounds will show you your limit. Do not take extra doses just to “build tolerance.”',
                },
                {
                    type: 'p',
                    text: 'If you are seen: do not grab, do not swallow a handful, and do not insist “it is candy” if the other person has already read the packaging. Stay calm and put the medication away. If it was prescribed, you can say, “I am taking this as my doctor instructed, and I do not want to discuss it right now.” If it was not, say as little as possible, leave the room, and do not invent a complicated medical story. If the other person may become violent, keep a clear path to the door, do not turn your back, and do not argue.',
                },
                {
                    type: 'p',
                    text: 'Injections are harder to hide and demand better hygiene. Only inject somewhere you can lock the door, wash your hands, and lay supplies flat. Put down a clean paper towel, keep alcohol pads, cotton, needles, and a sharps container within reach, and follow the order a doctor or nurse taught you. Do not rush. Rushing, poor lighting, and interruptions are more dangerous than being discovered. If you have not been trained, ask a clinician to teach you; do not improvise. This is not an injection tutorial; dose, site, frequency, and whether injection is appropriate are determined by your prescription and clinician.',
                },
                {
                    type: 'p',
                    text: 'Needles should be single-use only: open one, use it once, and dispose of it immediately in a sharps container with a lid or a thick rigid container. Do not clean, disinfect, or save it for later, and do not reuse or share it. Keep the sharps container in a locked box. Never put needles in kitchen trash, plastic bags, or the toilet. Do not recap used needles; if you must, use one hand.',
                },
                {
                    type: 'p',
                    text: 'Hiding places: common spots can work, but choose them for “dry, dark, cool, fixed, and not casually searched.” Behind a headboard or the back panel of a drawer works for a sealed bag with desiccant. A backpack lining is for short trips only, not long-term storage, and school bags may be searched. A storage box that never moves is fine only if it is not near a radiator, window, bathroom, or car. A gap in old textbooks works for flat blister packs; do not crush them, and do not use school or library books.',
                },
                {
                    type: 'p',
                    text: 'A better default is a small lockbox in a fixed place you know — the top of a closet, deep under the bed, or another spot only you use. A lockbox is easier to remember than a rotating set of hiding places and less likely to be found by accident. Do not put medication in unlabeled bottles, food jars, or supplement bottles; in an emergency you may take the wrong thing. Keep the original packaging and prescription label inside the lockbox. If you must use a decoy container, write the drug name, dose, and date inside it.',
                },
                {
                    type: 'p',
                    text: 'Do not store medication in the bathroom (humidity), kitchen (heat and grease), on a windowsill or radiator (heat), in a car (temperature swings), in the freezer (freezing can damage some drugs), or anywhere pets or small children can reach.',
                },
                {
                    type: 'p',
                    text: 'Packaging, bills, and phones leak too: pharmacy receipts, delivery boxes, prescription bags, bank or insurance statements, pharmacy texts, and health-app notifications can all be seen. Put packaging in an opaque bag when you take out the trash; turn off message previews; use neutral calendar labels (“appointment,” “pick up package”); and do not sign in to health apps with a shared family account.',
                },
                {
                    type: 'p',
                    text: 'If a parent searches your room: you cannot fully prevent it, but you can limit the damage. Keep essential medication in the lockbox, have a plan for what to say and where to go if it is found, and do not carry every pill on you when you are discovered. Do not flush medication down the toilet. Afterwards, move it somewhere safer and contact your doctor or someone you trust.',
                },
                {
                    type: 'warn',
                    text: 'Being hit, threatened, or thrown out of the house is not “the price you pay.” If you are experiencing this, contact a trusted adult, teacher, doctor, social worker, or local LGBTQ+ / trans support organization. If you are in immediate danger, call your local emergency number. Do not carry this alone.',
                },
            ],
        },
        {
            id: 'school',
            title: 'When classmates ask: low-information scripts',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'The risk at school is usually not “being located by a hacker.” It is being stared at, mocked, or pressured to declare something. You do not owe anyone proof of your identity. Use the shortest, dullest, most retractable sentence you can and move the conversation away.',
                },
                {
                    type: 'p',
                    text: 'One common harm-reduction approach is to replace “trans” — a label that is more likely to be targeted — with “style / sexual orientation / still exploring.” For example:',
                },
                {
                    type: 'ul',
                    items: [
                        '“I’m a femboy. I just like wearing girls’ clothes; I think it’s cute. This is my first time trying it.”',
                        '“I’m pansexual. I’m attracted to people, not gender. The clothes are just my style.”',
                        '“I’m still figuring it out. I don’t want to lock myself into a label.”',
                        '“It’s just a personal interest. It doesn’t affect anyone else.”',
                        '“I’d rather not talk about this. Let’s change the subject.”',
                    ],
                },
                {
                    type: 'p',
                    text: 'Why this can be safer in some places: “wearing girls’ clothes / sexual orientation” may be treated as “personal style” or “a phase,” while “trans” can trigger a stronger reaction. But it is not a universal shield. Femboys and pansexual people are also targeted by homophobia and transphobia; if the other person has already decided you are trans, a different label may not help.',
                },
                {
                    type: 'p',
                    text: 'How to use it: keep it short, casual, and light on detail. Change the subject after one sentence. Do not invent a complicated backstory — every school, city, and timeline is another thing that can fall apart. Do not put down other trans people to protect yourself. “I’m not one of those” hurts others and leaves you more isolated.',
                },
                {
                    type: 'p',
                    text: 'If someone keeps asking, “Are you trans?”: “I’m still thinking about it, and I don’t want to discuss it now,” or “Why do you ask?” If they start mocking you, surrounding you, or getting physical, do not debate. Leave and go where there are teachers, cameras, or other students, and find someone you trust.',
                },
                {
                    type: 'p',
                    text: 'If a teacher says, “Why can’t you dress normally?”: you do not have to debate gender theory in class. “I’m dressing in a way that feels right to me, and it is not disrupting the class” is enough, then return to the lesson. If a teacher humiliates or punishes you, record the time, place, and exact words, and tell a safe parent or guardian, the school counselor, or the local education authority.',
                },
                {
                    type: 'p',
                    text: 'Coming out is not a one-time exam. You can say “I’m exploring” today and “I don’t want to talk about it” tomorrow. That is not a contradiction. Labels are your tools, not answers to an interrogation.',
                },
                {
                    type: 'warn',
                    text: 'Do not force yourself to accept the femboy label just because it seems safer, and do not pretend to be a specific real person. Even if you think “saying femboy will get me hit less,” being hit is still violence, not a cost you are required to pay. If the environment is dangerous, prioritize leaving and getting help.',
                },
            ],
        },
        {
            id: 'medical',
            title: 'School health checks and medical privacy: do not induce vomiting',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'School health checks vary by place. Common items include height and weight, blood pressure, vision, spine, and heart and lung auscultation; some places also draw blood. If you are worried about exposing medication, injection marks, binding, or body changes, ask in advance: what will be checked, who performs it, who sees the results, whether you can speak to the clinician privately, and whether a private exam or a trusted adult companion can be arranged. Many schools allow privacy accommodations, but the rules depend on where you live; do not assume they exist, and do not assume they do not.',
                },
                {
                    type: 'p',
                    text: 'A safer route is to ask a trusted doctor, school nurse, social worker, or local LGBTQ+ / trans support organization about local rules. If appropriate, ask a clinician for a letter that says only that you need a private assessment or should not be examined in a group setting. Do not forge medical records, prescriptions, or a parent’s signature; forgery creates much bigger legal and family risks.',
                },
                {
                    type: 'p',
                    text: 'If you are simply nervous or genuinely unwell: tell a teacher or the school nurse, “I feel a bit dizzy / nauseous and need to sit down.” Sit down, sip water slowly, do not cycle or drive, and ask them to contact someone you trust. Telling the truth about a real symptom is more controllable than inventing a story that may get you sent to a hospital or have your parents called.',
                },
                {
                    type: 'warn',
                    text: 'High-risk behavior warning: do not use induced vomiting, emetics, throat stimulation, holding urine, dehydration, taking medication on your own, or faking a collapse to avoid a health check. Induced vomiting can cause aspiration, choking, esophageal tears, electrolyte imbalance, heart rhythm problems, and tooth erosion. Lying down to sleep right after vomiting is especially dangerous because you can choke on vomit during sleep. Do not use “I threw up, so I’m fine” as a safety test.',
                },
                {
                    type: 'warn',
                    text: 'If you have already vomited: rinse your mouth, stay upright or on your side, sip water, and tell a trusted adult. Seek urgent medical care for repeated vomiting, chest or abdominal pain, vomiting blood, dizziness that makes it hard to stand, or confusion. Do not sleep alone right away, and do not repeat it because it “worked” once.',
                },
                {
                    type: 'p',
                    text: 'A health check is not a choice between “comply with everything” and “avoid everything.” You can decline a particular item in that setting and ask to speak to the clinician privately, or ask for a trusted adult to be present. The real danger is using self-harm to get through one check. No exam result is worth aspiration, esophageal injury, or a heart rhythm problem.',
                },
                {
                    type: 'warn',
                    text: 'If a school forces group undressing, humiliates you, or discloses your medical information, record the time, place, people present, and exact words, and tell a trusted guardian, doctor, school counselor, local education authority, or legal aid. Do not face it alone.',
                },
            ],
        },
        {
            id: 'psychiatry',
            title: 'Psychiatry, the “transsexualism” diagnosis, and “the letter”: body reconstruction is not a single commit',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: '“Transsexualism” is the term used in some regions and older diagnostic systems; names, criteria, and procedures differ by place. This section is not a self-diagnosis tool and does not replace a clinician’s assessment. It discusses one thing only: how the gatekeeping can work when you need a diagnosis, referral, or letter, and how to avoid mistaking a system’s delay for “I am not trans enough.”',
                },
                {
                    type: 'p',
                    text: 'First, psychiatry is not only for “getting the letter,” and it is not only for people in crisis. Persistent low mood, anxiety, insomnia, appetite changes, being unable to study or work, self-harm or suicidal thoughts, and substance-use problems all deserve professional help. You can need mental health support and HRT or surgery at the same time; treating depression does not make gender dysphoria disappear, and hiding depression does not make an application easier.',
                },
                {
                    type: 'warn',
                    text: 'If you have recurrent suicidal thoughts, a plan, or urges to self-harm: that takes priority over any letter. Contact local emergency services or a crisis line, go to an emergency department, tell a trusted adult, and try not to be alone. Do not hide it to “keep your record clean”; hiding severe symptoms during an assessment can leave you without help when you are most at risk.',
                },
                {
                    type: 'p',
                    text: 'The structural problem: in some places, a conservative psychiatrist can delay, refuse, or repeatedly request more material, blocking HRT or surgical referral. That is not evidence that you are “not really trans,” and it is not your fault. What you can do: ask in advance which diagnosis and documents are required (observation period, real-life experience, family consent, and so on), whether informed consent or community health services are available locally, and whether you can get copies of your records. If refused, ask for the reason in writing, ask what is missing, and seek a trans-friendly clinician or local support organization. A second opinion is reasonable; forging records, diagnoses, or signatures is not.',
                },
                {
                    type: 'p',
                    text: 'If you do not currently have persistent, significant depression, anxiety, or functional impairment, and you do not urgently need a diagnosis or letter, you do not have to make a special trip to psychiatry just to “collect” a transsexualism diagnosis. But if the pathway you choose requires it, treat it as a document gate to prepare for, not an identity exam. Do not invent a story to please a clinician, and do not deny real distress to look “stable.”',
                },
                {
                    type: 'p',
                    text: 'Privacy: psychiatric records, diagnoses, and referral letters are sensitive. Ask who can see them, whether parents, schools, or employers will be notified, whether you can get copies, and whether you can communicate through a safe channel. Rules vary widely by place; do not assume confidentiality, and do not assume disclosure either.',
                },
                {
                    type: 'p',
                    text: 'Age changes the rules too: minors often need a guardian’s consent or accompaniment, while adults usually have more autonomy, but this varies widely. Ask in advance; do not forge a parent’s signature or pretend to be a guardian. If your family is unsupportive, ask a doctor, social worker, or support organization whether there are other lawful pathways.',
                },
                {
                    type: 'p',
                    text: 'If you know GitHub, you can think of the process as: the Issue is “I want to change,” the PR is the HRT or surgery application, review is the psychiatric assessment, and the commit is body reconstruction. Reality is messier than a repository: the reviewer may never click approve, and may label your PR needs-info for years. You can joke about the process, but do not delete your only safety test just to get the merge — do not hide suicidal thoughts, chest pain, or fainting, which are genuinely dangerous. A body is not a repository you can fix with a force push, and many changes cannot be rolled back.',
                },
                {
                    type: 'p',
                    text: 'If you are refused: ask for the reason in writing, ask whether the missing piece is a diagnosis, an observation period, family consent, or something else, keep copies, and seek another clinician or institution, or ask a trans support organization about local pathways. Appeal if necessary. A refusal is not a verdict on your identity, and it is certainly not something you should hurt yourself to “prove.”',
                },
                {
                    type: 'p',
                    text: 'Finally: this section is experience and system navigation, not medical advice. Specific diagnostic criteria, indications for hormones and surgery, and legal document requirements are determined by local clinicians, guidelines, and law.',
                },
            ],
        },
        {
            id: 'emergency',
            title: 'Emergency plan: what to do when something goes wrong',
            level: 'basic',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        'Prepare the basics before anything happens: a list of important accounts, recovery codes, emergency contacts, a backup device, some cash, and necessary medication. Do not wait until you are tearing the house apart.',
                        'If you suspect account theft: change the password first, then check or reset 2FA, review signed-in devices and active sessions, and sign out every device you do not recognize. Also check mail-forwarding rules and recovery email.',
                        'If you suspect your identity has been dug up: assess how much leaked, pause new posts, shrink your public profile to the minimum, warn people who might be dragged in, and change your username and avatar if needed.',
                        'If you suspect device compromise: disconnect from the network, preserve evidence, and change passwords from a clean device. Do not sign in to sensitive accounts on the suspect device; reinstall the system if necessary.',
                        'If you are harassed or threatened: screenshot, record, and note account IDs and a timeline. Do not meet alone. Tell someone you trust. Contact the police or legal aid when necessary.',
                        'Psychologically: after exposure or targeting, self-blame is the easiest trap to fall into. This is not your fault. Sleep, eat, and secure basic safety first; deal with the technical problems after.',
                    ],
                },
                {
                    type: 'p',
                    text: 'You do not have to carry this alone. Reach a trusted administrator, friend, or support organization through a secure channel. If physical safety is involved, contact local law enforcement or professional rescue first.',
                },
            ],
        },
        {
            id: 'advanced-overview',
            title: 'General principles for high-risk scenarios',
            level: 'advanced',
            blocks: [
                {
                    type: 'p',
                    text: 'What follows is principles, not a step-by-step playbook. If you are being systematically targeted, stalked, or physically endangered, seek professional organizations and legal aid first; do not act alone.',
                },
                {
                    type: 'ul',
                    items: [
                        'Separate identity and device: use a different device, account, and network for sensitive activity, and do not leave traces that connect the two sides.',
                        'Give information only on a need-to-know basis: provide the minimum required for the purpose. Refuse any “hand over your privacy first and then I will help” request.',
                        'Compartmentalize: keep your real identity, community identity, money, and social circles apart. If one compartment leaks, do not let the flood reach the others.',
                        'Assume compromise: do not change one password and call it done. Check four lines separately — accounts, devices, network, and money.',
                        'Preserve evidence first: when threatened, save screenshots, chat logs, email headers, and transfer records, back them up encrypted, and build a timeline if needed.',
                        'Get psychological support: after exposure or targeting, self-attack is the most common trap. Reach out to someone you trust early.',
                        'Prepare for emergencies: decide in advance how you would access documents, medication, and money so you can move quickly in a crisis.',
                    ],
                },
                {
                    type: 'warn',
                    text: 'When dealing with law enforcement: do not lie, say little, and ask for a lawyer. Not lying will not cost you anything extra; making things up can cost you everything. This guide never suggests forging documents, impersonating officials, or obstructing legal proceedings.',
                },
            ],
        },
        {
            id: 'advanced-targeted',
            title: 'When you are being systematically targeted',
            level: 'advanced',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        'Do not confront them head-on. Do not meet a stalker alone, do not “hack back,” and do not arrange a public fight. Physical safety comes first.',
                        'Break the pattern. Change your commute, schedule, and regular places. Do not post your location in real time on social media.',
                        'Protect your inner circle. Tell family and friends not to give your information to strangers. Agree on a code word that only your trusted contacts know.',
                        'Clean up your digital footprint: old accounts, old posts, old email addresses, old phone numbers. Delete what you can; reduce the visibility of what you cannot.',
                        'Inspect your devices. Watch for unusual battery drain, heat, data usage, unknown apps, and configuration profiles. Have a trusted professional check them if necessary.',
                        'Find outside support: legal aid, social services, mental-health support, local LGBTQ+ / trans support organizations. Do not carry it alone.',
                    ],
                },
                {
                    type: 'warn',
                    text: 'Do not use illegal means to “fight fire with fire” or forge an identity to strike back. That puts you at greater risk and makes it harder for people who genuinely need help to be believed.',
                },
            ],
        },
    ],
};

const ZH_TW: OpSecContent = {
    ...ZH,
    title: '日常操作與安全',
    basicHeading: '基礎：先保護好自己',
    advancedHeading: '進階：高風險與應急處置',
};

const CONTENT: Record<string, OpSecContent> = {
    zh: ZH,
    'zh-TW': ZH_TW,
    yue: ZH_TW,
    en: EN,
    ja: EN,
    ko: EN,
    tr: EN,
};

export function getOpSecContent(lang: string): OpSecContent {
    return CONTENT[lang] ?? EN;
}
