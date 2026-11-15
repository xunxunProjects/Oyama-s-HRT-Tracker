import { describe, expect, it } from 'vitest';
import { PASSAGES, passageIdForLang, passageKeyForId } from '../src/domain/voice/passage';

describe('passageIdForLang', () => {
    it('uses the four recorded passages', () => {
        expect(passageIdForLang('zh')).toBe('zh');
        expect(passageIdForLang('ru')).toBe('ru');
        expect(passageIdForLang('uk')).toBe('uk');
        expect(passageIdForLang('en')).toBe('en');
    });

    it('falls back for scripts and languages without their own passage', () => {
        expect(passageIdForLang('zh-TW')).toBe('zh');
        expect(passageIdForLang('yue')).toBe('zh');
        expect(passageIdForLang('ja')).toBe('en');
        expect(passageIdForLang('ko')).toBe('en');
        expect(passageIdForLang('tr')).toBe('en');
    });
});

describe('PASSAGES', () => {
    it('keeps the fixed sentences', () => {
        expect(PASSAGES.zh).toBe('今天天气很好，我准备出门走一走，顺便买点东西。');
        expect(PASSAGES.en).toBe('The north wind and the sun were disputing which was the stronger.');
        expect(PASSAGES.ru).toBe('Сегодня хорошая погода, я собираюсь немного прогуляться и купить кое-что по дороге.');
        expect(PASSAGES.uk).toBe('Сьогодні гарна погода, я збираюся трохи прогулятися й купити дещо дорогою.');
    });
});

describe('passageKeyForId', () => {
    it('names the translation key', () => {
        expect(passageKeyForId('zh')).toBe('voice.passage.zh');
        expect(passageKeyForId('en')).toBe('voice.passage.en');
        expect(passageKeyForId('ru')).toBe('voice.passage.ru');
        expect(passageKeyForId('uk')).toBe('voice.passage.uk');
    });
});
