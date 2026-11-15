import * as fastCsv from 'fast-csv';

/**
 * Streams sessions data as CSV.
 * @param {object[]} sessions
 * @param {import('stream').Writable} writeStream
 */
export function streamSessionsCsv(sessions, writeStream) {
  const csvStream = fastCsv.format({ headers: true });
  csvStream.pipe(writeStream);

  for (const s of sessions) {
    csvStream.write({
      id: s.id,
      candidateId: s.candidateId,
      role: s.role,
      topic: s.topic,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    });
  }

  csvStream.end();
}

