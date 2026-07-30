require("dotenv").config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const adpSvc = require("./src/services/adp.service");

async function main() {
  console.log("Fetching ADP data for Garima...");
  const workers = await adpSvc.getAllWorkers();

  const garima = workers.find((w) => {
    const emails = [
      ...(w.businessCommunication?.emails || []),
      ...(w.person?.communicationEmails || []),
    ].map((e) => String(e.emailUri || "").toLowerCase().trim());
    return emails.includes("garima.singh@amirgc.com");
  });

  if (!garima) {
    console.log("Garima not found in ADP by email.");
    process.exit(0);
  }

  const mapped = adpSvc.mapWorker(garima);
  console.log("\n=== Garima's ADP data ===");
  console.log("Job Title:   ", mapped.job_title);
  console.log("Department:  ", mapped.department);
  console.log("Work Email:  ", mapped.work_email);
  console.log("Work Location:", mapped.work_location);
  console.log("Employment Type:", mapped.employment_type);
  console.log("Employment Status:", mapped.employment_status);
  console.log("Hire Date:   ", mapped.hire_date);
  console.log("Birth Date:  ", mapped.birth_date);

  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
