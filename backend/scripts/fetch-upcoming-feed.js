async function main() {
  const base = "http://localhost:5000";

  const loginRes = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@company.com", password: "admin123" }),
  });
  const loginJson = await loginRes.json();
  if (!loginRes.ok) {
    console.error("Login failed", loginRes.status, loginJson);
    process.exit(1);
  }

  const token = String(loginJson.token || "");
  const feedRes = await fetch(`${base}/upcoming/feed`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const feedJson = await feedRes.json();
  console.log(
    JSON.stringify(
      {
        status: feedRes.status,
        count: Array.isArray(feedJson) ? feedJson.length : null,
        sample: Array.isArray(feedJson) ? feedJson.slice(0, 3) : feedJson,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

