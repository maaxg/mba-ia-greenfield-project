export function videoOriginalKey(videoId: string, extension: string): string {
  return `videos/${videoId}/original${extension}`;
}

export function videoThumbnailKey(videoId: string): string {
  return `videos/${videoId}/thumbnail.jpg`;
}
