import test, { describe } from "node:test";
import assert from "node:assert/strict";

describe("OAuth Token Encryption", () => {
  let encryptToken: (token: string) => string;
  let decryptToken: (encrypted: string) => string;
  const origKey = process.env.OAUTH_ENCRYPTION_KEY;

  test.before(async () => {
    process.env.OAUTH_ENCRYPTION_KEY = "test_secret_key_for_encryption";
    const oauth = await import("./oauth");
    encryptToken = oauth.encryptToken;
    decryptToken = oauth.decryptToken;
  });

  test.after(() => {
    if (origKey !== undefined) {
      process.env.OAUTH_ENCRYPTION_KEY = origKey;
    } else {
      delete process.env.OAUTH_ENCRYPTION_KEY;
    }
  });

  test("encrypts and decrypts tokens", () => {
    const original = "test_access_token_12345";
    const encrypted = encryptToken(original);
    assert.notEqual(encrypted, original);
    const decrypted = decryptToken(encrypted);
    assert.equal(decrypted, original);
  });

  test("generates unique encrypted values", () => {
    const token = "same_token";
    const enc1 = encryptToken(token);
    const enc2 = encryptToken(token);
    assert.notEqual(enc1, enc2); // Different IVs
    assert.equal(decryptToken(enc1), token);
    assert.equal(decryptToken(enc2), token);
  });
});

describe("OAuth State Management", () => {
  let generateOAuthState: (provider: string) => { state: string; authUrl: string };
  let validateOAuthState: (state: string) => { provider: string } | undefined;
  const origRedditClientId = process.env.REDDIT_CLIENT_ID;
  const origXClientId = process.env.X_CLIENT_ID;

  test.before(async () => {
    process.env.REDDIT_CLIENT_ID = "dummy_reddit_client_id";
    process.env.X_CLIENT_ID = "dummy_x_client_id";
    const oauth = await import("./oauth");
    generateOAuthState = oauth.generateOAuthState;
    validateOAuthState = oauth.validateOAuthState;
  });

  test.after(() => {
    if (origRedditClientId !== undefined) {
      process.env.REDDIT_CLIENT_ID = origRedditClientId;
    } else {
      delete process.env.REDDIT_CLIENT_ID;
    }
    if (origXClientId !== undefined) {
      process.env.X_CLIENT_ID = origXClientId;
    } else {
      delete process.env.X_CLIENT_ID;
    }
  });

  test("generates and validates state", () => {
    const { state } = generateOAuthState("reddit");
    const validated = validateOAuthState(state);
    assert.ok(validated);
    assert.equal(validated.provider, "reddit");
  });

  test("consumes state on validation", () => {
    const { state } = generateOAuthState("x");
    validateOAuthState(state);
    const second = validateOAuthState(state);
    assert.equal(second, undefined); // Already consumed
  });

  test("rejects invalid state", () => {
    const result = validateOAuthState("invalid_state");
    assert.equal(result, undefined);
  });
});
