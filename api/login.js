const {
  createSession,
  json,
  loadUsersWorkbook,
  normalizeUser,
  readRequestBody,
  verifyPassword,
} = require("./_usersStore");

module.exports = async function login(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  try {
    const body = await readRequestBody(req);
    const identifier = String(body.identifier || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!identifier || !password) {
      return json(res, 400, { error: "Enter your username/email and password." });
    }

    const { rows } = await loadUsersWorkbook();
    const user = rows
      .map(normalizeUser)
      .find((item) => item.email === identifier || item.username.toLowerCase() === identifier);

    if (!user || !verifyPassword(password, user.password)) {
      return json(res, 401, { error: "Invalid username/email or password." });
    }

    return json(res, 200, {
      message: "Logged in.",
      session: createSession(user),
    });
  } catch (error) {
    return json(res, 500, { error: error.message || "Could not log in." });
  }
};
