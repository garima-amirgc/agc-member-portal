const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.title = "AGC Member Portal — SLT Walkthrough";
pres.author = "AGC";

const NAVY    = "071F5C";
const BLUE    = "0B3EAF";
const GREEN   = "A7D344";
const WHITE   = "FFFFFF";
const LIGHT   = "EEF2FF";
const DARK_TXT = "0D1B3E";
const MED_TXT  = "2D3E6A";
const MUTED    = "6B7FA3";

const mkSh = () => ({ type: "outer", color: "000000", blur: 10, offset: 3, angle: 45, opacity: 0.10 });

// SLIDE 1 — TITLE
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  s.addShape(pres.shapes.OVAL, { x: 7.2, y: -1.8, w: 4.5, h: 4.5, fill: { color: BLUE, transparency: 65 }, line: { width: 0 } });
  s.addShape(pres.shapes.OVAL, { x: 8.5, y: -0.3, w: 2.2, h: 2.2, fill: { color: GREEN, transparency: 72 }, line: { width: 0 } });
  s.addShape(pres.shapes.OVAL, { x: -1.2, y: 3.8, w: 3.5, h: 3.5, fill: { color: BLUE, transparency: 72 }, line: { width: 0 } });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 1.05, w: 2.8, h: 0.38, fill: { color: GREEN }, line: { width: 0 }, rectRadius: 0.05 });
  s.addText("AMIR GROUP OF COMPANIES", { x: 0.6, y: 1.05, w: 2.8, h: 0.38, fontSize: 9, bold: true, color: NAVY, align: "center", valign: "middle", fontFace: "Calibri", margin: 0 });
  s.addText("AGC Member Portal", { x: 0.6, y: 1.6, w: 8.8, h: 1.5, fontSize: 50, bold: true, color: WHITE, fontFace: "Cambria", margin: 0 });
  s.addText("Senior Leadership Team Walkthrough", { x: 0.6, y: 3.25, w: 8.0, h: 0.7, fontSize: 22, color: GREEN, fontFace: "Calibri", italic: true, margin: 0 });
  s.addText("June 2026", { x: 0.6, y: 4.9, w: 3, h: 0.4, fontSize: 13, color: "8BA0CC", fontFace: "Calibri", margin: 0 });
  s.addNotes("Welcome the SLT team. This walkthrough covers every section of the AGC Member Portal. Live at memberportal.amirgc.com.");
}

