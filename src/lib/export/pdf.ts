import type { Content } from 'pdfmake/interfaces';

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

function buildContent(item: any): Content[] {
    const blocks: Content[] = [];
    const c = item.content ?? {};

    // Summary
    if (c.summary) {
        blocks.push(sectionHeading('Summary'));
        blocks.push({ text: c.summary, margin: [0, 0, 0, 6] });
    }

    // Diagnosis
    if (c.diagnosis) {
        blocks.push(sectionHeading('Diagnosis'));
        const rows: [string, string][] = [];
        if (c.diagnosis.mainDiagnosis) rows.push(['Main diagnosis', c.diagnosis.mainDiagnosis]);
        if (c.diagnosis.secondaryDiagnoses?.length) rows.push(['Secondary', c.diagnosis.secondaryDiagnoses.join(', ')]);
        if (c.diagnosis.icdCodes?.length) rows.push(['ICD codes', c.diagnosis.icdCodes.join(', ')]);
        if (rows.length) blocks.push(keyValueTable(rows));
        if (c.diagnosis.notes) blocks.push({ text: c.diagnosis.notes, margin: [0, 0, 0, 6] });
    }

    // Medications
    if (c.medications?.length) {
        blocks.push(sectionHeading('Medications'));
        blocks.push({
            table: {
                headerRows: 1,
                widths: ['*', 'auto', 'auto', '*'],
                body: [
                    [
                        { text: 'Name', bold: true },
                        { text: 'Dose', bold: true },
                        { text: 'Frequency', bold: true },
                        { text: 'Notes', bold: true }
                    ],
                    ...c.medications.map((m: any) => [
                        m.name || '—',
                        m.dosage || '—',
                        m.frequency || '—',
                        m.notes || ''
                    ])
                ]
            },
            layout: 'lightHorizontalLines',
            margin: [0, 2, 0, 6]
        });
    }

    // Lab results / signals
    if (c.signals?.length) {
        blocks.push(sectionHeading('Signals & Lab Results'));
        const sigRows: [string, string][] = c.signals.map((s: any) => [
            s.name || s.type || '—',
            [s.value, s.unit].filter(Boolean).join(' ') || '—'
        ]);
        blocks.push(keyValueTable(sigRows));
    }

    // Vital signs
    if (c.vitalSigns) {
        blocks.push(sectionHeading('Vital Signs'));
        const vitals = c.vitalSigns;
        const rows: [string, string][] = [];
        if (vitals.bloodPressure) rows.push(['Blood pressure', vitals.bloodPressure]);
        if (vitals.heartRate) rows.push(['Heart rate', String(vitals.heartRate)]);
        if (vitals.temperature) rows.push(['Temperature', String(vitals.temperature)]);
        if (vitals.weight) rows.push(['Weight', String(vitals.weight)]);
        if (vitals.height) rows.push(['Height', String(vitals.height)]);
        if (rows.length) blocks.push(keyValueTable(rows));
    }

    // Recommendations / plan
    if (c.recommendations?.length || c.treatmentPlan) {
        blocks.push(sectionHeading('Recommendations'));
        if (c.treatmentPlan) blocks.push({ text: c.treatmentPlan, margin: [0, 0, 0, 4] });
        if (c.recommendations?.length) {
            blocks.push({
                ul: c.recommendations,
                margin: [0, 0, 0, 6]
            });
        }
    }

    // Notes / other text fields
    if (c.notes) {
        blocks.push(sectionHeading('Notes'));
        blocks.push({ text: c.notes, margin: [0, 0, 0, 6] });
    }

    return blocks;
}

export async function downloadPdf(item: any): Promise<void> {
    // Dynamic import to avoid bundle impact
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfMake = (await import('pdfmake/build/pdfmake')).default as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfFonts = (await import('pdfmake/build/vfs_fonts')) as any;
    pdfMake.vfs = pdfFonts?.default?.pdfMake?.vfs ?? pdfFonts?.pdfMake?.vfs ?? pdfFonts?.default?.vfs;

    const meta = item.metadata ?? {};
    const title = meta.title || 'Medical Report';
    const date = formatDate(meta.date);
    const patient = meta.patientName || meta.patient || '';

    const docDefinition = {
        info: { title },
        pageMargins: [50, 70, 50, 60],
        header: (currentPage: number, pageCount: number) => ({
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
        content: buildContent(item),
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
    pdfMake.createPdf(docDefinition).download(filename);
}
