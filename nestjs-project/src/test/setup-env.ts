// Tests run inside the Compose network, where the public endpoint host is unreachable.
process.env.S3_PUBLIC_ENDPOINT = process.env.S3_ENDPOINT;
