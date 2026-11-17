import { describe, expect, it } from 'vitest';
import { detectFormat } from '../../src/engine';

describe('type de fichier', () => {
  it('reconnaît les formats courants de l’iPhone', () => {
    expect(detectFormat('IMG_1234.HEIC', 'image/heic').format).toBe('HEIC');
    expect(detectFormat('IMG_1234.jpeg', 'image/jpeg').format).toBe('JPEG');
    expect(detectFormat('capture.PNG', 'image/png').format).toBe('PNG');
  });

  it('se rabat sur le type déclaré quand le nom n’a pas d’extension', () => {
    expect(detectFormat('image', 'image/jpeg').format).toBe('JPEG');
    expect(detectFormat('image', 'image/heif').format).toBe('HEIC');
  });

  it('repère les RAW pour les mettre de côté', () => {
    expect(detectFormat('IMG_1.DNG', '')).toMatchObject({ format: 'DNG', isRaw: true });
    expect(detectFormat('photo.dng', 'image/x-adobe-dng').isRaw).toBe(true);
    expect(detectFormat('DSC_1.NEF', '').isRaw).toBe(true);
    expect(detectFormat('IMG_1.HEIC', 'image/heic').isRaw).toBe(false);
  });

  it('repère les vidéos', () => {
    expect(detectFormat('IMG_1.MOV', 'video/quicktime')).toMatchObject({ format: 'VIDEO', kind: 'video' });
  });
});
