import type { OpSecContent } from './types';

const EN: OpSecContent = {
    title: 'Everyday security',
    contentsLabel: 'On this page',
    disclaimerTitle: 'Disclaimer',
    disclaimer: [
        'This guide was put together by community members from public sources. It is general safety advice, not the project’s official position, and not legal, medical, financial or other professional advice.',
        'Any tool or method here can fail, be tampered with or not fit your situation; check it yourself before you rely on it, follow your local laws, and never use it to harm anyone.',
        'If you are in physical danger, being stalked or harassed, contact local police, legal aid or a support organisation first.',
    ],
    intro: 'This should be a community where we can feel safe, but safety does not come from trusting one person or one website. It comes from each of us knowing how to protect ourselves. This guide is not meant to scare you. It is meant to help you keep risk outside the door: first decide what is worth protecting, then build simple habits you can actually sustain.',
    basicHeading: 'Basics: protect yourself first',
    advancedHeading: 'Advanced: high-risk scenarios and incident response',
    advancedNote:
        'The following section is for more extreme situations: systematic targeting, stalking, a real physical threat, or a suspicion that your device or accounts have already been compromised. Most members may never need it. Use it according to your own situation, only for legitimate self-defense, and never do anything illegal. If your physical safety is threatened, contact local law enforcement, legal aid, or a trusted professional organization first.',
    extendedHeading: 'Extended knowledge: math, anonymity networks, consensus, and high-threat environments',
    extendedNote:
        'The following pages are optional background reading. You do not need to learn the formulas, and none of it is required to use the checklists above. They explain why anonymity is not a switch but a set of assumptions. The math is here to make the ideas easier to picture, not to serve as an operating manual. The last few sections cover high-threat environments; they discuss principles, risks, and alternatives only, not executable procedures. Most readers will not need them. Skip anything that is not useful to you and come back later if you need it.',
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
                    kind: 'note',
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
                        'Security-question answers can be invented as long as you can remember them. Do not use your mother’s maiden name or birth city; those are easy to look up.',
                    ],
                },
                {
                    type: 'warn',
                    kind: 'warning',
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
                        'Strip EXIF before posting: use ExifTool or ImageOptim on desktop, and the “remove location” or “remove metadata” option in your phone’s gallery.',
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
                    kind: 'warning',
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
                    kind: 'note',
                    text: 'Security is not a one-time check that makes you safe forever. It is the ongoing work of lowering probability and limiting damage. Treat the official site as a relatively trustworthy tool that still deserves caution, not as a vault.',
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
                        'Cake Wallet: an open-source, non-custodial multi-currency wallet supporting Monero, Bitcoin, Ethereum, and more, with built-in swaps. It is convenient for swapping XMR into other currencies. Swaps are usually fulfilled by third-party liquidity providers, and some routes may require KYC; test with a small amount and confirm arrival before continuing.',
                        'Monero GUI: the official Monero wallet. It can run a local full node (monerod). A self-hosted node gives the best privacy and verification, but the blockchain is large, the first sync is slow, and it consumes disk and bandwidth, which can be a hassle for ordinary users. A remote node is easier, but the node operator can see your IP and query patterns.',
                        'Bitcoin Core: a Bitcoin full node gives the most reliable verification, but the chain and sync cost are even higher. You can pair it with Electrum Personal Server or Sparrow and similar tools to use your own node while balancing verification and privacy. Note: BTC is pseudonymous, not anonymous; address reuse and KYC transactions make it easy to link payments.',
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
                    kind: 'important',
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
                    text: 'If any of these appear, stop. Verify through the official entry point you already know, not the link the other person sent. Do not decide under pressure. Never give verification codes, passwords, or recovery codes to anyone. Do not install remote-control software. Do not transfer money.',
                },
                {
                    type: 'warn',
                    kind: 'tip',
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
                    text: 'Xiao Lu posted about his medication experience in the community. A few days later, someone named “A-Lan” messaged him: “What you wrote felt real. I have been through something similar. Can we talk?”',
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
                    text: 'Xiao Lu almost clicked. Then three things stopped him. First, official staff never send login links by DM. Second, the other person kept creating urgency: “do it now or it will be too late.” Third, A-Lan had been asking about his city one moment and asking for money the next; the timing was too neat. He did not click. He opened the official site himself, confirmed from the announcements that no “account-loss verification” existed, then screenshotted the conversation, reported it, and blocked the account. When A-Lan realized the scam had failed, he first got angry and accused Xiao Lu, then deleted the account.',
                },
                {
                    type: 'p',
                    text: 'The attack chain is typical: build rapport, test compliance with small requests, gradually extract linkable information, create an emergency, then finish with a phishing link or a transfer. Each step looks harmless; together they are dangerous.',
                },
                {
                    type: 'ul',
                    items: [
                        'Slow down. Any request that demands an immediate decision can wait.',
                        'Verify through another channel. Use the official site, official announcements, or an administrator you already know, not the link or contact details the other person gave you.',
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
                        'Stay consistent. Keep the profile in an encrypted note; do not be 20 today and 25 tomorrow. But do not invent more details than you need; the simpler it is, the less there is to trip over.',
                        'Keep it unverifiable. Give your region only as a broad area or country, your job only as “I work in design,” “I write code,” or “I’m a student,” and your schedule only as “recently.” Do not post photos that can be geolocated.',
                        'Compartmentalize. Separate account, separate email, separate browser profile. Do not sign in to the community identity on the device where your real accounts live. Do not reuse avatars or photos.',
                        'Avoid writing-style linkage. Do not paste the same self-introduction across platforms. Avoid distinctive catchphrases. Do not like, repost, or interact between your identities.',
                        'Avoid voice and video. Do not send voice messages, make video calls, or post selfies. If a photo is unavoidable, use one with no face, no background, and no EXIF, and check reflections and desk details.',
                        'In conversation, use questions, vagueness, and topic changes. You do not owe an answer to every question. “I would rather not talk about that” and “that is not important” are complete sentences.',
                        'Do not volunteer dramatic stories. The more ordinary and boring the persona, the safer it is. Do not impersonate a real person, an official, or a professional.',
                    ],
                },
                {
                    type: 'warn',
                    kind: 'important',
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
                    text: 'If a parent calls you while it is in your mouth: do not open your mouth to answer. Knock on the table, text “In the bathroom, one minute,” or take a sip of water and pretend to rinse. If you must answer, use the shortest possible phrase, such as “Coming” or “Brushing my teeth,” then close your mouth again. Do not try to hold a normal conversation. Better yet, plan ahead: take it while showering, brushing your teeth, changing clothes, taking out the trash, or organizing a locked room, and give yourself 10–15 minutes.',
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
                    text: 'A better default is a small lockbox in a fixed place you know: the top of a closet, deep under the bed, or another spot only you use. A lockbox is easier to remember than a rotating set of hiding places and less likely to be found by accident. Do not put medication in unlabeled bottles, food jars, or supplement bottles; in an emergency you may take the wrong thing. Keep the original packaging and prescription label inside the lockbox. If you must use a decoy container, write the drug name, dose, and date inside it.',
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
                    kind: 'caution',
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
                    text: 'One common harm-reduction approach is to replace “trans,” a label that is more likely to be targeted, with “style,” “sexual orientation,” or “still exploring.” For example:',
                },
                {
                    type: 'ul',
                    items: [
                        '“I’m a femboy. I just like wearing girls’ clothes; I think it’s cute. This is my first time trying it.”',
                        '“I’m pansexual. I’m attracted to people, not gender. The clothes are just my style.”',
                        '“I’m still figuring it out. I don’t want to lock myself into a label.”',
                        '“It’s just a personal interest. It doesn’t affect anyone else.”',
                        '“I’d rather not talk about this. Let’s change the subject.”',
                        'Trans boy: frame the change as “I’m a tomboy, kind of androgynous, going through a bit of a chuunibyou (edgy middle-school) phase. I think it looks cool.” Talk only about clothes and style; do not invent hormones, surgery, a club, or “an organization I joined.”',
                        'Trans girl: frame the change as “I’m into anime and cosplay, and I’ve been trying out feminine costumes.” Talk only about the hobby; do not post cosplay photos, sign up for in-person events, or invent a competition or club.',
                    ],
                },
                {
                    type: 'p',
                    text: 'Why this can be safer in some places: “wearing girls’ clothes” or “sexual orientation” may be treated as “personal style” or “a phase,” while “trans” can trigger a stronger reaction. But it is not a universal shield. Femboys and pansexual people are also targeted by homophobia and transphobia; if the other person has already decided you are trans, a different label may not help.',
                },
                {
                    type: 'p',
                    text: 'How to use it: keep it short, casual, and light on detail. Change the subject after one sentence. Do not invent a complicated backstory; every school, city, and timeline is another thing that can fall apart. Do not put down other trans people to protect yourself. “I’m not one of those” hurts others and leaves you more isolated.',
                },
                {
                    type: 'p',
                    text: 'Trans boys and trans girls can also borrow a more specific “school cover story”: a trans boy can frame the change as “a tomboy, androgynous, a bit chuunibyou lately”; a trans girl can frame it as “into anime and cosplay, trying out feminine costumes.” This does not mean trans boys should be tomboys or trans girls should like cosplay; it is simply a lower-cost shield in some schools, and it does not suit everyone.',
                },
                {
                    type: 'ul',
                    items: [
                        'Only explain why you dress this way or why you have changed lately, not your body, medical care, documents, name and pronouns, or dating. Do not invent hormones, surgery, a club, a competition, or “an organization I joined.”',
                        '“Late-stage chuunibyou” is a joke, not a diagnosis; it may make teachers think you have behavioral problems, and it may attract more staring. Do not overplay it. In some schools it is treated as “a mental problem,” bringing in the homeroom teacher, parents, or school counselor; if you are already being watched, do not use this one.',
                        'Cosplay photos, accounts, and in-person events leave linkable traces; do not post polished cosplay photo sets, attend large events, or borrow money for props just to maintain the persona. Some schools treat cosplay as “inappropriate dress” or “not taking school seriously” and may give demerits or notify your parents; check the school rules and the teacher’s attitude first.',
                        'These two scripts are only for casual questions from classmates; do not use a persona with teachers, parents, doctors, or police. Say “I don’t want to discuss it” or find a trusted adult.',
                        'Have an exit line ready: “I was just trying it for fun; I might change it up in a while.” That way you do not have to explain a change in style later.',
                    ],
                },
                {
                    type: 'p',
                    text: 'For trans girls: using the cosplay script is not an admission that there is something wrong with you, and it is not self-degradation; it simply moves the topic from “are you transgender” to “are you an anime fan.” Some schools really will treat it only as “inappropriate dress,” “a bad attitude,” or “not taking school seriously,” and may confiscate feminine clothing, but they will not infer from that phrase alone that you are taking medication. But “at worst, they’ll just confiscate it” is not a guarantee: if your body has changed visibly, someone reports you, or your parents already suspect, the school may still search your bag, phone, or medication, or require a medical exam.',
                },
                {
                    type: 'p',
                    text: 'For trans boys: the “chuunibyou tomboy” cover can sometimes buy ordinary contact with some boys’ circles, such as an arm around your shoulder, being called “bro,” or playing ball together. That can be a real buffer, but it is not proof of safety; if they only accept you because they think you are “one of the boys,” they may turn on you once they suspect. Do not go into high-risk situations (overnight stays, bathrooms, physical exams) just to maintain that position, and do not treat “being called bro” as an exam you must pass. If that kind of contact makes you uncomfortable, move away; you do not have to tolerate touch just to “act like a boy.”',
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
                    kind: 'caution',
                    text: 'Do not force yourself to accept the femboy label just because it seems safer, and do not pretend to be a specific real person. Even if you think “saying femboy will get me hit less,” being hit is still violence, not a cost you are required to pay. If the environment is dangerous, prioritize leaving and getting help. If the other person has already decided you are transgender, a different label may not help; in that case, prioritize leaving and finding someone you trust, and do not keep escalating the persona to prove it.',
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
                    text: 'If you are simply nervous or genuinely unwell: tell a teacher or the school nurse, “I feel a bit dizzy and need to sit down.” Sit down, sip water slowly, do not cycle or drive, and ask them to contact someone you trust. Telling the truth about a real symptom is more controllable than inventing a story that may get you sent to a hospital or have your parents called.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'High-risk behavior warning: do not use induced vomiting, emetics, throat stimulation, holding urine, dehydration, taking medication on your own, or faking a collapse to avoid a health check. Induced vomiting can cause aspiration, choking, esophageal tears, electrolyte imbalance, heart rhythm problems, and tooth erosion. Lying down to sleep right after vomiting is especially dangerous because you can choke on vomit during sleep. Do not use “I threw up, so I’m fine” as a safety test.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'If you have already vomited: rinse your mouth, stay upright or on your side, sip water, and tell a trusted adult. Seek urgent medical care for repeated vomiting, chest or abdominal pain, vomiting blood, dizziness that makes it hard to stand, or confusion. Do not sleep alone right away, and do not repeat it because it “worked” once.',
                },
                {
                    type: 'p',
                    text: 'A health check is not a choice between “comply with everything” and “avoid everything.” You can decline a particular item in that setting and ask to speak to the clinician privately, or ask for a trusted adult to be present. The real danger is using self-harm to get through one check. No exam result is worth aspiration, esophageal injury, or a heart rhythm problem.',
                },
                {
                    type: 'warn',
                    kind: 'important',
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
                    kind: 'caution',
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
                    text: 'If you know GitHub, you can think of the process as: the Issue is “I want to change,” the PR is the HRT or surgery application, review is the psychiatric assessment, and the commit is body reconstruction. Reality is messier than a repository: the reviewer may never click approve, and may label your PR needs-info for years. You can joke about the process, but do not delete your only safety test just to get the merge: do not hide suicidal thoughts, chest pain, or fainting, which are genuinely dangerous. A body is not a repository you can fix with a force push, and many changes cannot be rolled back.',
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
            id: 'body-safety',
            title: 'Physical safety: if you are being hit, leave first, do not try to reason',
            level: 'basic',
            blocks: [
                {
                    type: 'p',
                    text: 'If a family member, classmate, or partner is hitting you, the most important thing is not to win; it is to reduce injury and get out. Once someone has become violent, reasoning, begging, or making threats can all escalate it. “If you do this again I’ll call the police” is especially dangerous: calling the police is an action, not a line.',
                },
                {
                    type: 'ul',
                    items: [
                        'Find the exit first: where is the door, who is blocking it, can you go around? Do not turn your back to the door, and do not let yourself be cornered in a kitchen, on a balcony, or at the top of stairs.',
                        'Protect your head and neck: tuck your chin, cover the back of your head and ears; get low if you can to reduce the area of your head that can be hit.',
                        'Do not grab for a weapon, do not chase, and do not try to “beat them into submission.” Once you have distance, leave.',
                        'Run toward people, cameras, and adults: a shop, a guard post, a classroom, a police station. Do not run into dead ends, construction sites, or isolated stairwells.',
                        'If you cannot run: put a chair, bag, or blanket between you and keep shouting for help. If the other person stops, stay still, watch the exit, and move only when it is safe; do not suddenly get up and chase them.',
                        'Afterward: leave the scene first, find someone you trust, photograph or document injuries, and go to a hospital. If you may be hit again, do not go home alone.',
                    ],
                },
                {
                    type: 'p',
                    text: 'If being hit is not a one-off in your environment, fitness is part of safety. Sprints build explosive speed; easy running builds endurance. The goal is not to win a fight; it is to create distance and reach somewhere people can help you. If you actually have to run: sprint all-out for 20–40 meters first to open a gap, then settle into a sustainable run. Do not start at an easy jog, and do not run back to a home where you may be hit again.',
                },
                {
                    type: 'ul',
                    items: [
                        'Sprints: twice a week, 20–40 m × 4–6 reps, walk back to the start and recover fully between reps; do not do this every day.',
                        'Easy runs: 2–3 times a week, 20–30 minutes at a conversational pace; build gradually to 40 minutes.',
                        'Basic strength: squats, lunges, calf raises, plank; 2–3 sets each.',
                        'Warm up for 5–10 minutes first. If you have asthma, a heart condition, or a joint injury, ask a doctor first. Do not train on isolated or dangerous routes, and do not train to the point of collapse.',
                    ],
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Training is for getting away, not for fighting. Do not practice “one move that ends the fight,” and do not challenge the other person. You do not have to prove that you are not afraid.',
                },
                {
                    type: 'p',
                    text: 'If you are being hit because you came out, because of your identity, because of medication, or because you refused “correction”: this is not your fault, and it is not because you were “not careful enough.” Make a safety plan as soon as you can: ID documents, medication, money, a backup phone, phone numbers of trusted adults, and a temporary place to stay.',
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: 'Do not say “I’ll call the police” as a threat. If the other person is already angry, that sentence can get you hit harder immediately. If you are actually going to call, do it from a safe place, or ask someone else to call for you.',
                },
                {
                    type: 'p',
                    text: 'If you have already been injured and notice dizziness, vomiting, blurred vision, bleeding from the ears or nose, chest pain, difficulty breathing, confusion, or persistent abdominal pain, seek medical care immediately; do not sleep alone.',
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
                        'Assume compromise: do not change one password and call it done. Check four lines separately: accounts, devices, network, and money.',
                        'Preserve evidence first: when threatened, save screenshots, chat logs, email headers, and transfer records, back them up encrypted, and build a timeline if needed.',
                        'Get psychological support: after exposure or targeting, self-attack is the most common trap. Reach out to someone you trust early.',
                        'Prepare for emergencies: decide in advance how you would access documents, medication, and money so you can move quickly in a crisis.',
                    ],
                },
                {
                    type: 'warn',
                    kind: 'important',
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
                    kind: 'caution',
                    text: 'Do not use illegal means to “fight fire with fire” or forge an identity to strike back. That puts you at greater risk and makes it harder for people who genuinely need help to be believed.',
                },
            ],
        },
        {
            id: 'transmasc',
            title: 'Trans men: the half that gets overlooked',
            level: 'advanced',
            blocks: [
                {
                    type: 'p',
                    text: 'This guide was originally skewed toward trans women; trans men’s needs are not just “the reverse.” Trans men may be overlooked by the medical system, treated as “not trans enough,” or misdiagnosed, and may face completely different issues around binding, testosterone, gynecological care, and pregnancy risk.',
                },
                {
                    type: 'ul',
                    items: [
                        'Binding: use a properly fitted binder, not ACE bandages or tape. Start by wearing it for 2–4 hours the first time, and do not exceed 8–12 hours a day. Do not wear it while sleeping, exercising, or swimming. Stop immediately for chest pain, difficulty breathing, rib pain, or broken skin. A physical exam or chest X-ray may require you to take it off; ask ahead.',
                        'Packing and STP: hygiene first, so clean regularly and do not share. You do not have to pack if it is inconvenient or uncomfortable; passing is not required.',
                        'Testosterone: only through regular medical care. Voice, body hair, muscle, periods, clitoris, lipids, and hematocrit all change; you need regular monitoring. Do not increase the dose yourself or use medication from an unknown source.',
                        'Fertility and pregnancy: testosterone is not birth control; trans men can still get pregnant. If you need contraception, fertility preservation, or gynecological care, tell the doctor directly about your needs and your body.',
                        'Gynecological care: Pap/HPV tests, STI testing, and breast and pelvic exams can all be arranged with a trans-friendly doctor. You can explain your name and the terms you use for your body in advance; if you are nervous, bring someone with you.',
                        'Menstrual suppression: talk to a doctor; do not use hormones from unknown sources, herbal remedies, or extreme dieting.',
                        'Voice, hair, and facial hair: voice training, haircuts, and minoxidil each have their own risks; minoxidil is toxic to cats, so check before using it; do not use unproven remedies.',
                        'Bathrooms and routes: check local laws and your surroundings; choose safer routes and go with someone when possible; if you are stopped, leave rather than confront anyone.',
                    ],
                },
                {
                    type: 'p',
                    text: 'Trans men are often “invisible”: people may not read you as a trans man, or may think you are “just a tomboy.” That can be cover, and it can also be isolating. At school, you can use “tomboy, androgynous style” as a shield when people ask; it explains clothing, not your body or medical care. See “When classmates ask” for specific scripts. Find community, find older trans men, and find trans-friendly doctors; do not keep every question bottled up alone.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Do not do dangerous things to “pass better”: over-binding, sharing needles, black-market testosterone, extreme dieting or exercise, or taping your chest. These can cause permanent harm.',
                },
                {
                    type: 'p',
                    text: 'If you are both a trans man and a minor: medical consent, parental support, school records, and legal documents can be more complicated. Find local organizations, a lawyer, or a social worker; do not forge documents.',
                },
                {
                    type: 'p',
                    text: 'This section is not medical advice; hormones, surgery, and tests are governed by your doctor and local guidelines.',
                },
            ],
        },
        {
            id: 'extended-math',
            title: 'A math crib sheet: entropy, variance, correlation, and mutual information',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'This section answers only “what is this quantity asking?” You do not need to derive anything. If a formula looks unfriendly, read the first sentence of each paragraph and move on. These ideas are mainly useful for describing uncertainty, similarity, and the strength of an association.',
                },
                {
                    type: 'p',
                    text: 'Shannon entropy measures how uncertain a random variable is. A fair coin has one bit of entropy; a variable that is always the same value has zero. The higher the entropy, the harder the value is to guess.',
                },
                {
                    type: 'math',
                    text: 'H(X) = -\\sum_{x} p(x)\\log_2 p(x)',
                    caption: 'Shannon entropy: more spread-out probabilities mean more uncertainty.',
                },
                {
                    type: 'p',
                    text: 'Anonymity sets can also be described with entropy. If an attacker thinks N candidates are equally likely, the anonymity-set entropy is log2 N; every time the candidate set halves, one bit is lost.',
                },
                {
                    type: 'math',
                    text: 'H_{\\text{anon}} = \\log_2 N',
                    caption: 'Uniform anonymity set: more candidates, more entropy.',
                },
                {
                    type: 'p',
                    text: 'Mutual information measures how much knowing Y reduces uncertainty about X. It is zero when X and Y are independent, and equals the entropy of X when Y determines X completely. It is a statistical dependence, not proof of causation.',
                },
                {
                    type: 'math',
                    text: 'I(X;Y) = \\sum_{x,y} p(x,y)\\log_2\\frac{p(x,y)}{p(x)p(y)}',
                    caption: 'Mutual information: how much information two variables share.',
                },
                {
                    type: 'p',
                    text: 'Variance measures how spread out values are around their mean. Covariance measures whether two variables tend to move together. The Pearson correlation coefficient is covariance normalized to the range -1 to 1.',
                },
                {
                    type: 'math',
                    text: '\\operatorname{Var}(X)=\\mathbb{E}[(X-\\mu)^2],\\qquad \\rho_{X,Y}=\\frac{\\operatorname{Cov}(X,Y)}{\\sigma_X\\sigma_Y}',
                    caption: 'Variance, covariance, and the Pearson correlation coefficient.',
                },
                {
                    type: 'p',
                    text: 'Pearson only captures linear relationships. Two variables can be strongly related in a non-linear way and still have r near zero. Correlation is not causation either. In traffic analysis, an attacker often compares timing, packet sizes, and direction to pair an entry stream with an exit stream; that is a practical application of similarity and correlation.',
                },
                {
                    type: 'warn',
                    kind: 'note',
                    text: 'Formulas are not magic. Sampling bias, the time window, preprocessing, and side information can all change the conclusion. When you see “statistically significant,” ask where the sample came from, what assumptions were made, and whether another explanation fits.',
                },
            ],
        },
        {
            id: 'extended-rsa',
            title: 'RSA: integer factorization and Euler’s totient',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'RSA rests on an asymmetry: multiplying two large primes is easy, but factoring the product back into those primes is hard. The public key contains the modulus n; the private key depends on knowing the factors of n.',
                },
                {
                    type: 'math',
                    text: 'n=pq,\\qquad \\varphi(n)=(p-1)(q-1)',
                    caption: 'RSA modulus and Euler’s totient; p and q are large primes.',
                },
                {
                    type: 'p',
                    text: 'Euler’s totient φ(n) counts the integers from 1 to n that are coprime to n. RSA chooses a public exponent e and computes a private exponent d that is its inverse modulo φ(n).',
                },
                {
                    type: 'math',
                    text: 'e d \\equiv 1 \\pmod{\\varphi(n)}',
                    caption: 'The relationship between the public and private exponents.',
                },
                {
                    type: 'p',
                    text: 'Encryption and decryption are modular exponentiations. The formulas look simple; the hard part is that without p and q, you cannot efficiently compute d from n.',
                },
                {
                    type: 'math',
                    text: 'c \\equiv m^e \\pmod n,\\qquad m \\equiv c^d \\pmod n',
                    caption: 'Textbook RSA encryption and decryption; real systems must add padding.',
                },
                {
                    type: 'p',
                    text: 'Euler’s theorem is one reason the arithmetic works: when a and n are coprime, a raised to φ(n) is congruent to 1 modulo n.',
                },
                {
                    type: 'math',
                    text: 'a^{\\varphi(n)} \\equiv 1 \\pmod n \\quad (\\gcd(a,n)=1)',
                    caption: 'Euler’s theorem.',
                },
                {
                    type: 'p',
                    text: 'The best general-purpose classical factoring algorithms, such as the number field sieve, are sub-exponential rather than polynomial. RSA with 2048 or 3072 bits is still considered classically secure, but that is not the same as “safe forever”: short keys, implementation bugs, and poor randomness can turn a hard mathematical problem into an engineering failure.',
                },
                {
                    type: 'p',
                    text: 'Shor’s algorithm can factor large integers and compute discrete logarithms in polynomial time on a sufficiently large fault-tolerant quantum computer. It threatens not only RSA but also Diffie-Hellman, ECDH, ECDSA, EdDSA, and related schemes.',
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: 'Do not implement RSA yourself, and do not encrypt messages with textbook RSA. Without padding such as OAEP, RSA is deterministic and malleable; signatures also need a proper scheme such as PSS. Use audited libraries and protocols instead of inventing your own padding.',
                },
            ],
        },
        {
            id: 'extended-ecc',
            title: 'ECC and Shor: why elliptic curves also fear quantum computers',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'Elliptic-curve cryptography (ECC) is not “RSA with more steps.” It uses a different hard problem: in the group of points on an elliptic curve over a finite field, given P and Q=kP, finding the scalar k is hard. This is the elliptic-curve discrete logarithm problem (ECDLP).',
                },
                {
                    type: 'math',
                    text: 'y^2 \\equiv x^3 + ax + b \\pmod p',
                    caption: 'An elliptic curve over a finite field (with a non-singularity condition).',
                },
                {
                    type: 'math',
                    text: 'Q = kP',
                    caption: 'Scalar multiplication; recovering k from P and Q is ECDLP.',
                },
                {
                    type: 'p',
                    text: 'Because the difficulty is more concentrated, ECC reaches classical security comparable to RSA with much shorter keys. That is why it is everywhere: phones, TLS, Signal, and blockchain wallets. But Shor’s algorithm also solves discrete logarithms; elliptic curves are not automatically post-quantum.',
                },
                {
                    type: 'p',
                    text: 'At the heart of Shor is period finding. To factor N, choose an a coprime to N and look at the period r of powers of a modulo N:',
                },
                {
                    type: 'math',
                    text: 'f(x)=a^x \\bmod N,\\qquad f(x+r)=f(x)',
                    caption: 'Shor turns factoring into a period-finding problem.',
                },
                {
                    type: 'p',
                    text: 'The quantum Fourier transform can find r efficiently. Once r is known, a greatest-common-divisor calculation may recover factors of N.',
                },
                {
                    type: 'math',
                    text: '\\gcd(a^{r/2}\\pm 1, N)',
                    caption: 'Classical post-processing after the period is known (it may need retries).',
                },
                {
                    type: 'p',
                    text: 'Grover’s algorithm is often mentioned alongside Shor, but it gives only a square-root speedup for unstructured search. It mainly affects the safety margin of symmetric keys and hashes; it does not break RSA or ECC outright the way Shor does.',
                },
                {
                    type: 'p',
                    text: 'Post-quantum migration is not a plugin. Current directions include standards such as ML-KEM (Kyber), ML-DSA (Dilithium), and SLH-DSA (SPHINCS+), plus hybrid schemes that combine classical and post-quantum algorithms. Migration touches protocols, certificates, libraries, and hardware, so it takes years.',
                },
                {
                    type: 'warn',
                    kind: 'note',
                    text: '“Quantum-resistant” is a migration process, not a label you can trust because a coin or an app uses it. When a project claims it, ask which layer was replaced, which key and signature schemes are used, and whether there has been an independent audit.',
                },
            ],
        },
        {
            id: 'extended-tor',
            title: 'Tor: entry, exit, and bridge rotation',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'Tor places traffic into a circuit made of an entry guard, a middle relay, and an exit. Each relay knows only its adjacent hop; in the normal case, no single relay knows both who you are and where you are going.',
                },
                {
                    type: 'p',
                    text: 'Anonymity is not absolute. If the same adversary controls or observes both your entry and your exit, and can correlate timing, packet sizes, and direction, it may be able to match the two ends of the circuit. This is an end-to-end correlation attack. Controlling both ends does not guarantee success every time, but it raises the risk substantially.',
                },
                {
                    type: 'p',
                    text: 'Keeping a long-term entry guard reduces the chance of repeatedly choosing a malicious guard, but long observation of the same guard also gives an adversary more samples. Bridges are mainly for circumvention; using the same bridge for a long time can make it easier to enumerate, block, or correlate. Rotating bridges and using pluggable transports can reduce that risk, but do not rotate so often that you undermine the guard security model.',
                },
                {
                    type: 'p',
                    text: 'Tor hides your network origin, not your browser fingerprint. Logging into the same account, using the same language, time zone, fonts, downloading and opening files, or pasting a distinctive block of text can all link two visits.',
                },
                {
                    type: 'p',
                    text: 'An exit relay can see unencrypted HTTP, DNS, and some plaintext protocols. HTTPS protects content, but domain names, timing, and traffic size can still leak. If you need stronger protection, use an end-to-end encrypted application protocol rather than relying on Tor alone.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Tor is a privacy tool, not a crime tool. It protects journalists, survivors, minorities, and ordinary people going about their lives. If you use it for fraud, harassment, or evading lawful oversight, the consequences are yours.',
                },
            ],
        },
        {
            id: 'extended-i2p',
            title: 'I2P and Sybil attacks',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'I2P uses garlic routing: a message can contain multiple encrypted “cloves” and travel through unidirectional tunnels. By default it does not provide an exit to the ordinary internet; it is aimed more at internal services (eepsites) and peer-to-peer applications.',
                },
                {
                    type: 'p',
                    text: 'A Sybil attack is when an adversary creates many fake identities or nodes to increase the chance of being selected. The more nodes the adversary controls, or the more predictable the selection algorithm, the easier it is to appear repeatedly in a tunnel or at key positions in a distributed hash table, enabling correlation, blocking, or eclipse attacks.',
                },
                {
                    type: 'math',
                    text: 'P_{\\text{all-adversary}} \\approx f^L',
                    caption:
                        'Simplified model: adversary controls fraction f of nodes and a tunnel has length L; real selection is more complex, but diversity still matters.',
                },
                {
                    type: 'p',
                    text: 'Defenses include proof of work, staking, reputation, node diversity, floodfill restrictions, longer tunnels, and better peer selection. None eliminates Sybil attacks completely; they only raise the cost and reduce centralization.',
                },
                {
                    type: 'p',
                    text: 'I2P is not an “upgraded Tor.” Their goals differ: Tor is closer to a general-purpose exit proxy, while I2P is more of an internal darknet. Which one to use depends on what you need to reach, your threat model, and whether you can accept a smaller ecosystem.',
                },
                {
                    type: 'warn',
                    kind: 'note',
                    text: '“More nodes” does not automatically mean “safer.” An adversary can rent cloud hosts, register in bulk, and lurk for a long time. Whether a network resists Sybil attacks depends on identity cost, selection algorithms, and decentralization, not just the node count.',
                },
            ],
        },
        {
            id: 'extended-dcnet',
            title: 'DC-Net, blocking attacks, and Freenet',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'DC-Net (Dining Cryptographers) aims for information-theoretic anonymity: even an adversary with unlimited computing power cannot tell who sent a message, provided the protocol assumptions hold. Participants share pairwise keys and broadcast masked values; when all values are XORed, everyone else’s masks cancel and only the sender’s message remains.',
                },
                {
                    type: 'math',
                    text: 'M_i = m_i \\oplus \\bigoplus_{j\\ne i} k_{ij}',
                    caption: 'Each participant broadcasts their message XORed with all shared keys.',
                },
                {
                    type: 'math',
                    text: '\\bigoplus_i M_i = \\bigoplus_i m_i',
                    caption:
                        'XORing every broadcast cancels the pairwise keys; if only one person sends, only that message remains.',
                },
                {
                    type: 'p',
                    text: '“Information-theoretic security” does not mean “secure in deployment.” It depends on secure pairwise channels, honest participants, reliable broadcast, and no collusion. Those assumptions are easy to break in the real world.',
                },
                {
                    type: 'p',
                    text: 'The blocking attack is DC-Net’s classic weakness: a malicious participant refuses to send, sends malformed data, or repeatedly interrupts, preventing the protocol from completing. At best this is a denial of service; at worst, repeated retries and timing differences shrink the anonymity set. Blame protocols, anonymous detection, timeouts, and redundancy can help, but they add complexity and cost.',
                },
                {
                    type: 'p',
                    text: 'Freenet has two connection modes. OpenNet lets nodes connect to strangers: it is easy to join and the network is larger, but it is more exposed to Sybil attacks, traffic analysis, and malicious content. DarkNet connects only to people you trust: it is more resistant to outsiders, but smaller and vulnerable to infiltration, social engineering, and gradual deanonymization through the trust graph.',
                },
                {
                    type: 'p',
                    text: 'Under modern threat models, OpenNet is not suitable for strong anonymity. DarkNet is not “absolutely safe” either: long-term traffic correlation, content fingerprints, malicious files, seized nodes, chat logs, and human error can all turn “anonymous” back into “linked.”',
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: 'DC-Net’s information-theoretic guarantee is a statement about the protocol, not an endorsement of a particular client or plugin. A bug in the implementation, identity authentication, broadcast layer, or metadata can defeat the paper security.',
                },
            ],
        },
        {
            id: 'extended-monero',
            title: 'Monero multisig and anonymity',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'Monero puts privacy into the protocol by default: ring signatures hide who spent, stealth addresses hide who received, and RingCT hides how much was spent. That is closer to default privacy than bolting a mixer onto a transparent ledger.',
                },
                {
                    type: 'p',
                    text: 'A ring signature lets a verifier know that one key out of a set signed, without learning which one. A larger ring means a larger candidate set, but quality matters more than size: if the decoys are easy to identify, the effective anonymity set shrinks.',
                },
                {
                    type: 'math',
                    text: '\\operatorname{Verify}(\\sigma,\\{P_1,\\ldots,P_n\\})=1',
                    caption:
                        'Ring signature: verification only shows that one of the n public keys signed, not which one.',
                },
                {
                    type: 'p',
                    text: 'To prevent the same output from being spent twice, Monero uses a key image. It is derived from the private key and a hash of the corresponding public key. Verifiers can check whether it has already appeared, but cannot recover the private key from it.',
                },
                {
                    type: 'math',
                    text: 'I = k\\,\\mathcal{H}_p(P)',
                    caption:
                        'Simplified key image; the real construction also includes domain separation and other details.',
                },
                {
                    type: 'p',
                    text: 'Multisig solves a different problem: M-of-N keys jointly control funds, and at least M signatures are required to spend. It is useful for shared custody, escrow, organizational treasuries, and reducing single-key theft risk. Multisig does not make a transaction more anonymous by itself; it changes key management, not ledger visibility.',
                },
                {
                    type: 'p',
                    text: 'Monero uses proof of work (RandomX) for consensus. Bitcoin also uses proof of work, but Bitcoin’s ledger is transparent and its addresses are pseudonymous rather than anonymous. Treating a “privacy coin” as a legal shield is dangerous: exchanges may refuse deposits or freeze assets, and chain analysis combined with KYC, IP, and timing data can still locate you.',
                },
                {
                    type: 'p',
                    text: 'Multisig risks include lost keys, collusion among holders, implementation bugs, metadata during coordination, and complicated recovery. Test with a small amount first; confirm that addresses, signing, and backups all recover before trusting it with serious money.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: '“Private by default” does not mean “untraceable.” On-chain privacy covers only the on-chain part. Exchange KYC, network metadata, wallet backups, chat logs, and human error are often easier ways to identify a person than breaking the cryptography.',
                },
            ],
        },
        {
            id: 'extended-consensus',
            title: 'PoW, PoS, PoA, and why Bitcoin can be traced',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'A consensus mechanism decides who may write the next block. It does not decide whether transactions are private. Confusing PoW, PoS, or PoA with a privacy feature is one of the most common category errors in crypto.',
                },
                {
                    type: 'p',
                    text: 'Proof of work (PoW) uses computing power and energy to compete for the right to produce blocks; an attacker needs a large share of hash power to reorganize the chain. Proof of stake (PoS) uses staked economic value to select proposers and attesters, with slashing for misbehavior. Proof of authority (PoA) uses authorized validators, which suits consortium chains or testnets but has a more centralized trust model.',
                },
                {
                    type: 'math',
                    text: '\\mathbb{E}[T_{\\text{PoW}}]=\\frac{D}{h},\\qquad P_i^{\\text{PoS}}=\\frac{s_i}{\\sum_j s_j}',
                    caption:
                        'Simplified intuition: PoW block time depends on difficulty and hash rate; in PoS the chance of being selected depends on the stake share.',
                },
                {
                    type: 'p',
                    text: 'Many privacy coins do use PoW: some wanted to avoid pre-mines and ICO centralization, some wanted ASIC resistance (for example, Monero’s RandomX), and some simply inherited the choice. But it is false that “most PoW coins are privacy coins”; the vast majority of PoW projects are not privacy coins. The correlation is not causation.',
                },
                {
                    type: 'p',
                    text: 'Bitcoin is pseudonymous, not anonymous. Its UTXO ledger is public, permanent, and traceable. Chain analysis commonly uses common-input ownership (addresses spent together may belong to one wallet), change addresses, timing, amount patterns, address reuse, exchange KYC, IP and node observation, and off-chain chat logs. If a couple of those line up, a pseudonym can become a person.',
                },
                {
                    type: 'p',
                    text: 'People sometimes ask: since Ethereum is PoS, can’t its addresses avoid being frozen? More precisely: the Ethereum protocol has no bank-style “freeze this address” button, but freezing and censorship can happen at many layers. Validators and relays can refuse to include a transaction; staked funds can be slashed; stablecoin contracts such as USDC and USDT can freeze balances at the issuer’s direction; exchanges can freeze deposits and withdrawals; bridges can pause; RPC providers and frontends can block access. PoS is not anti-freeze magic.',
                },
                {
                    type: 'p',
                    text: 'PoS finality makes reorgs expensive, but that only means chain-level reversal is hard; it does not mean every address can transact unconditionally. Censorship resistance is a combined property of the protocol, the economy, and the social layer, not a single feature of a consensus algorithm.',
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: 'When you build a threat model, do not treat “consensus mechanism” as a synonym for “privacy” or “censorship resistance.” You also need to consider chain analysis, exchange compliance, stablecoin issuers, RPC providers, wallet frontends, the network layer, and your own operational habits.',
                },
            ],
        },
        {
            id: 'extended-high-threat',
            title: 'High-threat environments: read this first',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'This group is not “a more advanced security guide”; it is “the high-cost exception.” If you are just browsing, going to school, and taking your medication, the basic sections above are enough. Using everything here usually adds failure points, makes you more conspicuous, and can even cut you off from outside help.',
                },
                {
                    type: 'p',
                    text: 'Who it is for: people who are already being stalked or threatened, whose devices may be controlled, who must pass information inside an unsafe relationship, or who face forced medical treatment or forced “correction.” Who it is not for: someone who is only worried about a parent seeing a chat log, or who just wants to be “a bit safer.”',
                },
                {
                    type: 'p',
                    text: 'The common costs of high-threat measures: losing connectivity or going silent, maintenance burden, unusual behavior, heavier consequences if discovered, and no recourse if something goes wrong.',
                },
                {
                    type: 'p',
                    text: 'One principle: reduce the consequences first, then reduce the probability. You cannot drive the probability of discovery to zero; what you can do is make sure that if you are discovered, you have somewhere to go, someone to help, evidence, and medication.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'If your physical safety is threatened, prioritize contacting a trusted adult, local police or emergency services, legal aid, or a trans support organization. High-threat techniques are not a substitute for outside help.',
                },
                {
                    type: 'p',
                    text: 'Each section below discusses principles, risks, and alternatives only; it does not give step-by-step covert procedures. The reason is not “morality.” A public document will be read by scammers, abusers, and law enforcement as well as by you, and these procedures often fail in real life.',
                },
                {
                    type: 'p',
                    text: 'This group draws on public interview and de-escalation research: Dianiska, Quas, and Lyon (2024), in a systematic review of adolescent interviews, found that establishing rapport first, using open questions, and avoiding threats improves the completeness and accuracy of disclosure; Price and Baker’s (2012) review of de-escalation emphasizes reducing stimulation, offering choices, and maintaining a safe distance; Fenaughty et al. (2023) found that attempts to change sexual orientation or gender identity are associated with worse mental health; Bersani et al. (2020) discussed the ethical difficulties of ECT informed consent in delusional or coercive contexts. These studies are not operating manuals; they tell you which practices have evidence and which are just tough talk.',
                },
            ],
        },
        {
            id: 'extended-high-threat-device',
            title: 'Devices and location: “off” is not “offline”',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'Start with the principle: whether a phone can be located depends on whether it is still on a network, whether there are nearby devices that can report for it, and who controls the account. Powering it off only shuts down the main processor and most radios; some low-power finding features may still work.',
                },
                {
                    type: 'p',
                    text: 'On iPhone 11 and later, with iOS 15 and later, if “Find My network” is enabled, the phone may still be found through nearby Apple devices after it is powered off, usually for a limited time (about 24 hours). System versions, regions, and settings change the behavior; do not assume “powered off = safe.”',
                },
                {
                    type: 'p',
                    text: 'A Faraday bag works by shielding radio signals with metal. It is useful, but the cost is that you also cannot receive messages or calls, or call for help; frequent use creates an observable behavior pattern. It is not an everyday item; it is a tool for specific situations where you need to go offline.',
                },
                {
                    type: 'p',
                    text: 'System tiers: the baseline is system updates, a strong lock-screen password, full-disk encryption, and turning off unnecessary location, advertising and cloud sync. The next tier is GrapheneOS (requires a compatible Pixel) or Tails. The high tier is Qubes, Whonix or OpenBSD with full-disk encryption. Each tier adds maintenance cost; a Qubes setup you cannot maintain is more dangerous than the default system.',
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: 'Do not treat “I flashed a privacy OS” as proof of safety. Your phone number, accounts, payments, school or workplace, family, cameras, cell towers, and real-world movements can still connect you.',
                },
                {
                    type: 'p',
                    text: 'If you suspect you are being tracked: do not only check your phone; check your bag, car, gifts, chargers, keychains, and smoke detectors; change your routes and timing; tell someone you trust; and contact a professional organization if needed. Do not confront the person alone.',
                },
                {
                    type: 'p',
                    text: 'A low-cost alternative: separate sensitive matters from your everyday phone. Use another device, account and network for sensitive matters; keep the daily phone normal so it does not look like it “suddenly disappeared.”',
                },
                {
                    type: 'warn',
                    kind: 'note',
                    text: 'Do not frighten yourself with the idea of “location tracking after power-off,” and do not treat it as a universal explanation. Devices, systems, and account settings vary widely; check your own settings first, then build your threat model.',
                },
            ],
        },
        {
            id: 'extended-high-threat-money',
            title: 'Wallets and backups: the seed is the root key',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'How a hardware wallet works: the private key or seed is stored offline, and signing happens inside the device. It protects against malware on your computer stealing the private key directly, but not against “you photograph the seed and store it on your phone,” “you keep the device and seed in the same box,” or “you are coerced.”',
                },
                {
                    type: 'p',
                    text: 'The seed is the root key: whoever has it can restore the wallet and move the assets. Monero’s ledger privacy protects “outsiders cannot see the transaction,” not “someone who has the seed.”',
                },
                {
                    type: 'p',
                    text: 'Backup principles: keep the seed and the device separate; keep at least two copies in different locations; add a passphrase layer; use multisig or Shamir splitting for large amounts; test recovery regularly.',
                },
                {
                    type: 'p',
                    text: 'Media: metal plates survive fire and water but are more conspicuous and harder to hide; paper is easier to hide but vulnerable to fire, water, and insects. Do not write the seed anywhere it will be photographed, scanned, or cloud-synced; do not use “hidden in a pile of USB drives” as your only plan, because if the device is taken, the seed may disappear with it.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Do not swallow paper or metal plates. You cannot guarantee they will not obstruct or cut your esophagus; being seen doing it looks like destroying evidence; and your backup is gone. In an extreme situation, what you need is “separate storage + a trusted person holding a copy,” not putting things inside your body.',
                },
                {
                    type: 'p',
                    text: 'If your assets may be controlled by family or a partner: test with a small amount first; do not keep all your money in one wallet; keep transaction records; learn the local law; and consult a lawyer if needed. Do not use cryptocurrency to evade court, child-support, or debt obligations.',
                },
                {
                    type: 'p',
                    text: 'For more technical details, see “Monero multisig and anonymity”; this section covers backup and physical safety only.',
                },
            ],
        },
        {
            id: 'extended-high-threat-comms',
            title: 'Communication under surveillance: digital first, physical second',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'If your phone or room may be searched, or you are not allowed to go out, the first principle is not “hide deeper” but “reduce what needs hiding.” If you can say it in person, do not leave text; if a normal excuse explains it, do not invent a complicated story.',
                },
                {
                    type: 'p',
                    text: 'Digital first: use trusted adults, school or library devices, end-to-end encrypted tools such as Signal or SimpleX, separate accounts and devices, lock screens, disabled notification previews, and regular history clearing. Do not connect two identities with the same phone number, email or avatar.',
                },
                {
                    type: 'p',
                    text: 'If you must use a family computer or phone: a private browsing window is not security; check for monitoring or parental-control software; do not log into sensitive accounts; log out when done; do not leave autofill or download history.',
                },
                {
                    type: 'p',
                    text: 'Trusted intermediary: find an adult, friend, teacher, or social worker your family would not suspect, and ask them to pass messages for you; agree on an ordinary code word; do not ask them to take on risks beyond their capacity.',
                },
                {
                    type: 'p',
                    text: 'How a dead drop works: it splits an “exchange” into placement, marking, and retrieval, so the two parties are not present at the same time. It solves “we cannot meet at the same time”; it does not solve fake goods, interception, controlled delivery, coercion, after-sales support, or evidence. If any link is seen, the whole chain is exposed.',
                },
                {
                    type: 'p',
                    text: 'Why this section does not describe choosing a site, marking, placement or retrieval: a public document will be read by scammers, abusers, law enforcement, and malicious readers; one example becomes a template; in reality, weather, animals, passersby, cameras, fixed routes, fingerprints, DNA, and the physical risk of retrieving in an isolated place can turn a “clever trick” into evidence.',
                },
                {
                    type: 'p',
                    text: 'If you need a physical transfer: prefer a trusted intermediary, a public handover at school or work, or mail and courier (mind the address and recipient), or split the information into small, inconspicuous pieces. Do not retrieve near your home or school; do not use a fixed time; do not go to an isolated place alone; do not leave complete readable information.',
                },
                {
                    type: 'p',
                    text: 'How to ask for information without putting the other person on the defensive: use open questions (“What happens next?” “Who ordered this test?”), establish rapport first, then ask specifics; do not start with interrogation or threats; repeat the other person’s words to confirm you heard correctly; if they refuse, try another time or another person rather than pushing. Adolescent interview research supports “rapport first, open questions, avoid threats” for more complete disclosure (Dianiska et al., 2024; Nahouli et al., 2021).',
                },
                {
                    type: 'ul',
                    items: [
                        'Ask about process, not motive: “Who arranged this test?” “Who will see the results?” “If I don’t do it, what happens next?” Process questions are easier to answer than “Are you suspicious of me?”',
                        'Ask one question at a time; if the other person becomes defensive, change the subject and come back later; repeated questioning makes people want to end the conversation.',
                        'Confirm with their words: “So you mean if I don’t sign, the school will contact my parents?” Let them spell out the consequences themselves.',
                        'When they say “everyone does this” or “your parents already know,” ask for specifics: “Who said that? When? Can I see the original?”',
                        'Do not expose contradictions on the spot; write them down and check with a trusted adult later. Winning one sentence in the moment can cost you your safety.',
                    ],
                },
                {
                    type: 'p',
                    text: 'How not to be pumped for information: answer only what is necessary; if you are unsure, say “I don’t know” or “I need to ask”; do not make things up to appear cooperative; when someone pressures you with “everyone does this” or “your parents already know,” ask for specifics; do not make decisions while emotionally activated.',
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: 'Do not say “I’ll call the police” as a threat, and do not intimidate the other person with “I have evidence” or “I know people.” Tough talk may work in a safe situation; in a violent one it usually escalates. Calling the police is an action, not a line.',
                },
            ],
        },
        {
            id: 'extended-high-threat-medical',
            title: 'Forced blood tests and coerced medical care: first find out what is being tested',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'A blood test measures markers in your blood; it is not a lie detector for “did you take medication recently.” Sex hormones, liver and kidney function, prolactin, and a complete blood count each indicate different things; a single abnormal result can also be caused by dehydration, sleep, other medications, or illness. Do not tell yourself “one vomit and it’s fine.”',
                },
                {
                    type: 'p',
                    text: 'School health checks (including the gaokao physical) vary by place. Common items are height and weight, blood pressure, vision, heart and lung auscultation, spine and limbs, and chest X-ray; some places add liver function or a complete blood count. Sex hormones are not routine. “They drew blood” does not mean “they tested hormones.”',
                },
                {
                    type: 'p',
                    text: 'If a hormone test really is being done: first ask what will be tested, why, who will see the results, whether the results can be released only to a guardian or doctor, whether you can request privacy protection, and whether it can be postponed or moved to another hospital. You can ask the doctor to explain, and you can ask for a second opinion.',
                },
                {
                    type: 'p',
                    text: 'If you decide to delay: the least-bad non-violent approach is to leave the exam area normally and use “I need the bathroom” or “I feel unwell” to buy time, set a time limit, do not lock yourself in, do not turn off your phone and disappear, and do not hide until the place is empty. When found, do not confront anyone; use a fixed script: “I’m scared,” “I feel unwell,” “I want to do it another day,” or “I want to contact someone I trust first.” It only delays once; the next time will still come, and surveillance may escalate.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Do not induce vomiting. Vomiting cannot remove hormones that have already been absorbed; it does not work for injections or gel; vomiting and dehydration can cause abnormal liver enzymes, creatinine, and electrolyte levels and lead to more tests; risks include aspiration, esophageal tears, low potassium, and arrhythmia. Do not stop or change your dose on your own just to “look normal.”',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Do not use binding as cover. A physical exam may require you to take it off; prolonged binding can affect breathing, ribs, and skin; ACE bandages and tape are more dangerous. If you need to bind, use a properly fitted binder, limit the time, and stop immediately for pain or difficulty breathing.',
                },
                {
                    type: 'p',
                    text: 'If the results are already out or your parents know: first confirm who knows and how much they know; do not grab or alter the report; find a doctor, social worker or trusted adult to explain it with you; prepare a short script; if there is a risk of family violence, make a safety plan first and do not go home alone.',
                },
                {
                    type: 'p',
                    text: 'Forced “conversion” or “internet addiction correction”: these are not legitimate medical care. Red flags are confiscating phones and ID, restricting contact, physical punishment, denying visitors, demanding “admit your mistake,” and refusing to give a diagnosis or treatment plan. If you encounter these, protect your physical safety first and do not fight back head-on; preserve evidence; tell someone you trust your location and check-in time; if the door is open and someone outside can meet you, then consider leaving; do not run away on foot alone, and do not cut off contact with trusted adults.',
                },
                {
                    type: 'p',
                    text: 'MECT (modified electroconvulsive therapy) is a medical procedure performed under anesthesia for certain severe mental illnesses; it is not a “treatment for being transgender.” What you actually need to ask is: what is the basis for the diagnosis, was a differential diagnosis done, what is the indication, what are the alternatives, who signed the informed consent, and what are the side effects, including memory effects. If you are being forced, keep the medical record and informed consent form and seek a second opinion, legal aid or the health authority.',
                },
                {
                    type: 'p',
                    text: 'Interviewing a psychiatrist (not “testing” them): ask directly, “How many trans clients have you worked with? Do you use WPATH/ICD-11? How do you distinguish gender dysphoria from psychosis? If I disagree with the diagnosis, how do you handle it? Do you treat being transgender itself as delusional?” Red flags: treating being transgender as an illness, refusing to explain the diagnosis, threatening ECT if you do not comply, demanding that you “prove you are really trans,” and not letting you speak alone.',
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: 'If you are at risk of suicide or self-harm, address that first; do not hide it just to “keep your record clean.” The fear of coercive treatment is real, but hiding severe symptoms can put you in more danger.',
                },
            ],
        },
        {
            id: 'extended-high-threat-exposure',
            title: 'After exposure: the first 72 hours and the first month',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'Exposure itself is not the end; the chain reaction afterward is. The first goal is not “explain everything clearly”; it is “stop the spread, ensure physical safety, and find allies.”',
                },
                {
                    type: 'p',
                    text: 'Within 72 hours: confirm the scope of the leak (who saw it, whether there are screenshots, whether it was forwarded); pause new posts; minimize public information; change your avatar, username and passwords; check devices and accounts; tell 1–2 people you trust; do not scroll through comments alone.',
                },
                {
                    type: 'p',
                    text: 'Who to tell and what to say: prioritize people who will not immediately tell your parents or school; open with “I need help, not a trial”; give only necessary information; ask whether they can do something concrete (accompany you, give you a place to stay, pass a message, call the police).',
                },
                {
                    type: 'p',
                    text: 'Evidence: screenshots, screen recordings, links, times and account IDs; do not edit; back up encrypted; do not post it publicly to demand justice.',
                },
                {
                    type: 'p',
                    text: 'The first month: deal with the aftermath at school, at home, at work and in medical care; if there is a risk of violence at home, make a safety plan (ID, medication, money, backup phone, temporary place to stay); consider transferring schools, moving or changing jobs, but assess the cost and risk first; do not make irreversible decisions impulsively.',
                },
                {
                    type: 'p',
                    text: 'Minors vs adults: “life switching” is usually unrealistic for minors, and calling the police or being reported missing may put you in more danger; prioritize trusted adults, social workers, legal aid, and temporary shelter. Adults who move also need to consider money, work, documents, and continuity of medical care.',
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Do not confront or fight the other person, and do not publicly expose their personal information, just to “prove you’re fine.” Anger after exposure is normal, but retaliation usually brings the risk back onto you.',
                },
            ],
        },
        {
            id: 'extended-high-threat-circle',
            title: 'If you have a small trusted circle',
            level: 'extended',
            blocks: [
                {
                    type: 'p',
                    text: 'A small circle can provide information, temporary shelter, accompaniment, loans, and message relay, but it also concentrates risk. Principles: trust should be tiered, money should be small, records should be minimal, and decisions should be reversible.',
                },
                {
                    type: 'ul',
                    items: [
                        'Trust ladder: start with low-risk things (listening, making a phone call with you), then medium-risk (lending a small amount, receiving a package), and only then high-risk (knowing your address, real identity, finances).',
                        'Money: small amounts, money you can afford to lose, and write down whether it is a loan or a gift; do not give all your money to one person; use multisig or transparent ledgers for large amounts; do not run unregistered fundraising under the name of “mutual aid.”',
                        'Information: only tell people who need to know; do not create a large group; regularly clear chat logs; do not put all secrets in one person’s hands.',
                        'Safety: agree on check-ins, code words, and emergency contacts; know each other’s limits; when someone is threatened, protect the person first, not hunt for a mole.',
                    ],
                },
                {
                    type: 'warn',
                    kind: 'caution',
                    text: 'Do not organize false “mutual testimony,” do not forge documents, and do not retaliate with violence. These turn a small circle into a criminal conspiracy; if anyone is coerced, everyone is in more danger.',
                },
                {
                    type: 'p',
                    text: 'If you are helping someone else: first ask “Are you safe right now? What do you need?” Do not make decisions for them; do not promise what you cannot deliver; when minors, violence or medical care are involved, bring in professional organizations.',
                },
                {
                    type: 'warn',
                    kind: 'important',
                    text: 'This section is not an organizing manual. Intelligence pools, mutual-aid funds, and cross-regional networks require legal, financial, and security review; without that, do not do it.',
                },
            ],
        },
    ],
};

export default EN;
