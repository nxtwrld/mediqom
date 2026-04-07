import type { Content } from 'pdfmake/interfaces';
import { get } from 'svelte/store';
import { t } from '$lib/i18n';
import { apiFetch } from '$lib/api/client';
import { decrypt } from '$lib/documents/index';

function tr(key: string): string {
    const raw = (get(t)(key) as string) || key.split('.').pop() || key;
    return raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function formatDate(date: string | undefined): string {
    if (!date) return '';
    try {
        return new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
        return date;
    }
}

function sectionHeading(title: string): Content {
    return {
        text: title,
        style: 'sectionHeader',
        margin: [0, 14, 0, 4]
    };
}

function keyValueTable(rows: [string, string][]): Content {
    if (rows.length === 0) return { text: '' };
    return {
        table: {
            widths: ['35%', '*'],
            body: rows.map(([k, v]) => [
                { text: k, bold: true, color: '#555' },
                { text: v || '—' }
            ])
        },
        layout: 'lightHorizontalLines',
        margin: [0, 2, 0, 6]
    };
}

function buildProfileSection(profile: any): Content[] {
    if (!profile) return [];
    const rows: [string, string][] = [];
    if (profile.fullName) rows.push([tr('report.name'), profile.fullName]);
    if (profile.birthDate) rows.push([tr('report.birth-date'), formatDate(profile.birthDate)]);
    if (profile.vcard?.gender) rows.push([tr('report.sex'), profile.vcard.gender]);
    if (profile.health?.bloodType) rows.push([tr('report.blood-type'), profile.health.bloodType]);
    if (!rows.length) return [];
    return [sectionHeading(tr('report.patient')), keyValueTable(rows)];
}

function buildPerformerSection(performer: any): Content[] {
    if (!performer) return [];
    const list = Array.isArray(performer) ? performer : [performer];
    const rows: [string, string][] = [];
    for (const p of list) {
        const name = p.name || p.fn || '';
        if (name) rows.push([tr('report.name'), [p.title, name].filter(Boolean).join(' ')]);
        if (p.specialty) rows.push(['Specialty', p.specialty]);
        if (p.institution?.name) rows.push(['Institution', p.institution.name]);
        if (p.institution?.department) rows.push(['Department', p.institution.department]);
        if (p.datePerformed) rows.push(['Date', formatDate(p.datePerformed)]);
    }
    if (!rows.length) return [];
    return [sectionHeading(tr('report.performer')), keyValueTable(rows)];
}

function vitalStr(v: any): string {
    if (!v) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    // e.g. bloodPressure: { systolic: 120, diastolic: 80 }
    if (v.systolic != null && v.diastolic != null) return `${v.systolic}/${v.diastolic}`;
    return JSON.stringify(v);
}

function buildContent(item: any, profile?: any): Content[] {
    const blocks: Content[] = [];
    const c = item.content ?? {};

    blocks.push(...buildProfileSection(profile));

    // Summary
    if (c.summary) {
        blocks.push(sectionHeading(tr('report.summary')));
        blocks.push({ text: c.summary, margin: [0, 0, 0, 6] });
    }

    // Diagnosis — array of { code, description, type, confidence, date, notes }
    const diagArray = Array.isArray(c.diagnosis) ? c.diagnosis : null;
    if (diagArray?.length) {
        blocks.push(sectionHeading(tr('report.diagnosis')));
        for (const d of diagArray) {
            const rows: [string, string][] = [];
            const typeKey = d.type ? `report.diagnosis-types.${d.type}` : '';
            const typeLabel = typeKey ? tr(typeKey) : '';
            const desc = [d.description, d.code ? `(${d.code})` : ''].filter(Boolean).join(' ');
            rows.push([typeLabel || tr('report.diagnosis'), desc || '—']);
            if (d.notes) rows.push([tr('report.notes'), d.notes]);
            blocks.push(keyValueTable(rows));
        }
    }

    // Lab results / signals — 3-column table: name | value | reference
    const signals = c.signals || c.laboratory;
    if (signals?.length) {
        blocks.push(sectionHeading(tr('report.vitals-and-amp-results')));
        blocks.push({
            table: {
                headerRows: 1,
                widths: ['*', 'auto', 'auto'],
                body: [
                    [
                        { text: tr('report.name'), bold: true },
                        { text: tr('report.value'), bold: true },
                        { text: tr('report.reference-range'), bold: true }
                    ],
                    ...signals.map((s: any) => [
                        s.signal || s.test || s.name || '—',
                        [s.value, s.unit].filter(v => v != null && v !== '').join(' ') || '—',
                        s.reference || ''
                    ])
                ]
            },
            layout: 'lightHorizontalLines',
            margin: [0, 2, 0, 6]
        } as Content);
    }

    // Vital signs
    if (c.vitalSigns && typeof c.vitalSigns === 'object') {
        const vitals = c.vitalSigns;
        const rows: [string, string][] = [];
        if (vitals.bloodPressure) rows.push([tr('report.blood-pressure'), vitalStr(vitals.bloodPressure)]);
        if (vitals.heartRate) rows.push([tr('report.heart-rate'), vitalStr(vitals.heartRate)]);
        if (vitals.temperature) rows.push([tr('report.temperature'), vitalStr(vitals.temperature)]);
        if (vitals.weight) rows.push([tr('report.weight'), vitalStr(vitals.weight)]);
        if (vitals.height) rows.push([tr('report.height'), vitalStr(vitals.height)]);
        if (vitals.oxygenSaturation) rows.push([tr('report.oxygen-saturation'), vitalStr(vitals.oxygenSaturation)]);
        if (vitals.respiratoryRate) rows.push([tr('report.respiratory-rate'), vitalStr(vitals.respiratoryRate)]);
        if (rows.length) {
            blocks.push(sectionHeading(tr('report.vital-signs')));
            blocks.push(keyValueTable(rows));
        }
    }

    // Medications
    if (c.medications?.length) {
        blocks.push(sectionHeading(tr('report.medications')));
        blocks.push({
            table: {
                headerRows: 1,
                widths: ['*', 'auto', 'auto', '*'],
                body: [
                    [
                        { text: tr('report.name'), bold: true },
                        { text: tr('report.dose'), bold: true },
                        { text: tr('report.frequency'), bold: true },
                        { text: tr('report.notes'), bold: true }
                    ],
                    ...c.medications.map((m: any) => [
                        m.name || '—',
                        m.dosage || m.dose || '—',
                        m.frequency || '—',
                        m.notes || ''
                    ])
                ]
            },
            layout: 'lightHorizontalLines',
            margin: [0, 2, 0, 6]
        } as Content);
    }

    // Recommendations / plan
    if (c.recommendations?.length || c.treatmentPlan) {
        blocks.push(sectionHeading(tr('report.recommendations')));
        if (c.treatmentPlan) blocks.push({ text: c.treatmentPlan, margin: [0, 0, 0, 4] });
        if (c.recommendations?.length) {
            blocks.push({ ul: c.recommendations, margin: [0, 0, 0, 6] } as Content);
        }
    }

    // Notes
    if (c.notes) {
        blocks.push(sectionHeading(tr('report.notes')));
        blocks.push({ text: c.notes, margin: [0, 0, 0, 6] });
    }

    blocks.push(...buildPerformerSection(c.performer));

    return blocks;
}

async function loadAttachmentData(att: any, item: any): Promise<{ base64: string; type: string } | null> {
    try {
        if (!att.path || !item.key) return null;
        const profileId = att.path.split('/')[0];
        const fileResponse = await apiFetch(
            `/v1/med/profiles/${profileId}/attachments?path=${encodeURIComponent(att.path)}`
        );
        if (!fileResponse.ok) return null;
        const encryptedData = await fileResponse.text();
        const decrypted = await decrypt([encryptedData], item.key);
        const json = JSON.parse(decrypted[0]);
        return { base64: json.file, type: att.type || 'application/octet-stream' };
    } catch {
        return null;
    }
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function triggerDownload(bytes: Uint8Array, filename: string) {
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export async function downloadPdf(item: any, profile?: any): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfMake = (await import('pdfmake/build/pdfmake')).default as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfFonts = (await import('pdfmake/build/vfs_fonts')) as any;
    pdfMake.vfs = pdfFonts?.default?.pdfMake?.vfs ?? pdfFonts?.pdfMake?.vfs ?? pdfFonts?.default?.vfs;

    const meta = item.metadata ?? {};
    const title = meta.title || 'Medical Report';
    const date = formatDate(meta.date);
    const patient = meta.patientName || meta.patient || '';

    const content = buildContent(item, profile);

    // Append image attachments as extra pages in pdfmake
    for (const att of (item.attachments ?? [])) {
        if (!att.type?.startsWith('image/')) continue;
        const data = await loadAttachmentData(att, item);
        if (data) {
            content.push({
                image: `data:${data.type};base64,${data.base64}`,
                width: 500,
                pageBreak: 'before'
            } as Content);
        }
    }

    const docDefinition = {
        info: { title },
        pageMargins: [50, 70, 50, 60],
        header: (_currentPage: number, _pageCount: number) => ({
            columns: [
                {
                    stack: [
                        { text: title, bold: true, fontSize: 11 },
                        { text: date, fontSize: 9, color: '#666' }
                    ],
                    margin: [50, 20, 0, 0]
                },
                {
                    text: patient,
                    alignment: 'right',
                    fontSize: 10,
                    color: '#444',
                    margin: [0, 20, 50, 0]
                }
            ]
        }),
        footer: (currentPage: number, pageCount: number) => ({
            columns: [
                { text: 'mediqom', color: '#aaa', fontSize: 9, margin: [50, 0, 0, 0] },
                { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 9, color: '#aaa', margin: [0, 0, 50, 0] }
            ]
        }),
        content,
        styles: {
            sectionHeader: {
                fontSize: 13,
                bold: true,
                color: '#1a1a1a',
                decoration: 'underline'
            }
        },
        defaultStyle: {
            fontSize: 10,
            lineHeight: 1.4
        }
    };

    const filename = `${title}${date ? ' - ' + date : ''}.pdf`;

    // Generate pdfmake PDF as buffer (getBuffer() returns a Promise in this pdfmake version)
    const pdfBytes: Uint8Array = await pdfMake.createPdf(docDefinition).getBuffer();

    // Merge PDF attachments with pdf-lib
    const pdfAttachments: Uint8Array[] = [];
    for (const att of (item.attachments ?? [])) {
        if (!att.type?.includes('pdf')) continue;
        const data = await loadAttachmentData(att, item);
        if (data) pdfAttachments.push(base64ToBytes(data.base64));
    }

    if (pdfAttachments.length > 0) {
        const { PDFDocument } = await import('pdf-lib');
        const mainDoc = await PDFDocument.load(pdfBytes);
        for (const attBytes of pdfAttachments) {
            const attDoc = await PDFDocument.load(attBytes);
            const pages = await mainDoc.copyPages(attDoc, attDoc.getPageIndices());
            pages.forEach(p => mainDoc.addPage(p));
        }
        triggerDownload(await mainDoc.save(), filename);
    } else {
        triggerDownload(pdfBytes, filename);
    }
}
