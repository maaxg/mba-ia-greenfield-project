import { videoOriginalKey, videoThumbnailKey } from './storage-key.util';

describe('storage keys', () => {
  it('should place the original under the video id', () => {
    expect(videoOriginalKey('id-1', '.mp4')).toBe('videos/id-1/original.mp4');
  });

  it('should accept an original without extension', () => {
    expect(videoOriginalKey('id-1', '')).toBe('videos/id-1/original');
  });

  it('should place the thumbnail under the video id', () => {
    expect(videoThumbnailKey('id-1')).toBe('videos/id-1/thumbnail.jpg');
  });
});
