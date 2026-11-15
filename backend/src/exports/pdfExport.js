import PDFDocument from 'pdfkit';

/**
 * Generates an interview performance report PDF.
 * @param {object} session
 * @param {object} report
 * @param {import('stream').Writable} writeStream
 */
export function generatePdfReport(session, report, writeStream) {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(writeStream);

  // Title Header
  doc.fontSize(22).fillColor('#111827').text('Praxis — AI Interview Evaluation Report', { underline: true });
  doc.moveDown(1);

  // Meta Section
  doc.fontSize(12).fillColor('#374151');
  doc.text(`Session ID: ${session.id}`);
  doc.text(`Role: ${session.role || 'N/A'}`);
  doc.text(`Topic: ${session.topic || 'N/A'}`);
  doc.text(`Status: ${session.status}`);
  doc.text(`Date: ${session.createdAt}`);
  doc.moveDown(1);

  // Scores
  doc.fontSize(16).fillColor('#111827').text('Evaluation Scores', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor('#374151');

  if (report?.scores) {
    for (const [key, val] of Object.entries(report.scores)) {
      doc.text(`• ${key}: ${val}/100`);
    }
  } else {
    doc.text('No score breakdown available.');
  }
  doc.moveDown(1);

  // Verdict
  doc.fontSize(14).fillColor('#059669').text(`Verdict: ${report?.verdict || 'N/A'}`);
  doc.moveDown(1);

  // Summary
  doc.fontSize(16).fillColor('#111827').text('Executive Summary', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11).fillColor('#4b5563').text(report?.summary || 'No summary recorded.');
  doc.moveDown(1);

  // Strengths
  if (report?.strengths?.length) {
    doc.fontSize(14).fillColor('#111827').text('Key Strengths:');
    doc.fontSize(11).fillColor('#166534');
    for (const s of report.strengths) {
      doc.text(`+ ${s}`);
    }
    doc.moveDown(1);
  }

  // Weaknesses
  if (report?.weaknesses?.length) {
    doc.fontSize(14).fillColor('#111827').text('Areas for Improvement:');
    doc.fontSize(11).fillColor('#991b1b');
    for (const w of report.weaknesses) {
      doc.text(`- ${w}`);
    }
    doc.moveDown(1);
  }

  doc.end();
}

