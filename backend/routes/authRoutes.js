const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { getResponderByEmail, createResponder } = require('../utils/db');
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

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    // createResponder() relies on the UNIQUE constraint on responders.email
    // to make this atomic at the database level - two concurrent
    // registrations with the same email can't both succeed, unlike the
    // flat-file version's separate existence check before insert needing a
    // JS-side write queue to avoid the same race.
    const outcome = await createResponder({
      id: `responder_${crypto.randomUUID()}`,
      name,
      email,
      organization,
      phone,
      passwordHash,
      createdAt: new Date().toISOString(),
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

    const responder = await getResponderByEmail(email);
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