// SLIDE 2 — PORTAL AT A GLANCE
{
  const s = pres.addSlide();
  s.background = { color: LIGHT };
  s.addText("Portal at a Glance", { x: 0.5, y: 0.32, w: 9, h: 0.65, fontSize: 28, bold: true, color: DARK_TXT, fontFace: "Cambria", margin: 0 });
  s.addText("One unified platform for every AGC employee — communication, learning, operations, and security.", { x: 0.5, y: 0.98, w: 9, h: 0.42, fontSize: 13, color: MUTED, fontFace: "Calibri", margin: 0 });
  const pillars = [
    { num: "01", title: "People & Communication", desc: "Company news, EOM, birthdays, new hires, leadership updates, customer wins, community.", badge: BLUE },
    { num: "02", title: "Learning & Development",  desc: "AGC University: structured courses, lessons, assignments, and facility-based access control.", badge: "0D7A54" },
    { num: "03", title: "Operations & HR",         desc: "Leave requests, team org chart, manager approval inbox, IT support tickets.", badge: "7B3FA0" },
    { num: "04", title: "Admin & Security",         desc: "Role-based access, scoped admin grants, Microsoft SSO, reports via Power BI.", badge: "B84D00" },
  ];
  const pos = [{ x: 0.4, y: 1.65 }, { x: 5.15, y: 1.65 }, { x: 0.4, y: 3.45 }, { x: 5.15, y: 3.45 }];
  const cw = 4.45, ch = 1.6;
  pillars.forEach((p, i) => {
    const { x, y } = pos[i];
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: cw, h: ch, fill: { color: WHITE }, line: { width: 0 }, rectRadius: 0.12, shadow: mkSh() });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x+0.22, y: y+0.22, w: 0.52, h: 0.52, fill: { color: p.badge }, line: { width: 0 }, rectRadius: 0.08 });
    s.addText(p.num,   { x: x+0.22, y: y+0.22, w: 0.52,      h: 0.52, fontSize: 13, bold: true, color: WHITE,    align: "center", valign: "middle", fontFace: "Calibri", margin: 0 });
    s.addText(p.title, { x: x+0.88, y: y+0.17, w: cw-1.08,   h: 0.42, fontSize: 13, bold: true, color: DARK_TXT, fontFace: "Calibri", margin: 0 });
    s.addText(p.desc,  { x: x+0.88, y: y+0.62, w: cw-1.08,   h: 0.85, fontSize: 11, color: MUTED, fontFace: "Calibri", margin: 0 });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.4, y: 5.12, w: 9.2, h: 0.33, fill: { color: BLUE }, line: { width: 0 }, rectRadius: 0.06 });
  s.addText("4 Business Units: AGC · AQM · SCF · ASP     |     Roles: Admin · Manager · Employee     |     Microsoft SSO     |     Hosted on Render", { x: 0.4, y: 5.12, w: 9.2, h: 0.33, fontSize: 10, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Calibri", margin: 0 });
  s.addNotes("The portal covers 4 pillars. Every employee logs in with Microsoft 365 credentials.");
}

// SLIDE 3 — DASHBOARD & HOME
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 3.9, h: 5.625, fill: { color: NAVY }, line: { width: 0 } });
  s.addShape(pres.shapes.OVAL, { x: 2.2, y: 3.5, w: 2.5, h: 2.5, fill: { color: BLUE, transparency: 70 }, line: { width: 0 } });
  s.addText("Dashboard\n& Home", { x: 0.3, y: 0.55, w: 3.3, h: 1.45, fontSize: 30, bold: true, color: WHITE, fontFace: "Cambria", margin: 0 });
  s.addText("The first thing every employee sees after logging in.", { x: 0.3, y: 2.1, w: 3.3, h: 0.9, fontSize: 13, color: GREEN, fontFace: "Calibri", italic: true, margin: 0 });
  const feats = [
    { lbl: "Quick Actions",             desc: "One-click shortcuts: Profile, Team, Reports, UofAGC, Upcoming, IT Support" },
    { lbl: "Company News Feed",         desc: "Live feed of EOM, Leadership, Community wins — each card links to a detail page" },
    { lbl: "Birthdays & Anniversaries", desc: "Today's celebrations shown in the sidebar with years of service" },
    { lbl: "Upcoming Events",           desc: "Next events from the calendar and upcoming list, shown in sidebar" },
    { lbl: "Welcome Banner",            desc: "Personalized greeting with the employee's name and photo" },
  ];
  feats.forEach((f, i) => {
    const y = 0.35 + i * 1.0;
    s.addShape(pres.shapes.OVAL, { x: 4.1, y: y+0.16, w: 0.2, h: 0.2, fill: { color: GREEN }, line: { width: 0 } });
    s.addText(f.lbl,  { x: 4.44, y,         w: 5.2, h: 0.32, fontSize: 13, bold: true, color: DARK_TXT, fontFace: "Calibri", margin: 0 });
    s.addText(f.desc, { x: 4.44, y: y+0.33, w: 5.2, h: 0.52, fontSize: 11, color: MUTED, fontFace: "Calibri", margin: 0 });
  });
  s.addNotes("Show the home dashboard. Scroll through quick actions, the news feed, then the sidebar.");
}

