import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DoseEvent, LabResult, Route, Ester } from '../../logic';
import { formatDate } from '../utils/helpers';
import { Lang, TRANSLATIONS } from '../i18n/translations';

// Define the type for user-friendly export data
interface ExportData {
    events: DoseEvent[];
    labResults: LabResult[];
    weight: number;
    lang: Lang;
    t: (key: string) => string;
}

export const exportToCSV = (data: ExportData): string => {
    const { events, labResults, lang, t } = data;
    const rows = [];

    // Header
    rows.push([
        t('export.col.type'),
        t('export.col.date'),
        t('export.col.item'),
        t('export.col.value'),
        t('export.col.unit'),
        t('export.col.route_ester')
    ]);

    // Events
    events.forEach(e => {
        const date = formatDate(new Date(e.timeH * 3600000), lang);
        rows.push([
            t('export.val.dose'),
            date,
            'Estradiol',
            e.doseMG,
            'mg',
            `${e.route} - ${e.ester}`
        ]);
    });

    // Labs
    labResults.forEach(l => {
        const date = formatDate(new Date(l.timeH * 3600000), lang);
        rows.push([
            t('export.val.lab'),
            date,
            'Estradiol',
            l.concValue,
            l.unit,
            '-'
        ]);
    });

    return rows.map(r => r.join(',')).join('\n');
};

export const exportToPDF = (data: ExportData) => {
    const { events, labResults } = data;
    // Force English for PDF to avoid font issues with non-Latin characters
    const safeLang = 'en';
    const tSafe = (key: string) => (TRANSLATIONS.en as any)[key] || key;

    const doc = new jsPDF();

    // Title
    doc.setFontSize(18);
    doc.text(tSafe('export.pdf.title'), 14, 22);
    doc.setFontSize(11);
    doc.text(`${tSafe('export.pdf.generated_on')} ${new Date().toLocaleDateString('en-US')}`, 14, 30);

    // --- Events Table ---
    doc.setFontSize(14);
    doc.text(tSafe('export.pdf.history'), 14, 45);

    const eventRows = events.map(e => [
        formatDate(new Date(e.timeH * 3600000), safeLang as Lang),
        `${e.doseMG} mg`,
        e.route,
        e.ester
    ]);

    autoTable(doc, {
        startY: 50,
        head: [['Date', 'Dose', 'Route', 'Ester']],
        body: eventRows,
    });

    // --- Labs Table ---
    // @ts-ignore - autoTable adds lastAutoTable property
    const finalY = doc.lastAutoTable.finalY || 50;

    doc.setFontSize(14);
    doc.text(tSafe('export.pdf.labs'), 14, finalY + 15);

    const labRows = labResults.map(l => [
        formatDate(new Date(l.timeH * 3600000), safeLang as Lang),
        `${l.concValue} ${l.unit}`
    ]);

    autoTable(doc, {
        startY: finalY + 20,
        head: [['Date', 'Level']],
        body: labRows,
    });

    doc.save(`hrt-report-${new Date().toISOString().split('T')[0]}.pdf`);
};
