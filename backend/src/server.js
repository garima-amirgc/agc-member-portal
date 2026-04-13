const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });
const express = require("express");
const cors = require("cors");
const { ROLES } = require("./config/constants");

const app = express();
/** Static site (e.g. *-web.onrender.com) and API on another host — allow browser + Authorization preflight */
app.use(
  cors({
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    maxAge: 86400,
  })
);
app.use(express.json());

const backendRootDir = path.join(__dirname, "..");
const uploadsDir = path.resolve(
  backendRootDir,
  String(process.env.UPLOAD_DIR || "uploads").replace(/^\.\/+/, "")
);
app.use("/uploads", express.static(uploadsDir));

app.get("/", (_, res) =>
  res.json({
    name: "AGC LMS API",
    message: "Use the React app for the UI. This server exposes JSON APIs only.",
    health: "/health",
    docs: "See README.md in the project root for routes.",
  })
);
app.get("/health", (_, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
});

const PORT = process.env.PORT || 5000;

async function start() {
  const dbModule = require("./config/db");
  await dbModule.initDb();
  const { db, dbPath, isPostgres } = dbModule;

  const userDeptSvc = require("./services/userDepartments.service");

  const authRoutes = require("./routes/auth.routes");
  const userRoutes = require("./routes/users.routes");
  const courseRoutes = require("./routes/courses.routes");
  const lessonRoutes = require("./routes/lessons.routes");
  const assignmentRoutes = require("./routes/assignments.routes");
  const uploadRoutes = require("./routes/upload.routes");
  const notificationsRoutes = require("./routes/notifications.routes");
  const upcomingRoutes = require("./routes/upcoming.routes");
  const ticketsRoutes = require("./routes/tickets.routes");
  const avatarRoutes = require("./routes/avatar.routes");
  const leaveRequestsRoutes = require("./routes/leave-requests.routes");
  const resourcesRoutes = require("./routes/resources.routes");
  const { authRequired } = require("./middleware/auth");
  const leaveSvc = require("./services/leaveRequests.service");
  const managerTeamSvc = require("./services/managerTeam.service");
  const { managerLeaveInboxWithTeam } = require("./handlers/managerInbox.handler");

  function leaveSubmitHandler(req, res) {
    (async () => {
      try {
        const out = await leaveSvc.submitLeaveRequest(req.user.id, req.body);
        return res.status(201).json(out);
      } catch (e) {
        const code = e.statusCode || 500;
        return res.status(code).json({ message: e.message || "Server error" });
      }
    })().catch((e) => res.status(500).json({ message: e.message || "Server error" }));
  }
  function leaveListMineHandler(req, res) {
    (async () => {
      try {
        return res.json(await leaveSvc.listLeaveRequestsForEmployee(req.user.id));
      } catch (e) {
        return res.status(500).json({ message: e.message || "Server error" });
      }
    })().catch((e) => res.status(500).json({ message: e.message || "Server error" }));
  }
  function leaveManagerDecideHandler(req, res) {
    if (req.user.role !== ROLES.MANAGER) return res.status(403).json({ message: "Forbidden" });
    (async () => {
      try {
        const out = await leaveSvc.decideLeaveRequest(req.user.id, req.params.id, req.body?.status);
        return res.json(out);
      } catch (e) {
        const code = e.statusCode || 500;
        return res.status(code).json({ message: e.message || "Server error" });
      }
    })().catch((e) => res.status(500).json({ message: e.message || "Server error" }));
  }
  function managerTeamOverviewHandler(req, res) {
    if (req.user.role !== ROLES.MANAGER) return res.status(403).json({ message: "Forbidden" });
    (async () => {
      try {
        return res.json(await managerTeamSvc.getTeamOverview(req.user.id));
      } catch (e) {
        return res.status(500).json({ message: e.message || "Server error" });
      }
    })().catch((e) => res.status(500).json({ message: e.message || "Server error" }));
  }

  app.post("/api/auth/leave-request", authRequired, leaveSubmitHandler);
  app.post("/auth/leave-request", authRequired, leaveSubmitHandler);
  app.get("/api/auth/my-leave-requests", authRequired, leaveListMineHandler);
  app.get("/auth/my-leave-requests", authRequired, leaveListMineHandler);
  app.get("/api/auth/manager-leave-inbox", authRequired, managerLeaveInboxWithTeam);
  app.get("/auth/manager-leave-inbox", authRequired, managerLeaveInboxWithTeam);
  app.get("/api/users/manager/leave-inbox", authRequired, managerLeaveInboxWithTeam);
  app.get("/users/manager/leave-inbox", authRequired, managerLeaveInboxWithTeam);
  app.patch("/api/auth/manager-leave-requests/:id", authRequired, leaveManagerDecideHandler);
  app.patch("/auth/manager-leave-requests/:id", authRequired, leaveManagerDecideHandler);
  app.get("/api/auth/manager-team-overview", authRequired, managerTeamOverviewHandler);
  app.get("/auth/manager-team-overview", authRequired, managerTeamOverviewHandler);
  app.get("/api/users/manager/team-overview", authRequired, managerTeamOverviewHandler);
  app.get("/users/manager/team-overview", authRequired, managerTeamOverviewHandler);

  const api = express.Router();
  api.use("/auth", authRoutes);
  api.use("/users", userRoutes);
  api.use("/courses", courseRoutes);
  api.use("/lessons", lessonRoutes);
  api.use("/assignments", assignmentRoutes);
  api.use("/notifications", notificationsRoutes);
  api.use("/upcoming", upcomingRoutes);
  api.use("/tickets", ticketsRoutes);
  api.use("/upload", uploadRoutes);
  api.use("/avatar", avatarRoutes);
  api.use("/leave-requests", leaveRequestsRoutes);
  api.use("/resources", resourcesRoutes);
  app.use("/api", api);

  app.use("/auth", authRoutes);
  app.use("/users", userRoutes);
  app.use("/courses", courseRoutes);
  app.use("/lessons", lessonRoutes);
  app.use("/assignments", assignmentRoutes);
  app.use("/notifications", notificationsRoutes);
  app.use("/upcoming", upcomingRoutes);
  app.use("/tickets", ticketsRoutes);
  app.use("/upload", uploadRoutes);
  app.use("/avatar", avatarRoutes);
  app.use("/leave-requests", leaveRequestsRoutes);
  app.use("/resources", resourcesRoutes);

  const seedAdminFlag = String(process.env.SEED_DEFAULT_ADMIN ?? "1").toLowerCase();
  const allowDefaultAdmin =
    seedAdminFlag === "1" || seedAdminFlag === "true" || seedAdminFlag === "yes";
  const adminExists = await db.prepare("SELECT id FROM users WHERE role='Admin' LIMIT 1").get();
  if (!adminExists && allowDefaultAdmin) {
    const bcrypt = require("bcryptjs");
    const ins = await db
      .prepare(
        "INSERT INTO users(name, email, password, role, business_unit, department) VALUES (?, ?, ?, 'Admin', 'AGC', 'IT')"
      )
      .run("Super Admin", "admin@company.com", bcrypt.hashSync("admin123", 10));
    await userDeptSvc.syncForUser(Number(ins.lastInsertRowid), ["IT"]);
    console.log("Seeded default admin: admin@company.com / admin123 (set SEED_DEFAULT_ADMIN=0 after you create a real admin)");
  } else if (!adminExists && !allowDefaultAdmin) {
    console.log("No Admin user and SEED_DEFAULT_ADMIN is disabled — create an admin via your process or SQL.");
  }

  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
    console.log(
      isPostgres
        ? "Database: PostgreSQL (DATABASE_URL)"
        : `SQLite database: ${dbPath}`
    );
    try {
      const obs = require("./services/objectStorage.service");
      if (obs.isSpacesEnabled())
        console.log(
          `Lesson video storage: DigitalOcean Spaces (bucket: ${process.env.DO_SPACES_BUCKET}, region: ${process.env.DO_SPACES_REGION})`
        );
      else if (obs.isR2Enabled()) console.log("Lesson video storage: Cloudflare R2");
      else console.log(`Lesson video storage: local disk (${uploadsDir})`);
    } catch {
      /* ignore */
    }
    console.log(
      `Leave API ready: POST /auth/leave-request and POST /api/auth/leave-request (if you see 404, an old Node process may still be bound to port ${PORT})`
    );
    console.log(
      `Manager team: GET /api/auth/manager-team-overview and GET /api/users/manager/team-overview (same for /auth/... and /users/... without /api)`
    );
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
