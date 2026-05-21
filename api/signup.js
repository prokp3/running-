const {
  createSession,
  hashPassword,
  json,
  loadUsersWorkbook,
  normalizeUser,
  readRequestBody,
  saveUsersWorkbook,
  validateSignup,
} = require("./_usersStore");

module.exports = async function signup(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  try {
    const body = await readRequestBody(req);
    const username = String(body.username || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const validationError = validateSignup({ username, email, password });

    if (validationError) {
      return json(res, 400, { error: validationError });
    }

    const { rows, sha } = await loadUsersWorkbook();
    const existingUsers = rows.map(normalizeUser);
    const duplicate = existingUsers.find(
      (user) => user.username.toLowerCase() === username.toLowerCase() || user.email === email
    );

    if (duplicate) {
      return json(res, 409, { error: "An account with that username or email already exists." });
    }

    const user = {
      username,
      email,
      password: hashPassword(password),
      "signup date/time": new Date().toISOString(),
    };

    await saveUsersWorkbook([...rows, user], sha);
    return json(res, 201, {
      message: "Account created.",
      session: createSession({ username, email }),
    });
  } catch (error) {
    return json(res, 500, { error: error.message || "Could not create account." });
  }
};
