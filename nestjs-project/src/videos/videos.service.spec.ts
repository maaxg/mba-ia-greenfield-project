import { QueryFailedError } from 'typeorm';
import {
  ChannelNotFoundException,
  UnsupportedVideoTypeException,
  VideoAccessDeniedException,
  VideoNotFoundException,
  VideoPartOutOfRangeException,
  VideoProcessingUnavailableException,
  VideoTooLargeException,
  VideoUploadClosedException,
  VideoUploadExpiredException,
  VideoUploadIncompleteException,
} from '../common/exceptions/domain.exception';
import { VIDEO_FAILURE_REASON, VideoStatus } from './videos.constants';
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

const ownedVideo = (overrides: Record<string, unknown> = {}) => ({
  id: 'video-id',
  slug: 'abcdefghijk',
  status: VideoStatus.DRAFT,
  storage_key: 'videos/video-id/original.mp4',
  upload_id: 'upload',
  size_bytes: 100 * MIB,
  channel: { user_id: USER_ID },
  ...overrides,
});

describe('VideosService', () => {
  let queryBuilder: Record<string, jest.Mock>;
  let repository: Record<string, jest.Mock>;
  let channels: Record<string, jest.Mock>;
  let storage: Record<string, jest.Mock>;
  let queue: Record<string, jest.Mock>;
  let service: VideosService;

  beforeEach(() => {
    queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(ownedVideo()),
    };
    repository = {
      create: jest.fn((data) => data),
      save: jest.fn(async (video) => ({
        status: VideoStatus.DRAFT,
        ...video,
      })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn(),
      existsBy: jest.fn().mockResolvedValue(false),
      createQueryBuilder: jest.fn(() => queryBuilder),
    };
    channels = { findByUserId: jest.fn().mockResolvedValue({ id: 'channel' }) };
    storage = {
      createMultipartUpload: jest.fn().mockResolvedValue('upload'),
      presignUploadPart: jest.fn().mockResolvedValue('http://signed'),
      listParts: jest.fn().mockResolvedValue([]),
      completeMultipartUpload: jest.fn(),
      abortMultipartUpload: jest.fn(),
    };
    queue = { enqueueProcessing: jest.fn() };
    service = new VideosService(
      repository as any,
      channels as any,
      storage as any,
      queue as any,
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
        queue as any,
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

  describe('signUploadParts', () => {
    it('should sign one URL per requested part', async () => {
      queryBuilder.getOne.mockResolvedValue(
        ownedVideo({ size_bytes: 100 * MIB }),
      );

      const result = await service.signUploadParts(USER_ID, 'slug', [1, 2]);

      expect(result.parts).toEqual([
        { part_number: 1, url: 'http://signed' },
        { part_number: 2, url: 'http://signed' },
      ]);
      expect(result.expires_in).toBe(3600);
    });

    it('should reject a part beyond the declared file', async () => {
      await expect(
        service.signUploadParts(USER_ID, 'slug', [3]),
      ).rejects.toThrow(VideoPartOutOfRangeException);
    });

    it('should reject an unknown video', async () => {
      queryBuilder.getOne.mockResolvedValue(null);

      await expect(
        service.signUploadParts(USER_ID, 'slug', [1]),
      ).rejects.toThrow(VideoNotFoundException);
    });

    it('should reject a video owned by another user', async () => {
      await expect(
        service.signUploadParts('other-user', 'slug', [1]),
      ).rejects.toThrow(VideoAccessDeniedException);
    });

    it('should reject a video that left the draft status', async () => {
      queryBuilder.getOne.mockResolvedValue(
        ownedVideo({ status: VideoStatus.PROCESSING }),
      );

      await expect(
        service.signUploadParts(USER_ID, 'slug', [1]),
      ).rejects.toThrow(VideoUploadClosedException);
    });
  });

  describe('completeUpload', () => {
    const parts = [{ part_number: 1, etag: '"a"' }];

    beforeEach(() => {
      storage.listParts.mockResolvedValue([
        { part_number: 1, etag: '"a"', size_bytes: 100 * MIB },
      ]);
    });

    it('should complete the multipart and queue the video', async () => {
      const result = await service.completeUpload(USER_ID, 'slug', parts);

      expect(result).toEqual({
        slug: 'abcdefghijk',
        status: VideoStatus.PROCESSING,
      });
      expect(queue.enqueueProcessing).toHaveBeenCalledWith('video-id');
    });

    it('should reject parts that do not reach the declared size', async () => {
      storage.listParts.mockResolvedValue([
        { part_number: 1, etag: '"a"', size_bytes: MIB },
      ]);

      await expect(
        service.completeUpload(USER_ID, 'slug', parts),
      ).rejects.toThrow(VideoUploadIncompleteException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('should reject an ETag the storage does not know', async () => {
      await expect(
        service.completeUpload(USER_ID, 'slug', [
          { part_number: 1, etag: '"b"' },
        ]),
      ).rejects.toThrow(VideoUploadIncompleteException);
    });

    it('should report the upload as closed when losing the transition', async () => {
      repository.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.completeUpload(USER_ID, 'slug', parts),
      ).rejects.toThrow(VideoUploadClosedException);
      expect(storage.completeMultipartUpload).not.toHaveBeenCalled();
    });

    it('should report the upload as closed when a concurrent completion removed it', async () => {
      storage.listParts.mockRejectedValue(new VideoUploadExpiredException());
      repository.existsBy.mockResolvedValue(true);

      await expect(
        service.completeUpload(USER_ID, 'slug', parts),
      ).rejects.toThrow(VideoUploadClosedException);
    });

    it('should report an upload the storage lost as expired', async () => {
      storage.listParts.mockRejectedValue(new VideoUploadExpiredException());

      await expect(
        service.completeUpload(USER_ID, 'slug', parts),
      ).rejects.toThrow(VideoUploadExpiredException);
    });

    it('should return to draft when the storage refuses the completion', async () => {
      storage.completeMultipartUpload.mockRejectedValue(new Error('storage'));

      await expect(
        service.completeUpload(USER_ID, 'slug', parts),
      ).rejects.toThrow('storage');
      expect(repository.update).toHaveBeenLastCalledWith(
        { id: 'video-id', status: VideoStatus.PROCESSING },
        { status: VideoStatus.DRAFT },
      );
    });

    it('should fail the video when the queue is unavailable', async () => {
      queue.enqueueProcessing.mockRejectedValue(new Error('redis'));

      await expect(
        service.completeUpload(USER_ID, 'slug', parts),
      ).rejects.toThrow(VideoProcessingUnavailableException);
      expect(repository.update).toHaveBeenLastCalledWith('video-id', {
        status: VideoStatus.FAILED,
        failure_reason: VIDEO_FAILURE_REASON.ENQUEUE_FAILED,
      });
    });
  });

  describe('cancelUpload', () => {
    it('should abort the multipart and remove the draft', async () => {
      await service.cancelUpload(USER_ID, 'slug');

      expect(storage.abortMultipartUpload).toHaveBeenCalled();
      expect(repository.delete).toHaveBeenCalledWith({
        id: 'video-id',
        status: VideoStatus.DRAFT,
      });
    });

    it('should remove the draft when the storage forgot the upload', async () => {
      storage.abortMultipartUpload.mockRejectedValue(
        new VideoUploadExpiredException(),
      );

      await service.cancelUpload(USER_ID, 'slug');

      expect(repository.delete).toHaveBeenCalled();
    });

    it('should keep the draft when the abort fails for another reason', async () => {
      storage.abortMultipartUpload.mockRejectedValue(new Error('storage'));

      await expect(service.cancelUpload(USER_ID, 'slug')).rejects.toThrow(
        'storage',
      );
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('should refuse to cancel a video in processing', async () => {
      queryBuilder.getOne.mockResolvedValue(
        ownedVideo({ status: VideoStatus.PROCESSING }),
      );

      await expect(service.cancelUpload(USER_ID, 'slug')).rejects.toThrow(
        VideoUploadClosedException,
      );
    });
  });
});