// SLIDE 4 — COMPANY NEWS & CELEBRATIONS
{
  const s = pres.addSlide();
  s.background = { color: LIGHT };
  s.addText("Company News & Celebrations", { x: 0.5, y: 0.3, w: 9, h: 0.62, fontSize: 28, bold: true, color: DARK_TXT, fontFace: "Cambria", margin: 0 });
  s.addText("Everything happening across AGC — surfaced automatically on the home feed.", { x: 0.5, y: 0.92, w: 9, h: 0.42, fontSize: 13, color: MUTED, fontFace: "Calibri", margin: 0 });
  const cards = [
    { title: "Employee of the Month",     desc: "Featured for that calendar month only. Click to see the winner profile and all past winners.", badge: BLUE },
    { title: "Leadership Updates",        desc: "Announcements from leadership across all business units with full detail pages.", badge: "0D7A54" },
    { title: "Customer Wins",             desc: "Celebrate client successes and milestones shared across the organization.", badge: "B84D00" },
    { title: "Community Involvement",     desc: "Highlight AGC's community impact and volunteer initiatives.", badge: "7B3FA0" },
    { title: "New Hires",                 desc: "Welcome new team members with dedicated cards on the dashboard.", badge: "057B8A" },
    { title: "Birthdays & Anniversaries", desc: "Today's birthdays and work anniversaries shown in the sidebar with year count.", badge: "9B2335" },
  ];
  const cw = 2.88, ch = 1.55;
  const positions = [
    { x: 0.38, y: 1.48 }, { x: 3.55, y: 1.48 }, { x: 6.72, y: 1.48 },
    { x: 0.38, y: 3.18 }, { x: 3.55, y: 3.18 }, { x: 6.72, y: 3.18 },
  ];
  cards.forEach((c, i) => {
    const { x, y } = positions[i];
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: cw, h: ch, fill: { color: WHITE }, line: { width: 0 }, rectRadius: 0.1, shadow: mkSh() });
    s.addShape(pres.shapes.OVAL, { x: x+0.2, y: y+0.19, w: 0.42, h: 0.42, fill: { color: c.badge }, line: { width: 0 } });
    s.addText(c.title, { x: x+0.74, y: y+0.17, w: cw-0.9,  h: 0.4,  fontSize: 11, bold: true, color: DARK_TXT, fontFace: "Calibri", margin: 0 });
    s.addText(c.desc,  { x: x+0.2,  y: y+0.67, w: cw-0.38, h: 0.78, fontSize: 10, color: MUTED, fontFace: "Calibri", margin: 0 });
  });
  s.addNotes("Click into Employee of the Month to show the detail page with past winners.");
}

// SLIDE 5 — AGC UNIVERSITY
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  s.addShape(pres.shapes.RECTANGLE, { x: 6.3, y: 0, w: 3.7, h: 5.625, fill: { color: "0A3D2E" }, line: { width: 0 } });
  s.addShape(pres.shapes.OVAL, { x: 5.8, y: 3.5, w: 2.5, h: 2.5, fill: { color: GREEN, transparency: 78 }, line: { width: 0 } });
  s.addText("AGC University", { x: 0.5, y: 0.32, w: 5.6, h: 0.7, fontSize: 30, bold: true, color: DARK_TXT, fontFace: "Cambria", margin: 0 });
  s.addText("Internal LMS built into the portal — structured training paths for every facility.", { x: 0.5, y: 1.08, w: 5.6, h: 0.55, fontSize: 13, color: MUTED, fontFace: "Calibri", margin: 0 });
  const lms = [
    { lbl: "Courses & Lessons",    desc: "Structured training content with rich lesson views" },
    { lbl: "Assignments",          desc: "Assigned learning with due dates and manager visibility" },
    { lbl: "Progress Tracking",    desc: "Per-employee completion summaries for compliance" },
    { lbl: "Facility-Based Access", desc: "University-only mode restricts users to their training portal" },
    { lbl: "Multi Business Unit",  desc: "Content scoped per facility: AGC, AQM, SCF, ASP" },
  ];
  lms.forEach((f, i) => {
    const y = 1.8 + i * 0.72;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y, w: 5.6, h: 0.58, fill: { color: LIGHT }, line: { width: 0 }, rectRadius: 0.08 });
    s.addText(f.lbl,  { x: 0.7, y: y+0.04, w: 1.85, h: 0.25, fontSize: 12, bold: true, color: DARK_TXT, fontFace: "Calibri", margin: 0 });
    s.addText(f.desc, { x: 0.7, y: y+0.3,  w: 5.2,  h: 0.25, fontSize: 11, color: MUTED, fontFace: "Calibri", margin: 0 });
  });
  s.addText("UofAGC\nLearning Hub", { x: 6.45, y: 0.8, w: 3.4, h: 1.1, fontSize: 24, bold: true, color: WHITE, fontFace: "Cambria", margin: 0 });
  [{ num: "4", lbl: "Business Units" }, { num: "3", lbl: "User Roles" }, { num: "SSO", lbl: "Single Sign-On" }].forEach((st, i) => {
    const y = 2.2 + i * 1.0;
    s.addText(st.num, { x: 6.45, y,        w: 3.4, h: 0.55, fontSize: 36, bold: true, color: GREEN,    fontFace: "Cambria", align: "center", margin: 0 });
    s.addText(st.lbl, { x: 6.45, y: y+0.5, w: 3.4, h: 0.3,  fontSize: 12, color: "A0BFB0", fontFace: "Calibri", align: "center", margin: 0 });
  });
  s.addNotes("Navigate to AGC University. Show a course and its lessons. Highlight facility-based access.");
}

