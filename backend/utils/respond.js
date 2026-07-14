function success(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function error(res, status, code, message, details) {
  const body = { success: false, error: { code, message } };
  if (details) body.error.details = details;
  return res.status(status).json(body);
}

module.exports = { success, error };
