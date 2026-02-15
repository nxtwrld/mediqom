/**
 * Recovery Document PDF Generator
 *
 * Generates a printable PDF document containing the recovery key
 * for offline storage and backup purposes.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';

export interface RecoveryDocumentOptions {
  email: string;
  recoveryKey: string;
  createdAt?: Date;
  appName?: string;
  recoveryUrl?: string;
}

/**
 * Generate a QR code as a data URL
 */
export async function generateRecoveryQR(recoveryKey: string): Promise<string> {
  // Create QR code with the recovery key
  // Using high error correction for better scanability when printed
  return await QRCode.toDataURL(recoveryKey, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 200,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });
}

/**
 * Generate a printable PDF recovery document
 */
export async function generateRecoveryPDF(options: RecoveryDocumentOptions): Promise<Uint8Array> {
  const {
    email,
    recoveryKey,
    createdAt = new Date(),
    appName = 'Mediqom',
    recoveryUrl = 'https://mediqom.com/recover'
  } = options;

  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size

  // Load fonts
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);

  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  // Header
  page.drawText(`${appName.toUpperCase()} RECOVERY DOCUMENT`, {
    x: margin,
    y: y,
    size: 20,
    font: helveticaBold,
    color: rgb(0.1, 0.1, 0.1)
  });
  y -= 40;

  // Horizontal line
  page.drawLine({
    start: { x: margin, y: y },
    end: { x: width - margin, y: y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8)
  });
  y -= 30;

  // Account info
  page.drawText('Account:', {
    x: margin,
    y: y,
    size: 12,
    font: helveticaBold,
    color: rgb(0.3, 0.3, 0.3)
  });
  page.drawText(email, {
    x: margin + 70,
    y: y,
    size: 12,
    font: helvetica,
    color: rgb(0.1, 0.1, 0.1)
  });
  y -= 20;

  // Created date
  page.drawText('Created:', {
    x: margin,
    y: y,
    size: 12,
    font: helveticaBold,
    color: rgb(0.3, 0.3, 0.3)
  });
  page.drawText(createdAt.toISOString().split('T')[0], {
    x: margin + 70,
    y: y,
    size: 12,
    font: helvetica,
    color: rgb(0.1, 0.1, 0.1)
  });
  y -= 50;

  // Recovery Key section
  page.drawText('RECOVERY KEY', {
    x: margin,
    y: y,
    size: 14,
    font: helveticaBold,
    color: rgb(0.1, 0.1, 0.1)
  });
  y -= 25;

  // Recovery key box
  const boxPadding = 15;
  const boxHeight = 50;
  const boxY = y - boxHeight;

  // Draw box background
  page.drawRectangle({
    x: margin,
    y: boxY,
    width: width - 2 * margin,
    height: boxHeight,
    color: rgb(0.97, 0.97, 0.97),
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 1
  });

  // Draw recovery key (monospace font for clarity)
  page.drawText(recoveryKey, {
    x: margin + boxPadding,
    y: boxY + (boxHeight / 2) - 6,
    size: 14,
    font: courier,
    color: rgb(0.1, 0.1, 0.1)
  });
  y = boxY - 40;

  // QR Code section
  page.drawText('QR CODE', {
    x: margin,
    y: y,
    size: 14,
    font: helveticaBold,
    color: rgb(0.1, 0.1, 0.1)
  });
  y -= 15;

  // Generate and embed QR code
  const qrDataUrl = await generateRecoveryQR(recoveryKey);
  const qrImageBytes = await fetch(qrDataUrl).then(res => res.arrayBuffer());
  const qrImage = await pdfDoc.embedPng(qrImageBytes);

  const qrSize = 150;
  page.drawImage(qrImage, {
    x: margin,
    y: y - qrSize,
    width: qrSize,
    height: qrSize
  });
  y -= qrSize + 30;

  // Horizontal line
  page.drawLine({
    start: { x: margin, y: y },
    end: { x: width - margin, y: y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8)
  });
  y -= 30;

  // Instructions section
  page.drawText('INSTRUCTIONS', {
    x: margin,
    y: y,
    size: 14,
    font: helveticaBold,
    color: rgb(0.1, 0.1, 0.1)
  });
  y -= 25;

  const instructions = [
    '1. Store this document in a secure location (safe, lockbox, etc.)',
    '2. Do not share this document with anyone.',
    '3. If you forget your passphrase, visit:',
    `   ${recoveryUrl}`,
    '4. Enter the recovery key above to regain access to your data.',
    '5. After recovery, set up a new passphrase or passkey.',
    '6. Generate a new recovery document after changing your credentials.'
  ];

  for (const instruction of instructions) {
    page.drawText(instruction, {
      x: margin,
      y: y,
      size: 11,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3)
    });
    y -= 18;
  }

  y -= 20;

  // Warning box
  const warningBoxHeight = 70;
  const warningBoxY = y - warningBoxHeight;

  page.drawRectangle({
    x: margin,
    y: warningBoxY,
    width: width - 2 * margin,
    height: warningBoxHeight,
    color: rgb(1, 0.95, 0.9),
    borderColor: rgb(0.9, 0.5, 0.2),
    borderWidth: 2
  });

  page.drawText('⚠️ WARNING', {
    x: margin + boxPadding,
    y: warningBoxY + warningBoxHeight - 20,
    size: 12,
    font: helveticaBold,
    color: rgb(0.8, 0.3, 0)
  });

  const warningText = [
    'Anyone with this recovery key can access your encrypted data.',
    'Keep this document secure and never share it digitally.',
    'Lost recovery key + forgotten passphrase = permanent data loss.'
  ];

  let warningY = warningBoxY + warningBoxHeight - 38;
  for (const line of warningText) {
    page.drawText(line, {
      x: margin + boxPadding,
      y: warningY,
      size: 10,
      font: helvetica,
      color: rgb(0.5, 0.2, 0)
    });
    warningY -= 14;
  }

  // Footer
  const footerY = 40;
  page.drawText(`Generated by ${appName} • Keep this document safe`, {
    x: margin,
    y: footerY,
    size: 9,
    font: helvetica,
    color: rgb(0.6, 0.6, 0.6)
  });

  // Serialize the PDF
  return await pdfDoc.save();
}

/**
 * Download the recovery PDF in the browser
 */
export async function downloadRecoveryPDF(options: RecoveryDocumentOptions): Promise<void> {
  const pdfBytes = await generateRecoveryPDF(options);

  // Create blob and trigger download
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `mediqom-recovery-${options.email.split('@')[0]}-${new Date().toISOString().split('T')[0]}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up
  URL.revokeObjectURL(url);
}

/**
 * Open print dialog for the recovery PDF
 */
export async function printRecoveryPDF(options: RecoveryDocumentOptions): Promise<void> {
  const pdfBytes = await generateRecoveryPDF(options);

  // Create blob and open in new window for printing
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const printWindow = window.open(url, '_blank');
  if (printWindow) {
    printWindow.addEventListener('load', () => {
      printWindow.print();
    });
  }
}
