'use strict';

process.env.SECRET = 'TOKEN_SECURITY_TEST_SECRET';

const jwt = require('jsonwebtoken');
const { db, users } = require('../../../src/auth/models');

describe('Configurable token security', () => {
  let user;

  beforeAll(async () => {
    await db.sync();
    user = await users.create({
      username: 'security-test-user',
      password: 'test-password',
    });
  });

  beforeEach(() => {
    process.env.JWT_EXPIRATION_ENABLED = 'true';
    process.env.JWT_CONTEXT_ENABLED = 'true';
    process.env.JWT_ISSUER = 'bearer-auth';
    process.env.JWT_AUDIENCE = 'bearer-auth-client';
  });

  afterAll(async () => {
    await db.close();
  });

  function signToken(overrides = {}) {
    return jwt.sign(
      { username: user.username },
      process.env.SECRET,
      {
        algorithm: 'HS256',
        expiresIn: '15m',
        issuer: 'bearer-auth',
        audience: 'bearer-auth-client',
        ...overrides,
      }
    );
  }

  test('issues a valid token with a 15-minute lifetime', async () => {
    const token = user.token;
    const payload = jwt.verify(token, process.env.SECRET);

    expect(payload.exp - payload.iat).toBe(900);
    expect(payload.iss).toBe('bearer-auth');
    expect(payload.aud).toBe('bearer-auth-client');

    const authenticated = await users.authenticateToken(token);
    expect(authenticated.id).toBe(user.id);
  });

  test('rejects an expired token', async () => {
    const token = signToken({ expiresIn: -1 });

    await expect(users.authenticateToken(token)).rejects.toThrow();
  });

  test('requires expiration when expiration protection is enabled', async () => {
    process.env.JWT_EXPIRATION_ENABLED = 'false';
    const token = user.token;
    expect(jwt.decode(token).exp).toBeUndefined();

    process.env.JWT_EXPIRATION_ENABLED = 'true';

    await expect(users.authenticateToken(token)).rejects.toThrow();
  });

  test.each([
    ['issuer', 'another-server'],
    ['audience', 'another-application'],
  ])('rejects an incorrect %s', async (option, value) => {
    const token = signToken({ [option]: value });

    await expect(users.authenticateToken(token)).rejects.toThrow();
  });

  test('supports disabling both optional protections', async () => {
    process.env.JWT_EXPIRATION_ENABLED = 'false';
    process.env.JWT_CONTEXT_ENABLED = 'false';

    const token = user.token;
    const payload = jwt.verify(token, process.env.SECRET);

    expect(payload.exp).toBeUndefined();
    expect(payload.iss).toBeUndefined();
    expect(payload.aud).toBeUndefined();

    const authenticated = await users.authenticateToken(token);
    expect(authenticated.id).toBe(user.id);
  });
});