// SLIDE 6 — TEAM & MANAGER TOOLS
{
  const s = pres.addSlide();
  s.background = { color: LIGHT };
  s.addText("Team & Manager Tools", { x: 0.5, y: 0.3, w: 9, h: 0.62, fontSize: 28, bold: true, color: DARK_TXT, fontFace: "Cambria", margin: 0 });
  s.addText("Empowering managers and employees with everything they need in one place.", { x: 0.5, y: 0.93, w: 9, h: 0.42, fontSize: 13, color: MUTED, fontFace: "Calibri", margin: 0 });
  const tools = [
    { title: "Org Chart / Team View",  desc: "Visual org structure across all business units. Filter by department, role, or facility.", badge: BLUE },
    { title: "Leave Requests",         desc: "Employees submit time-off requests; managers review and approve via their dedicated inbox.", badge: "0D7A54" },
    { title: "Manager Inbox",          desc: "All pending approvals in one view, with team overview at a glance.", badge: "7B3FA0" },
    { title: "Training Completion",    desc: "Managers see their full team's course progress to ensure compliance and development.", badge: "B84D00" },
  ];
  tools.forEach((t, i) => {
    const x = i % 2 === 0 ? 0.38 : 5.18;
    const y = i < 2 ? 1.58 : 3.38;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 4.4, h: 1.6, fill: { color: WHITE }, line: { width: 0 }, rectRadius: 0.12, shadow: mkSh() });
    s.addShape(pres.shapes.OVAL, { x: x+0.22, y: y+0.22, w: 0.5, h: 0.5, fill: { color: t.badge }, line: { width: 0 } });
    s.addText(t.title, { x: x+0.86, y: y+0.19, w: 3.35, h: 0.4,  fontSize: 13, bold: true, color: DARK_TXT, fontFace: "Calibri", margin: 0 });
    s.addText(t.desc,  { x: x+0.22, y: y+0.75, w: 3.98, h: 0.72, fontSize: 11, color: MUTED, fontFace: "Calibri", margin: 0 });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.38, y: 5.1, w: 9.22, h: 0.34, fill: { color: BLUE }, line: { width: 0 }, rectRadius: 0.06 });
  s.addText("Supported across all business units: AGC  ·  AQM  ·  SCF  ·  ASP", { x: 0.38, y: 5.1, w: 9.22, h: 0.34, fontSize: 11, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Calibri", margin: 0 });
  s.addNotes("Show the Team page org chart. Demonstrate leave request flow and the manager inbox.");
}

// SLIDE 7 — IT SUPPORT TICKETS
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 4.1, h: 5.625, fill: { color: "1A0B3E" }, line: { width: 0 } });
  s.addShape(pres.shapes.OVAL, { x: 1.8, y: 3.6, w: 3.0, h: 3.0, fill: { color: "7B3FA0", transparency: 72 }, line: { width: 0 } });
  s.addText("IT Support\nTickets", { x: 0.3, y: 0.55, w: 3.6, h: 1.55, fontSize: 32, bold: true, color: WHITE, fontFace: "Cambria", margin: 0 });
  s.addText("A full ticketing system built into the portal — no external tools needed.", { x: 0.3, y: 2.3, w: 3.5, h: 1.1, fontSize: 13, color: "B0A0D0", fontFace: "Calibri", italic: true, margin: 0 });
  const itFeats = [
    { lbl: "Submit Tickets",     desc: "Any employee can log an IT request directly from the portal." },
    { lbl: "Privacy by Default", desc: "Employees see only their own tickets — fully private." },
    { lbl: "IT Tickets Grant",   desc: "Assign full ticket visibility to specific users without full admin." },
    { lbl: "Admin Control",      desc: "Full admins see all tickets. Scoped admins need the IT Tickets grant." },
    { lbl: "Live Badge Count",   desc: "Open ticket count shown in the sidebar and navigation." },
  ];
  itFeats.forEach((f, i) => {
    const y = 0.4 + i * 1.02;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 4.4, y, w: 5.2, h: 0.84, fill: { color: LIGHT }, line: { width: 0 }, rectRadius: 0.1, shadow: mkSh() });
    s.addText(f.lbl,  { x: 4.62, y: y+0.08, w: 4.8, h: 0.3,  fontSize: 12, bold: true, color: DARK_TXT, fontFace: "Calibri", margin: 0 });
    s.addText(f.desc, { x: 4.62, y: y+0.42, w: 4.8, h: 0.34, fontSize: 11, color: MUTED, fontFace: "Calibri", margin: 0 });
  });
  s.addNotes("Open an IT ticket live. Show that regular users only see their own tickets.");
}

