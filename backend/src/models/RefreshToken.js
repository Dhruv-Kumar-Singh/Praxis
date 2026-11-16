/**
 * @collection refresh_tokens
 * Stores refresh-token metadata for JWT rotation with family-based revocation.
 *
 * Key fields:
 *   userId      - Owner of the token (ref: users)
 *   familyId    - Rotation family; all tokens in a family are invalidated on reuse
 *   tokenHash   - SHA-256 hash of the raw refresh token (never store raw)
 *   expiresAt   - Absolute expiry; MongoDB TTL index auto-deletes expired docs
 *   revokedAt   - Set when the token is explicitly revoked (logout / reuse detected)
 *
 * Indexes:
 *   userId          - Look up all tokens for a user (logout all sessions)
 *   expiresAt (TTL) - Automatic deletion of expired tokens by MongoDB
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const refreshTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    familyId: {
      type: String,
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // TTL index — MongoDB removes doc when expiresAt is reached
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'refresh_tokens',
    timestamps: { createdAt: true, updatedAt: false },
  }
);

const RefreshToken = model('RefreshToken', refreshTokenSchema);
export default RefreshToken;
