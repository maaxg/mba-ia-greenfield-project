export interface UploadedPart {
  part_number: number;
  etag: string;
  size_bytes: number;
}

export interface CompletedPart {
  part_number: number;
  etag: string;
}

export interface PresignReadOptions {
  contentType?: string;
  downloadFilename?: string;
}
