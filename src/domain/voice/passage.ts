import type { VoicePassageId } from './types';

export const PASSAGES: Record<VoicePassageId, string> = {
    zh: '今天天气很好，我准备出门走一走，顺便买点东西。',
    en: 'The north wind and the sun were disputing which was the stronger.',
    ru: 'Сегодня хорошая погода, я собираюсь немного прогуляться и купить кое-что по дороге.',
    uk: 'Сьогодні гарна погода, я збираюся трохи прогулятися й купити дещо дорогою.',
};

export function passageIdForLang(lang: string): VoicePassageId {
    if (lang === 'ru' || lang === 'uk') return lang;
    if (lang === 'zh' || lang === 'zh-TW' || lang === 'yue') return 'zh';
    return 'en';
}

export function passageKeyForId(id: VoicePassageId): string {
    return `voice.passage.${id}`;
}
