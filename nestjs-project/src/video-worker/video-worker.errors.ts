export class InvalidVideoFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidVideoFileError';
  }
}
