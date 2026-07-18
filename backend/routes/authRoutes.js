const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { readDB, withDB } = require('../utils/db');
const { signToken } = require('../middleware/auth');
const { success, error } = require('../utils/respond');

const router = express.Router();
const SALT_ROUNDS = 10;

function publicResponder(responder) {
  const { passwordHash, ...rest } = responder;
  return rest;
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, organization, phone } = req.body || {};

    if (!name || !email || !password || !organization || !phone) {
      return error(res, 400, 'VALIDATION_ERROR', 'Name, email, password, organization and phone are all required.');
    }
    if (typeof password !== 'string') {
      return error(res, 400, 'VALIDATION_ERROR', 'Password must be a string.');
    }
    if (password.length < 8) {
      return error(res, 400, 'VALIDATION_ERROR', 'Password must be at least 8 characters.');
    }
    if (typeof email !== 'string') {
      return error(res, 400, 'VALIDATION_ERROR', 'Email must be a string.');
    }

    // The existing-email check and the eventual write both need to happen
    // inside the same serialized DB transaction: bcrypt.hash below yields
    // the event loop, and without this, two concurrent registrations with
    // the same email could both pass the check before either writes.
    const outcome = await withDB(async (db) => {
      const existing = db.responders.find((r) => r.email.toLowerCase() === email.toLowerCase());
      if (existing) {
        return { conflict: true };
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const responder = {
        id: `responder_${crypto.randomUUID()}`,
        name,
        email,
        organization,
        phone,
        passwordHash,
        createdAt: new Date().toISOString(),
      };
      db.responders.push(responder);
      return { responder };
    });

    if (outcome.conflict) {
      return error(res, 409, 'EMAIL_TAKEN', 'An account with this email already exists.');
    }

    const token = signToken({ id: outcome.responder.id, email: outcome.responder.email });
    return success(res, { token, responder: publicResponder(outcome.responder) }, 201);
  } catch (err) {
    console.error('Error in /api/auth/register:', err);
    return error(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return error(res, 400, 'VALIDATION_ERROR', 'Email and password are required.');
    }
    if (typeof email !== 'string' || typeof password !== 'string') {
      return error(res, 400, 'VALIDATION_ERROR', 'Email and password must be strings.');
    }

    const db = readDB();
    const responder = db.responders.find((r) => r.email.toLowerCase() === email.toLowerCase());
    if (!responder) {
      return error(res, 401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
    }

    const valid = await bcrypt.compare(password, responder.passwordHash);
    if (!valid) {
      return error(res, 401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
    }

    const token = signToken({ id: responder.id, email: responder.email });
    return success(res, { token, responder: publicResponder(responder) });
  } catch (err) {
    console.error('Error in /api/auth/login:', err);
    return error(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }
});

module.exports = router;
