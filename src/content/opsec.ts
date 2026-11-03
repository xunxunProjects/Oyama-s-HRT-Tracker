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
    intro: string;
    basicHeading: string;
    advancedHeading: string;
    advancedNote: string;
    sections: OpSecSection[];
    references: string[];
}

const ZH: OpSecContent = {
    title: '日常操作与安全',
    intro:
        '这是一个让我们能够安心做自己的地方——但“安心”从每位成员知道如何保护自己开始。下面的内容不是为了吓你，而是帮你享受社区的同时，不因一个小疏忽就暴露真实身份。花三分钟读完，可能会省去很多麻烦。',
    basicHeading: '基础部分（每个人都该了解）',
    advancedHeading: '高风险场景（进阶）',
    advancedNote:
        '以下措施针对极端情况：被系统性针对、面临真实人身威胁等。大多数成员永远用不上，内容可能令人不安。请按自身情况评估，仅用于正当自卫，绝不做任何违法的事。如涉及人身安全威胁，请优先联系当地警方或专业支持机构。',
    sections: [
        {
            id: 'principle',
            title: '核心原则：把“在本站/社区中的你”和“现实中的你”彻底分开（视站点功能而定）',
            level: 'basic',
            blocks: [
                { type: 'p', text: '这是最重要的规则。只要两者不被连起来，别人无论怎么搜都追不到你的真实身份。' },
                {
                    type: 'ul',
                    items: [
                        '在本站/社区使用独立的用户名和头像，不要复用 QQ / 微信 / 微博 / 游戏 ID / 邮箱前缀；若站点无论坛/账号体系，则此条可跳过。',
                        '永远不要在帖子、私信或个人资料里透露：真实姓名、电话、学校、单位、家庭住址、所在城市/精确位置、真实照片或真实声音。',
                        '可能缩小搜索范围的资料字段（年龄、爱好、地区）最安全的做法是留空。',
                        '不同平台使用不同用户名，防止别人通过人肉搜索或用户名查询把你的账号跨站关联起来。',
                    ],
                },
            ],
        },
        {
            id: 'exif',
            title: '发布照片前，先剥离元数据（EXIF）',
            level: 'basic',
            blocks: [
                { type: 'p', text: '手机或相机拍照时，GPS 位置、拍摄时间、设备型号等信息会被自动写入文件。一张随手发的照片，就可能暴露你住在哪个小区。' },
                {
                    type: 'ul',
                    items: [
                        '上传前用工具清除 EXIF：桌面端用 ExifTool / ImageOptim；移动端在相册里用“移除位置/元数据”功能。',
                        '不要发布暴露位置的背景：窗外地标、校服、门牌、快递面单、课表、医疗记录等。',
                        '不要相信“相册/社交 App 会自动清理”——重要的照片自己先清理。',
                    ],
                },
            ],
        },
        {
            id: 'passwords',
            title: '密码与双重验证（2FA）',
            level: 'basic',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        '每个账号使用不同的强密码，避免生日、常见词或一个密码到处用。',
                        '用密码管理器生成和保存（KeePassXC 本地离线；或 Bitwarden）。',
                        '在本站和所有重要账号上开启 2FA（手机 App：Aegis / FreeOTP）；若站点无账号体系则跳过。',
                    ],
                },
            ],
        },
        {
            id: 'e2ee',
            title: '私密对话使用端到端加密',
            level: 'basic',
            blocks: [
                { type: 'p', text: '微信、QQ、短信、邮件都不适合涉及隐私的对话（可能被读取、留存、审查）。' },
                {
                    type: 'ul',
                    items: [
                        '涉及身份的私密沟通使用 Signal 或 Session（点对点加密、无痕迹）。',
                        'PGP 是好东西——如平台支持 PGP 模块可使用；重要内容发送前先加密。',
                    ],
                },
            ],
        },
        {
            id: 'browsing',
            title: '浏览习惯',
            level: 'basic',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        '访问官方网站 hrt.mahiro.uk 时，建议通过 Tor 代理或可信 VPN 进行，以降低被静默入侵与流量监听的风险；第三方部署的站点同理，务必确认其安全性后再使用。',
                        '尽可能在浏览器中关闭 JavaScript——显著降低指纹与打字行为被采集的风险。',
                        '如果可能，不要在同一台设备或同一浏览器里混用“本站/社区身份”和日常浏览。',
                    ],
                },
            ],
        },
        {
            id: 'phishing',
            title: '警惕钓鱼与社会工程',
            level: 'basic',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        '警惕突然出现的“友好陌生人”——线上或线下，尤其是反复试图套取个人信息的人。',
                        '小心“假紧急事件”：假车祸、假警察、家属出事的电话——目的是引你出门或套出信息。',
                        '不要轻信“帮你造假证件/找工作/出国”这类先要求你隐私的承诺。',
                        '记住：真正尊重你的人，永远不会逼你交出身份。',
                    ],
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
                        '提前想好：如果账号或身份暴露，第一步做什么？（改密码、切断联系、联系信任的人。）',
                        '重要数据用 VeraCrypt / LUKS 加密保存——永远不要以明文形式放在手机里。',
                        '出事时你并不孤单——通过安全渠道联系信任的管理员或朋友，不要独自硬扛。',
                    ],
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
                    text: '以下内容仅作原则性提示，不提供具体操作步骤。若你面临系统性威胁或人身危险，请优先求助专业机构与法律援助，不要独自行动。',
                },
                {
                    type: 'ul',
                    items: [
                        '身份与设备分离：敏感活动使用与日常完全不同的设备与账号，不留交叉痕迹。',
                        '信息最小化：只提供完成目的所必需的信息，拒绝一切“先给隐私再给帮助”的要求。',
                        '证据保全：受到威胁时，优先保存证据（截图、聊天记录）并加密备份，必要时寻求法律援助。',
                        '心理支持：被曝光或被针对时，自我攻击是最常见的陷阱；请尽早联系可信赖的支持者。',
                        '应急准备：提前准备好必要证件、药物与资金的获取方式，确保在突发情况下能迅速转移。',
                    ],
                },
                {
                    type: 'warn',
                    text: '与执法部门接触时：不要撒谎，少说，请求律师。不撒谎不损失什么；编造可能损失一切。本指南绝不建议伪造文件、冒充官员或妨碍司法程序。',
                },
            ],
        },
    ],
    references: [
        '完整指南（英文原版）：https://whos-zycher.github.io/opsec-guide/',
        'EFF, Surveillance Self-Defense: https://ssd.eff.org',
    ],
};

