async function main() {
  const base = "http://localhost:5000";
  const adminEmail = "admin@company.com";
  const adminPassword = "admin123";

  const empEmail = "employee-test@company.com";
  const empPassword = "Employee123!";

  const loginAdminRes = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  const loginAdminJson = await loginAdminRes.json();
  if (!loginAdminRes.ok) {
    console.error("Admin login failed", loginAdminRes.status, loginAdminJson);
    process.exit(1);
  }

  const adminToken = String(loginAdminJson.token || "");
  const registerRes = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: "Employee Test",
      email: empEmail,
      password: empPassword,
      role: "Employee",
      business_unit: "AGC",
      manager_id: null,
    }),
  });

  // 201 created, or 400 if already exists (either is fine for our test).
  if (!(registerRes.status === 201 || registerRes.status === 400)) {
    console.error("Register unexpected", registerRes.status, await registerRes.text());
    process.exit(1);
  }

  const loginEmpRes = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: empEmail, password: empPassword }),
  });
  const loginEmpJson = await loginEmpRes.json();
  if (!loginEmpRes.ok) {
    console.error("Employee login failed", loginEmpRes.status, loginEmpJson);
    process.exit(1);
  }

  const empToken = String(loginEmpJson.token || "");
  const feedRes = await fetch(`${base}/upcoming/feed`, {
    headers: { Authorization: `Bearer ${empToken}` },
  });
  const feedJson = await feedRes.json();
  console.log(
    JSON.stringify(
      {
        register_status: registerRes.status,
        employee_role: loginEmpJson?.user?.role,
        employee_bu: loginEmpJson?.user?.business_unit,
        feed_status: feedRes.status,
        feed_count: Array.isArray(feedJson) ? feedJson.length : null,
        feed_sample: Array.isArray(feedJson) ? feedJson.slice(0, 3) : feedJson,
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

