export abstract class DomainException extends Error {
  constructor(
    public readonly errorCode: string,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class EmailAlreadyExistsException extends DomainException {
  constructor() {
    super('EMAIL_ALREADY_EXISTS', 409, 'Email is already registered');
  }
}

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super('INVALID_CREDENTIALS', 401, 'Invalid email or password');
  }
}

export class EmailNotConfirmedException extends DomainException {
  constructor() {
    super('EMAIL_NOT_CONFIRMED', 403, 'Email address has not been confirmed');
  }
}

export class InvalidTokenException extends DomainException {
  constructor() {
    super('INVALID_TOKEN', 401, 'Token is invalid');
  }
}

export class TokenExpiredException extends DomainException {
  constructor() {
    super('TOKEN_EXPIRED', 401, 'Token has expired');
  }
}

export class TokenReuseDetectedException extends DomainException {
  constructor() {
    super(
      'TOKEN_REUSE_DETECTED',
      401,
      'Token reuse detected — all sessions revoked',
    );
  }
}

export class ChannelNotFoundException extends DomainException {
  constructor() {
    super('CHANNEL_NOT_FOUND', 404, 'Channel not found');
  }
}

export class VideoNotFoundException extends DomainException {
  constructor() {
    super('VIDEO_NOT_FOUND', 404, 'Video not found');
  }
}

export class VideoAccessDeniedException extends DomainException {
  constructor() {
    super('VIDEO_ACCESS_DENIED', 403, 'You do not own this video');
  }
}

export class VideoTooLargeException extends DomainException {
  constructor() {
    super('VIDEO_TOO_LARGE', 413, 'Video exceeds the maximum allowed size');
  }
}

export class UnsupportedVideoTypeException extends DomainException {
  constructor() {
    super('UNSUPPORTED_VIDEO_TYPE', 415, 'Only video files are accepted');
  }
}

export class VideoPartOutOfRangeException extends DomainException {
  constructor() {
    super('VIDEO_PART_OUT_OF_RANGE', 400, 'Part number is out of range');
  }
}

export class VideoUploadClosedException extends DomainException {
  constructor() {
    super('VIDEO_UPLOAD_CLOSED', 409, 'Video upload is already closed');
  }
}

export class VideoUploadExpiredException extends DomainException {
  constructor() {
    super('VIDEO_UPLOAD_EXPIRED', 409, 'Video upload no longer exists');
  }
}

export class VideoUploadIncompleteException extends DomainException {
  constructor() {
    super(
      'VIDEO_UPLOAD_INCOMPLETE',
      422,
      'Uploaded parts do not match the declared file',
    );
  }
}

export class VideoProcessingUnavailableException extends DomainException {
  constructor() {
    super(
      'VIDEO_PROCESSING_UNAVAILABLE',
      503,
      'Video processing is temporarily unavailable',
    );
  }
}
