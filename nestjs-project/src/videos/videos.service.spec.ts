import { QueryFailedError } from 'typeorm';
import {
  ChannelNotFoundException,
  UnsupportedVideoTypeException,
  VideoTooLargeException,
} from '../common/exceptions/domain.exception';
import { VideoStatus } from './videos.constants';
import { VideosService } from './videos.service';

const MIB = 1024 * 1024;
const TEN_GIB = 10 * 1024 * MIB;
const USER_ID = 'user-id';

const validDto = {
  filename: 'Clip.MP4',
  size_bytes: 100 * MIB,
  content_type: 'video/mp4',
};

function slugViolation(): QueryFailedError {
  const err = new QueryFailedError('INSERT', [], new Error()) as any;
  err.code = '23505';
  err.detail = 'Key (slug)=(abc) already exists.';
  return err;
}

describe('VideosService', () => {
  let repository: Record<string, jest.Mock>;
  let channels: Record<string, jest.Mock>;
  let storage: Record<string, jest.Mock>;
  let service: VideosService;

  beforeEach(() => {
    repository = {
      create: jest.fn((data) => data),
      save: jest.fn(async (video) => ({
        status: VideoStatus.DRAFT,
        ...video,
      })),
      update: jest.fn(),
      delete: jest.fn(),
    };
    channels = { findByUserId: jest.fn().mockResolvedValue({ id: 'channel' }) };
    storage = { createMultipartUpload: jest.fn().mockResolvedValue('upload') };
    service = new VideosService(
      repository as any,
      channels as any,
      storage as any,
      { maxSizeBytes: TEN_GIB, partSizeBytes: 64 * MIB } as any,
    );
  });

  describe('initiateUpload', () => {
    it('should reject a file above the size limit', async () => {
      await expect(
        service.initiateUpload(USER_ID, {
          ...validDto,
          size_bytes: TEN_GIB + 1,
        }),
      ).rejects.toThrow(VideoTooLargeException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should accept a file exactly at the size limit', async () => {
      const result = await service.initiateUpload(USER_ID, {
        ...validDto,
        size_bytes: TEN_GIB,
      });

      expect(result.part_size_bytes).toBe(64 * MIB);
      expect(result.part_count).toBe(160);
    });

    it('should reject a non-video content type', async () => {
      await expect(
        service.initiateUpload(USER_ID, {
          ...validDto,
          content_type: 'text/plain',
        }),
      ).rejects.toThrow(UnsupportedVideoTypeException);
    });

    it('should reject a user without a channel', async () => {
      channels.findByUserId.mockResolvedValue(null);

      await expect(service.initiateUpload(USER_ID, validDto)).rejects.toThrow(
        ChannelNotFoundException,
      );
    });

    it('should default the title to the file name without extension', async () => {
      await service.initiateUpload(USER_ID, validDto);

      expect(repository.save.mock.calls[0][0].title).toBe('Clip');
    });

    it('should normalize the extension in the storage key', async () => {
      await service.initiateUpload(USER_ID, validDto);

      const { id, storage_key } = repository.save.mock.calls[0][0];
      expect(storage_key).toBe(`videos/${id}/original.mp4`);
    });

    it('should drop an unsafe extension from the storage key', async () => {
      await service.initiateUpload(USER_ID, {
        ...validDto,
        filename: 'clip.../../etc',
      });

      const { id, storage_key } = repository.save.mock.calls[0][0];
      expect(storage_key).toBe(`videos/${id}/original`);
    });

    it('should grow the part size to stay within the S3 part limit', async () => {
      service = new VideosService(
        repository as any,
        channels as any,
        storage as any,
        { maxSizeBytes: 200000 * MIB, partSizeBytes: 5 * MIB } as any,
      );

      const result = await service.initiateUpload(USER_ID, {
        ...validDto,
        size_bytes: 100000 * MIB,
      });

      expect(result.part_count).toBeLessThanOrEqual(10000);
    });

    it('should retry with a new slug on collision', async () => {
      repository.save.mockRejectedValueOnce(slugViolation());

      await service.initiateUpload(USER_ID, validDto);

      const [first, second] = repository.save.mock.calls;
      expect(repository.save).toHaveBeenCalledTimes(2);
      expect(first[0].slug).not.toBe(second[0].slug);
    });

    it('should give up after exhausting slug retries', async () => {
      repository.save.mockRejectedValue(slugViolation());

      await expect(service.initiateUpload(USER_ID, validDto)).rejects.toThrow(
        QueryFailedError,
      );
      expect(repository.save).toHaveBeenCalledTimes(6);
    });

    it('should remove the draft when the storage fails', async () => {
      storage.createMultipartUpload.mockRejectedValue(new Error('storage'));

      await expect(service.initiateUpload(USER_ID, validDto)).rejects.toThrow(
        'storage',
      );
      expect(repository.delete).toHaveBeenCalledTimes(1);
    });
  });
});
