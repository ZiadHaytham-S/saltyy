import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import sharp from 'sharp';
import { MAX_IMAGE_BYTES } from '@sallty/contracts';
export abstract class StorageAdapter {
  abstract put(key: string, content: Buffer): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract remove(key: string): Promise<void>;
}
@Injectable()
export class LocalStorageAdapter extends StorageAdapter {
  private readonly root = resolve(
    process.env.LOCAL_UPLOAD_ROOT ?? '../../.local/uploads',
  );
  private path(key: string) {
    if (!/^[a-f\d]{24}\/[a-f\d]{32}\.(?:webp|mp4)$/.test(key))
      throw new Error('Invalid storage key');
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep))
      throw new Error('Invalid storage path');
    return path;
  }
  async put(key: string, content: Buffer) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, { flag: 'wx' });
  }
  async read(key: string) {
    return readFile(this.path(key));
  }
  async remove(key: string) {
    try {
      await unlink(this.path(key));
    } catch (error) {
      if (!(
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
    }
  }
}
let decodingImages = 0;
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
export function validateVideo(file: {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}) {
  const fail = () =>
    new BadRequestException({
      code: 'INVALID_VIDEO',
      message: 'ارفع فيديو MP4 سليمًا، بحد أقصى 20 MB.',
    });
  const data = file.buffer;
  if (
    file.mimetype !== 'video/mp4' ||
    !/\.mp4$/i.test(file.originalname) ||
    data.length < 24 ||
    data.length > MAX_VIDEO_BYTES
  )
    throw fail();
  const boxes = new Set<string>();
  let offset = 0,
    count = 0;
  while (offset < data.length) {
    if (++count > 10000 || offset + 8 > data.length) throw fail();
    let size = data.readUInt32BE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    if (size === 1) {
      if (offset + 16 > data.length) throw fail();
      const wide = data.readBigUInt64BE(offset + 8);
      if (wide > BigInt(MAX_VIDEO_BYTES) || wide < 16n) throw fail();
      size = Number(wide);
    }
    if (size === 0) size = data.length - offset;
    if (size < 8 || offset + size > data.length) throw fail();
    if (
      offset === 0 &&
      (type !== 'ftyp' ||
        size < 16 ||
        !['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V '].includes(
          data.toString('ascii', 8, 12),
        ))
    )
      throw fail();
    boxes.add(type);
    offset += size;
  }
  if (!boxes.has('moov') || !boxes.has('mdat')) throw fail();
  return data;
}
export async function normalizeImage(file: {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}) {
  const fail = () =>
    new BadRequestException({
      code: 'INVALID_IMAGE',
      message:
        'ارفع صورة JPEG أو PNG أو WebP سليمة، غير متحركة، بحد 5 MB و16 مليون pixel',
    });
  const data = file.buffer;
  if (!data.length || data.length > MAX_IMAGE_BYTES) throw fail();
  const format = data.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    ? 'jpeg'
    : data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'png'
      : data.subarray(0, 4).toString() === 'RIFF' &&
          data.subarray(8, 12).toString() === 'WEBP'
        ? 'webp'
        : null;
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/' + format;
  if (
    !format ||
    file.mimetype !== mime ||
    !/\.(?:jpe?g|png|webp)$/i.test(file.originalname)
  )
    throw fail();
  // Bound full decodes per API process; reject bursts rather than retaining a queue.
  if (decodingImages >= 2)
    throw new ServiceUnavailableException({
      code: 'IMAGE_BUSY',
      message: 'رفع الصور مشغول مؤقتًا. استنى لحظة وجرّب تاني.',
    });
  decodingImages++;
  try {
    const image = sharp(data, {
      failOn: 'warning',
      limitInputPixels: 16_000_000,
    });
    const metadata = await image.metadata();
    if (
      metadata.format !== format ||
      (metadata.pages ?? 1) !== 1 ||
      !metadata.width ||
      !metadata.height
    )
      throw fail();
    const result = await image
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .timeout({ seconds: 5 })
      .toBuffer({ resolveWithObject: true });
    if (result.data.length > MAX_IMAGE_BYTES) throw fail();
    return {
      content: result.data,
      width: result.info.width,
      height: result.info.height,
    };
  } catch {
    throw fail();
  } finally {
    decodingImages--;
  }
}