// SLIDE 8 — CALENDAR & EVENTS
{
  const s = pres.addSlide();
  s.background = { color: LIGHT };
  s.addText("Calendar & Upcoming Events", { x: 0.5, y: 0.3, w: 9, h: 0.62, fontSize: 28, bold: true, color: DARK_TXT, fontFace: "Cambria", margin: 0 });
  s.addText("Keep every employee informed about what's happening across AGC.", { x: 0.5, y: 0.93, w: 9, h: 0.42, fontSize: 13, color: MUTED, fontFace: "Calibri", margin: 0 });
  const colL = 0.38, colR = 5.18, cw = 4.42, ch = 3.9;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: colL, y: 1.48, w: cw, h: ch, fill: { color: WHITE }, line: { width: 0 }, rectRadius: 0.14, shadow: mkSh() });
  s.addText("Mini Calendar", { x: colL+0.28, y: 1.64, w: cw-0.56, h: 0.48, fontSize: 16, bold: true, color: BLUE, fontFace: "Calibri", margin: 0 });
  ["Monthly calendar view embedded in the sidebar", "Highlighted dates = days with events", "Hover or click a date to preview events", "Navigate forward/backward through months", "Merges Upcoming Events + Engagement Calendar"].forEach((pt, i) => {
    s.addText([{ text: pt, options: { bullet: true } }], { x: colL+0.3, y: 2.28+i*0.55, w: cw-0.6, h: 0.5, fontSize: 12, color: MED_TXT, fontFace: "Calibri", margin: 0 });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: colR, y: 1.48, w: cw, h: ch, fill: { color: WHITE }, line: { width: 0 }, rectRadius: 0.14, shadow: mkSh() });
  s.addText("Upcoming Events", { x: colR+0.28, y: 1.64, w: cw-0.56, h: 0.48, fontSize: 16, bold: true, color: BLUE, fontFace: "Calibri", margin: 0 });
  ["Facility-specific event listings", "Surfaced on the dashboard sidebar", "Admin manages events via Upcoming admin panel", "Date-range spanning events supported", "Full Upcoming page with all future events"].forEach((pt, i) => {
    s.addText([{ text: pt, options: { bullet: true } }], { x: colR+0.3, y: 2.28+i*0.55, w: cw-0.6, h: 0.5, fontSize: 12, color: MED_TXT, fontFace: "Calibri", margin: 0 });
  });
  s.addNotes("Show the Calendar page. Click a highlighted date on the mini calendar to show the event preview.");
}

