const express = require('express');
const bcrypt = require('bcryptjs');
const { readDB, writeDB } = require('../utils/db');
const { signToken } = require('../middleware/auth');
const { success, error } = require('../utils/respond');

const router = express.Router();
const SALT_ROUNDS = 10;

function publicResponder(responder) {
  const { passwordHash, ...rest } = responder;
  return rest;
}

router.post('/register', async (req, res) => {
  const { name, email, password, organization, phone } = req.body || {};

  if (!name || !email || !password || !organization || !phone) {
    return error(res, 400, 'VALIDATION_ERROR', 'Name, email, password, organization and phone are all required.');
  }
  if (password.length < 8) {
    return error(res, 400, 'VALIDATION_ERROR', 'Password must be at least 8 characters.');
  }

  const db = readDB();
  const existing = db.responders.find((r) => r.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return error(res, 409, 'EMAIL_TAKEN', 'An account with this email already exists.');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const responder = {
    id: `responder_${Date.now()}`,
    name,
    email,
    organization,
    phone,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  db.responders.push(responder);
  writeDB(db);

  const token = signToken({ id: responder.id, email: responder.email });
  return success(res, { token, responder: publicResponder(responder) }, 201);
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return error(res, 400, 'VALIDATION_ERROR', 'Email and password are required.');
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
});

module.exports = router;
