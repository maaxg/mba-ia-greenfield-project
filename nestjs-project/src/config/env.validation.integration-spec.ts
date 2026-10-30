import { envValidationSchema } from './env.validation';

const requiredEnv = {
  DB_USERNAME: 'user',
  DB_PASSWORD: 'pass',
  DB_NAME: 'db',
  JWT_SECRET: 'secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
};

const validate = (env: Record<string, string>) =>
  envValidationSchema.validate(
    { ...requiredEnv, ...env },
    { allowUnknown: true, abortEarly: false },
  );

describe('envValidationSchema — SWAGGER_ENABLED', () => {
  it('should reject SWAGGER_ENABLED with an invalid value', () => {
    const { error } = validate({ SWAGGER_ENABLED: 'invalid' });
    expect(error).toBeDefined();
    expect(error!.message).toContain('SWAGGER_ENABLED');
  });

  it('should accept SWAGGER_ENABLED=true', () => {
    const { error } = validate({ SWAGGER_ENABLED: 'true' });
    expect(error).toBeUndefined();
  });

  it('should accept SWAGGER_ENABLED=false', () => {
    const { error } = validate({ SWAGGER_ENABLED: 'false' });
    expect(error).toBeUndefined();
  });

  it('should apply default false when SWAGGER_ENABLED is not set', () => {
    const { value, error } = validate({});
    expect(error).toBeUndefined();
    expect(value.SWAGGER_ENABLED).toBe('false');
  });
});

describe('envValidationSchema — video infrastructure', () => {
  it('should default the upload limit to 10 GiB', () => {
    const { value, error } = validate({});
    expect(error).toBeUndefined();
    expect(value.VIDEO_MAX_SIZE_BYTES).toBe(10737418240);
  });

  it('should reject a part size below the S3 minimum of 5 MiB', () => {
    const { error } = validate({ VIDEO_PART_SIZE_BYTES: '1024' });
    expect(error!.message).toContain('VIDEO_PART_SIZE_BYTES');
  });

  it('should reject an invalid S3 endpoint', () => {
    const { error } = validate({ S3_ENDPOINT: 'not a url' });
    expect(error!.message).toContain('S3_ENDPOINT');
  });

  it('should reject an invalid Redis port', () => {
    const { error } = validate({ REDIS_PORT: '99999' });
    expect(error!.message).toContain('REDIS_PORT');
  });
});