// SLIDE 9 — GLOBAL SEARCH
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 2.05, fill: { color: BLUE }, line: { width: 0 } });
  s.addText("Smart Global Search", { x: 0.5, y: 0.2, w: 9, h: 0.88, fontSize: 34, bold: true, color: WHITE, fontFace: "Cambria", margin: 0 });
  s.addText("Search across all portal content from the sidebar — results appear in under 300ms.", { x: 0.5, y: 1.15, w: 9, h: 0.5, fontSize: 14, color: "C8D8FF", fontFace: "Calibri", italic: true, margin: 0 });
  const cats = [
    { title: "People",     items: ["Employee name", "Email address", "Department", "Business unit"], badge: NAVY },
    { title: "Content",    items: ["Employee of Month", "Leadership Updates", "Customer Wins", "Community Posts"], badge: "0D7A54" },
    { title: "Operations", items: ["New Hires", "Upcoming Events", "IT Tickets (scoped)", "Company News"], badge: "7B3FA0" },
  ];
  cats.forEach((cat, i) => {
    const x = 0.38 + i * 3.22;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.22, w: 2.95, h: 3.1, fill: { color: LIGHT }, line: { width: 0 }, rectRadius: 0.12 });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.22, w: 2.95, h: 0.55, fill: { color: cat.badge }, line: { width: 0 }, rectRadius: 0.12 });
    s.addShape(pres.shapes.RECTANGLE,         { x, y: 2.5,  w: 2.95, h: 0.28, fill: { color: cat.badge }, line: { width: 0 } });
    s.addText(cat.title, { x, y: 2.22, w: 2.95, h: 0.55, fontSize: 14, bold: true, color: WHITE, fontFace: "Calibri", align: "center", valign: "middle", margin: 0 });
    cat.items.forEach((item, j) => {
      s.addText([{ text: item, options: { bullet: true } }], { x: x+0.2, y: 2.88+j*0.52, w: 2.65, h: 0.48, fontSize: 12, color: MED_TXT, fontFace: "Calibri", margin: 0 });
    });
  });
  s.addText("Live debounced search  ·  Min. 2 characters  ·  Results grouped by category  ·  Click any result to navigate", { x: 0.38, y: 5.22, w: 9.24, h: 0.28, fontSize: 10, color: MUTED, align: "center", fontFace: "Calibri", margin: 0 });
  s.addNotes("Type a name or 'EOM' in the sidebar search to demonstrate.");
}

