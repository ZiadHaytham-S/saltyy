import type { Response } from 'express';
export function sendVideo(response: Response, content: Buffer, range?: string) {
  response.setHeader('Content-Type', 'video/mp4');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Disposition', 'inline; filename="store.mp4"');
  response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Cache-Control', 'private, no-store');
  if (!range) {
    response.setHeader('Content-Length', content.length);
    response.send(content);
    return;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) {
    response
      .status(416)
      .setHeader('Content-Range', 'bytes */' + content.length);
    response.end();
    return;
  }
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, content.length - Number(match[2]));
  const end =
    match[1] && match[2]
      ? Math.min(Number(match[2]), content.length - 1)
      : content.length - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= content.length
  ) {
    response
      .status(416)
      .setHeader('Content-Range', 'bytes */' + content.length);
    response.end();
    return;
  }
  response.status(206);
  response.setHeader(
    'Content-Range',
    `bytes ${start}-${end}/${content.length}`,
  );
  response.setHeader('Content-Length', end - start + 1);
  response.send(content.subarray(start, end + 1));
}
