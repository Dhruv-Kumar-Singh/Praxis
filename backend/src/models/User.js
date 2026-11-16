/**
 * @collection users
 * Stores registered users with hashed passwords, roles, and preferences.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const prefsSchema = new Schema(
  {
    emailNotifications: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      default: '',
    },
    role: {
      type: String,
      enum: ['candidate', 'recruiter', 'interviewer', 'admin'],
      default: 'candidate',
      required: true,
    },
    prefs: {
      type: prefsSchema,
      default: () => ({}),
    },
  },
  {
    collection: 'users',
    timestamps: true, // adds createdAt and updatedAt
  }
);

const User = model('User', userSchema);
export default User;