// SLIDE 10 — SECURITY & ACCESS CONTROL
{
  const s = pres.addSlide();
  s.background = { color: LIGHT };
  s.addText("Security & Access Control", { x: 0.5, y: 0.3, w: 9, h: 0.62, fontSize: 28, bold: true, color: DARK_TXT, fontFace: "Cambria", margin: 0 });
  s.addText("Role-based, grant-scoped, and SSO-ready — enterprise-grade access management.", { x: 0.5, y: 0.93, w: 9, h: 0.42, fontSize: 13, color: MUTED, fontFace: "Calibri", margin: 0 });
  const roles = [
    { role: "Admin",    color: NAVY,     feats: ["Full portal access", "User & role management", "Admin grant assignment", "All content management", "Reports & analytics"] },
    { role: "Manager",  color: BLUE,     feats: ["Team org chart", "Leave request approval", "Team training overview", "Manager inbox", "Standard portal access"] },
    { role: "Employee", color: "0D7A54", feats: ["Own profile & data", "Own IT tickets only", "Company news & feed", "AGC University access", "Calendar & events"] },
  ];
  roles.forEach((r, i) => {
    const x = 0.38 + i * 3.22;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.48, w: 2.95, h: 3.05, fill: { color: WHITE }, line: { width: 0 }, rectRadius: 0.12, shadow: mkSh() });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.48, w: 2.95, h: 0.6,  fill: { color: r.color }, line: { width: 0 }, rectRadius: 0.12 });
    s.addShape(pres.shapes.RECTANGLE,         { x, y: 1.85, w: 2.95, h: 0.24, fill: { color: r.color }, line: { width: 0 } });
    s.addText(r.role, { x, y: 1.48, w: 2.95, h: 0.6, fontSize: 16, bold: true, color: WHITE, fontFace: "Calibri", align: "center", valign: "middle", margin: 0 });
    r.feats.forEach((f, j) => {
      s.addText([{ text: f, options: { bullet: true } }], { x: x+0.2, y: 2.2+j*0.48, w: 2.6, h: 0.44, fontSize: 11, color: MED_TXT, fontFace: "Calibri", margin: 0 });
    });
  });
  const pills = [
    { title: "Microsoft Entra ID SSO", desc: "Log in with Microsoft 365 — no extra password", color: "0078D4" },
    { title: "Scoped Admin Grants",    desc: "Give specific admin sections to select users only", color: NAVY },
    { title: "University-Only Mode",   desc: "Restrict users to training content only", color: "7B3FA0" },
  ];
  pills.forEach((p, i) => {
    const x = 0.38 + i * 3.22;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 4.68, w: 2.95, h: 0.78, fill: { color: p.color }, line: { width: 0 }, rectRadius: 0.1 });
    s.addText(p.title, { x: x+0.12, y: 4.72, w: 2.72, h: 0.28, fontSize: 11, bold: true, color: WHITE, fontFace: "Calibri", margin: 0 });
    s.addText(p.desc,  { x: x+0.12, y: 5.0,  w: 2.72, h: 0.38, fontSize: 10, color: "CCE0FF", fontFace: "Calibri", margin: 0 });
  });
  s.addNotes("Key governance slide. Admin grants allow granular delegation without giving full admin access.");
}

// SLIDE 11 — THANK YOU
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  s.addShape(pres.shapes.OVAL, { x: -1.5, y: -1.8, w: 5.5, h: 5.5, fill: { color: BLUE, transparency: 68 }, line: { width: 0 } });
  s.addShape(pres.shapes.OVAL, { x: 7.2,  y: 3.2,  w: 4.0, h: 4.0, fill: { color: GREEN, transparency: 75 }, line: { width: 0 } });
  s.addShape(pres.shapes.OVAL, { x: 8.2,  y: -1.2, w: 2.8, h: 2.8, fill: { color: BLUE,  transparency: 72 }, line: { width: 0 } });
  s.addText("Thank You", { x: 0.8, y: 1.05, w: 8.4, h: 1.4, fontSize: 58, bold: true, color: WHITE, fontFace: "Cambria", align: "center", margin: 0 });
  s.addText("Built for Our People. Designed to Connect AGC.", { x: 0.8, y: 2.6, w: 8.4, h: 0.65, fontSize: 20, color: GREEN, fontFace: "Calibri", italic: true, align: "center", margin: 0 });
  s.addText("Questions? Let's discuss.", { x: 0.8, y: 3.45, w: 8.4, h: 0.5, fontSize: 16, color: "8BA0CC", fontFace: "Calibri", align: "center", margin: 0 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 3.1, y: 4.35, w: 3.8, h: 0.85, fill: { color: BLUE }, line: { width: 0 }, rectRadius: 0.1 });
  s.addText("memberportal.amirgc.com", { x: 3.1, y: 4.35, w: 3.8, h: 0.85, fontSize: 14, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: "Calibri", margin: 0 });
  s.addNotes("Open the floor for questions. Offer a live demo if time allows.");
}

pres.writeFile({ fileName: "AGC_Member_Portal_SLT.pptx" }).then(() => {
  console.log("✅ Done! AGC_Member_Portal_SLT.pptx has been created.");
});
