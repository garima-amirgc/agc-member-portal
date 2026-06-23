const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });
const express = require("express");
const cors = require("cors");
const { ROLES } = require("./config/constants");
const { EMAIL_TEMPLATE_VERSION, isEmailConfigured, verifySmtpConnection } = require("./services/email.service");
const inviteSvc = require("./services/invite.service");

const app = express();
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
app.get("/health", (_, res) =>
  res.json({
    ok: true,
    git_commit: process.env.RENDER_GIT_COMMIT || null,
    email_template_version: EMAIL_TEMPLATE_VERSION,
    email_configured: isEmailConfigured(),
    invite_links_base_url: inviteSvc.publicAppBaseUrl(),
  })
);

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
  const employeeOfMonthRoutes = require("./routes/employeeOfMonth.routes");
  const leadershipUpdatesRoutes = require("./routes/leadershipUpdates.routes");
  const newHiresRoutes = require("./routes/newHires.routes");
  const customerWinsRoutes = require("./routes/customerWins.routes");
  const communityInvolvementRoutes = require("./routes/communityInvolvement.routes");
  const companyContentRoutes = require("./routes/companyContent.routes");
  const homeSpotlightRoutes = require("./routes/homeSpotlight.routes");
  const birthdaysRoutes = require("./routes/birthdays.routes");
  const ticketsRoutes = require("./routes/tickets.routes");
  const avatarRoutes = require("./routes/avatar.routes");
  const leaveRequestsRoutes = require("./routes/leave-requests.routes");
  const resourcesRoutes = require("./routes/resources.routes");
  const reportsRoutes = require("./routes/reports.routes");
  const adminRoutes = require("./routes/admin.routes");
  const adminPollsRoutes = require("./routes/adminPolls.routes");
  const engagementCalendarRoutes = require("./routes/engagement-calendar.routes");
  const calendarRoutes = require("./routes/calendar.routes");
  const pollsRoutes = require("./routes/polls.routes");
  const helpRoutes = require("./routes/help.routes");
  const searchRoutes = require("./routes/search.routes");
  const { authRequired } = require("./middleware/auth");
  const leaveSvc = require("./services/leaveRequests.service");
  const managerTeamSvc = require("./services/managerTeam.service");
  const { getTrainingSummary } = require("./services/trainingCompletion.service");
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
  const { hasDirectReports } = require("./services/supervisor.service");

  async function leaveManagerDecideHandler(req, res) {
    if (!(await hasDirectReports(req.user.id))) return res.status(403).json({ message: "Forbidden" });
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
  async function managerTeamOverviewHandler(req, res) {
    if (!(await hasDirectReports(req.user.id))) return res.status(403).json({ message: "Forbidden" });
    (async () => {
      try {
        const team = await managerTeamSvc.getTeamOverview(req.user.id);
        const includeSelf =
          req.query.include_self_training === "true" || req.query.include_self_training === "1";
        if (!includeSelf) return res.json(team);
        const self_training_summary = await getTrainingSummary(req.user.id);
        return res.json({ team, self_training_summary });
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

  const routeMounts = [
    ["/auth", authRoutes],
    ["/users", userRoutes],
    ["/courses", courseRoutes],
    ["/lessons", lessonRoutes],
    ["/assignments", assignmentRoutes],
    ["/notifications", notificationsRoutes],
    ["/upcoming", upcomingRoutes],
    ["/employee-of-month", employeeOfMonthRoutes],
    ["/leadership-updates", leadershipUpdatesRoutes],
    ["/new-hires", newHiresRoutes],
    ["/customer-wins", customerWinsRoutes],
    ["/community-involvement", communityInvolvementRoutes],
    ["/company-content", companyContentRoutes],
    ["/home-spotlight", homeSpotlightRoutes],
    ["/birthdays", birthdaysRoutes],
    ["/tickets", ticketsRoutes],
    ["/upload", uploadRoutes],
    ["/avatar", avatarRoutes],
    ["/leave-requests", leaveRequestsRoutes],
    ["/resources", resourcesRoutes],
    ["/reports", reportsRoutes],
    ["/admin", adminRoutes],
    ["/admin", adminPollsRoutes],
    ["/engagement-calendar", engagementCalendarRoutes],
    ["/calendar", calendarRoutes],
    ["/polls", pollsRoutes],
    ["/help", helpRoutes],
    ["/search", searchRoutes],
  ];

  function mountRoutes(router) {
    for (const [mountPath, routeModule] of routeMounts) {
      router.use(mountPath, routeModule);
    }
  }

  const api = express.Router();
  mountRoutes(api);
  app.use("/api", api);
  mountRoutes(app);

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
          `Upload storage: DigitalOcean Spaces (bucket: ${process.env.DO_SPACES_BUCKET}, region: ${process.env.DO_SPACES_REGION})`
        );
      else if (obs.requiresDigitalOceanSpacesForUploads())
        console.warn("Upload storage: DigitalOcean Spaces is required in this environment but is not configured.");
      else if (obs.isR2Enabled()) console.log("Upload storage: Cloudflare R2");
      else console.log(`Upload storage: local disk (${uploadsDir})`);
    } catch {
    }
    console.log(
      `Leave API ready: POST /auth/leave-request and POST /api/auth/leave-request (if you see 404, an old Node process may still be bound to port ${PORT})`
    );
    console.log(
      `Manager team: GET /api/auth/manager-team-overview and GET /api/users/manager/team-overview (same for /auth/... and /users/... without /api)`
    );
    void verifySmtpConnection().catch(() => {});
    try {
      const inviteSvc = require("./services/invite.service");
      const appUrl = inviteSvc.publicAppBaseUrl();
      const explicit = (process.env.APP_BASE_URL || process.env.FRONTEND_URL || "").trim();
      console.log(`Email / invite links base URL: ${appUrl}`);
      if ((process.env.RENDER || process.env.NODE_ENV === "production") && !explicit) {
        console.warn(
          "[APP_BASE_URL] Set APP_BASE_URL on this API service (e.g. https://memberportal.amirgc.com) so invite and reset links use your custom domain, not *.onrender.com."
        );
      }
    } catch {
    }
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