const EN: OpSecContent = {
    title: 'Everyday Operations & Security',
    intro:
        'This is a place where we can be ourselves safely — but being “safe” starts with every member knowing how to protect themselves. The following points are not meant to scare you, but to help you enjoy the community without accidentally exposing your real-world identity through a small oversight. Spending three minutes to read this may save you a great deal of trouble.',
    basicHeading: 'Basics (for everyone)',
    advancedHeading: 'High-risk scenarios (advanced)',
    advancedNote:
        'The following measures target extreme situations: being systematically targeted, facing real physical threats, etc. Most members will never need them, and the content may be unsettling. Assess based on your own circumstances, use only for legitimate self-defense, and never do anything illegal. If you face a physical threat, contact local law enforcement or professional support organizations first.',
    sections: [
        {
            id: 'principle',
            title: 'Core principle: keep “you on this site/community” and “you in real life” completely separate (applies only where relevant)',
            level: 'basic',
            blocks: [
                { type: 'p', text: 'This is the most important rule. As long as the two are not connected, others cannot trace your real identity no matter how they search.' },
                {
                    type: 'ul',
                    items: [
                        'Use an independent username and avatar on this site/community — do not reuse your QQ / WeChat / Weibo / game ID / email prefix; if the site has no forum/account system, skip this.',
                        'Never reveal in posts, private messages, or your profile: your real name, phone number, school, employer, home address, city / exact location, real photos, or your real voice.',
                        'Fields in your profile that can narrow you down (age, hobbies, region) are safest left empty.',
                        'Use different usernames on different platforms to prevent others from linking your accounts across sites via people-search databases (doxxing) or username lookups.',
                    ],
                },
            ],
        },
        {
            id: 'exif',
            title: 'Before posting photos, strip the metadata (EXIF)',
            level: 'basic',
            blocks: [
                { type: 'p', text: 'When you take a photo with your phone or camera, GPS location, capture time, device model and other information are embedded automatically. One casually posted photo may leak exactly which community you live in.' },
                {
                    type: 'ul',
                    items: [
                        'Use tools to remove EXIF before uploading: on desktop use ExifTool / ImageOptim; on mobile use the “remove location / metadata” feature in your gallery app.',
                        'Do not post backgrounds that reveal your location: landmarks outside your window, school uniforms, door plates, courier labels, class schedules, medical records, etc.',
                        'Do not trust that “my gallery / social app will automatically scrub it” — clean important photos yourself before posting.',
                    ],
                },
            ],
        },
        {
            id: 'passwords',
            title: 'Passwords and two-factor authentication (2FA)',
            level: 'basic',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        'Use a different strong password for every account. Avoid birthdays, common words, or one password reused everywhere.',
                        'Generate and store them with a password manager (KeePassXC, offline and local; or Bitwarden).',
                        'Enable 2FA wherever possible on this site and on all important accounts (mobile apps: Aegis / FreeOTP); skip if the site has no account system.',
                    ],
                },
            ],
        },
        {
            id: 'e2ee',
            title: 'Use end-to-end encryption for private conversations',
            level: 'basic',
            blocks: [
                { type: 'p', text: 'WeChat, QQ, SMS and email are not secure for conversations that touch your privacy (they can be accessed, retained, and reviewed).' },
                {
                    type: 'ul',
                    items: [
                        'For private communication that involves your identity, use Signal or Session (peer-to-peer encryption, no traces).',
                        'PGP is a good thing — use the site’s PGP module if available; encrypt important content before sending it.',
                    ],
                },
            ],
        },
        {
            id: 'browsing',
            title: 'Browsing habits',
            level: 'basic',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        'When accessing the official site hrt.mahiro.uk, prefer a Tor proxy or a trusted VPN to reduce the risk of silent compromise and traffic surveillance; the same applies to any third-party deployment — verify its safety before use.',
                        'Disable JavaScript in your browser when possible — it significantly reduces the risk of fingerprint and typing-behavior collection.',
                        'Do not mix your “site/community identity” with your everyday browsing on the same device or the same browser if possible.',
                    ],
                },
            ],
        },
        {
            id: 'phishing',
            title: 'Beware of phishing and social engineering',
            level: 'basic',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        'Be wary of “friendly strangers” who suddenly appear — online or in person — especially those who keep trying to extract personal information.',
                        'Be careful with “fake emergencies”: fake car accidents, fake police visits, calls saying family members are in trouble — all designed to lure you out or trick you into giving up information.',
                        'Do not trust promises like “I’ll fake your documents / find you a job / take you abroad” that first demand your privacy.',
                        'Remember: people who genuinely respect you will never pressure you into handing over your identity.',
                    ],
                },
            ],
        },
        {
            id: 'emergency',
            title: 'Emergency plan: what if something goes wrong?',
            level: 'basic',
            blocks: [
                {
                    type: 'ul',
                    items: [
                        'Think ahead: if your account or identity is exposed, what is your first move? (Change passwords, cut off contact, reach out to someone you trust.)',
                        'Store important data encrypted with VeraCrypt / LUKS — never in plaintext on your phone.',
                        'When trouble hits, you are not alone — reach out to a trusted administrator or friend through a secure channel. Do not grit it out alone.',
                    ],
                },
            ],
        },
        {
            id: 'advanced-overview',
            title: 'General principles for high-risk scenarios',
            level: 'advanced',
            blocks: [
                { type: 'p', text: 'The following are guiding principles only, not step-by-step instructions. If you face systematic targeting or physical danger, seek professional organizations and legal aid first; do not act alone.' },
                {
                    type: 'ul',
                    items: [
                        'Separate identity and device: use completely separate devices and accounts for sensitive activities, leaving no cross-traces.',
                        'Minimize information: provide only what is strictly necessary; refuse any request that demands privacy in exchange for help.',
                        'Preserve evidence: when threatened, prioritize saving evidence (screenshots, chat logs) and back it up encrypted; seek legal aid when needed.',
                        'Psychological support: self-blame is the most common trap after exposure or targeting; reach out to trusted supporters early.',
                        'Emergency readiness: prepare in advance how to obtain essential documents, medication, and funds, so you can move quickly in a crisis.',
                    ],
                },
                { type: 'warn', text: 'When dealing with law enforcement: don’t lie, say little, request a lawyer. Not lying costs you nothing; fabricating may cost you everything. This guide never suggests forging documents, impersonating officials, or obstructing legal procedures.' },
            ],
        },
    ],
    references: [
        'Full guide (original English version): https://whos-zycher.github.io/opsec-guide/',
        'EFF, Surveillance Self-Defense: https://ssd.eff.org',
    ],
};

const ZH_TW: OpSecContent = {
    ...ZH,
    title: '日常操作與安全',
    basicHeading: '基礎部分（每個人都該了解）',
    advancedHeading: '高風險場景（進階）',
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
