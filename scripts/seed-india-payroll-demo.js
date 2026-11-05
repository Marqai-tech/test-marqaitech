/**
 * Task 38 — Seed INDIAN PAYROLL sample data (INR) into the DEMO tenant DB ONLY.
 * Target: tenant_3boxes-hrms-demo (3boxes-hrms-demo). LIVE tenant is NEVER touched.
 *
 * Seeds (idempotent — re-runnable):
 *   1. PayrollComponent master (India set, countryCode IND)
 *   2. StatutoryComponent (EPF/ESI/PT/LWF/TDS with authority metadata)
 *   3. TaxSlabTable + rate lines (New + Old regime FY 2025-26)
 *   4. CTC Template (ACTIVE, isDefault) + 13 CTC component mappings
 *   5. SalaryStructure + SalaryComponent (3 bands per company) + employee assignment
 *   6. PayrollStatutoryConfig for all 6 companies (state-correct PT/LWF)
 *   7. EmployeePaymentMethod (bank advice data)
 *   8. Loans (3 EMI recoveries)
 *   9. IncomeTaxDeclaration FY 2026-27 (dual-regime mix, proof statuses)
 *  10. PayrollRun 2026-10 per company + APPROVED PayrollInputs
 *  11. HTTP: recalc TNS 2026-09 (variance baseline) + calculate all 2026-10 runs via
 *      the REAL India engine (EPF/ESIC/PT/LWF/TDS, formulaTrace, INDIA_ENGINE)
 *  12. Legacy Payroll payslip rows (month 10 / 2026) so /payroll/payslips shows INR data
 *  13. ComplianceObligation + ComplianceFiling samples (EPF ECR / 24Q)
 *
 * Usage: node scripts/seed-india-payroll-demo.js --api-base http://127.0.0.1:3000
 */
const { neon } = require('@neondatabase/serverless');

const DEMO_CS = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_3boxes-hrms-demo?sslmode=require';
const API_BASE = process.argv.includes('--api-base') ? process.argv[process.argv.indexOf('--api-base') + 1] : 'http://127.0.0.1:3000';
const TENANT_SLUG = '3boxes-hrms-demo';
const PERIOD = '2026-10';
const FY = '2026-27'; // Oct 2026 falls in FY Apr2026–Mar2027
const MARKER = 'seed:india-demo';
const CTC_TEMPLATE_NAME = 'India Standard CTC (Demo)';

const sql = neon(DEMO_CS);
const q = (text, params = []) => sql.query(text, params);
const inPh = (n, off = 1) => Array.from({ length: n }, (_, i) => `$${i + off}`).join(',');
const id = (p) => `${p}_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36).slice(-4)}`;

const log = (...a) => console.log('[pay-seed]', ...a);

async function main() {
  // ── 0. Companies + admin user ─────────────────────────────────────────────
  const companies = (await sql`SELECT "id", "code", "name", "state" FROM "Company" WHERE "code" IN ('TNS','ISY','GDC','ASG','PHL','STE') ORDER BY "code"`);
  if (companies.length < 6) throw new Error(`Expected 6 demo companies, found ${companies.length}`);
  const admin = (await sql`SELECT "id" FROM "User" WHERE "email" = 'admin@3boxeshrms.com' LIMIT 1`)[0];
  log(`Companies: ${companies.map(c => c.code).join(', ')} | admin: ${admin ? admin.id : 'NOT FOUND'}`);

  // ── 1. PayrollComponent master (IND) ──────────────────────────────────────
  const compCodes = ['BASIC','HRA','DA','CONVEYANCE','MEDICAL','SPECIAL_ALLOWANCE','LTA','FUEL_REIMBURSEMENT','DRIVER_SALARY','GADGETS_REIMBURSEMENT','BOOKS_PERIODICALS','BONUS','OVERTIME','EPF_EE','EPF_ER','EPS','EPF_ADMIN','EDLI_ADMIN','ESI_EE','ESI_ER','PT','LWF_EE','LWF_ER','TDS','GRATUITY_PROVISION'];
  await q(`DELETE FROM "PayrollComponent" WHERE "countryCode" = 'IND' AND "code" IN (${inPh(compCodes.length)})`, compCodes);
  const comps = [
    ['BASIC','Basic Salary','EARNING','NORMAL','FLAT_AMOUNT',null,null,true,'FULLY_TAXABLE',null,true,true,true,'MONTHLY'],
    ['HRA','House Rent Allowance','EARNING','NORMAL','FLAT_AMOUNT',null,null,true,'PARTIALLY_TAXABLE','10(13A)',true,true,true,'MONTHLY'],
    ['DA','Dearness Allowance','EARNING','NORMAL','FLAT_AMOUNT',null,null,true,'FULLY_TAXABLE',null,true,true,true,'MONTHLY'],
    ['CONVEYANCE','Conveyance Allowance','EARNING','NORMAL','FLAT_AMOUNT',1600,null,true,'FULLY_TAXABLE',null,true,true,true,'MONTHLY'],
    ['MEDICAL','Medical Allowance','EARNING','NORMAL','FLAT_AMOUNT',1250,null,true,'FULLY_TAXABLE',null,true,true,true,'MONTHLY'],
    ['SPECIAL_ALLOWANCE','Special Allowance (Balancer)','EARNING','NORMAL','FLAT_AMOUNT',null,null,true,'FULLY_TAXABLE',null,true,true,true,'MONTHLY'],
    ['LTA','Leave Travel Allowance','REIMBURSEMENT','NORMAL','FLAT_AMOUNT',15000,null,false,'EXEMPT','10(5)',false,false,true,'ANNUAL'],
    ['FUEL_REIMBURSEMENT','Fuel & Maintenance Reimbursement','REIMBURSEMENT','NORMAL','FLAT_AMOUNT',null,null,false,'EXEMPT',null,false,false,true,'MONTHLY'],
    ['DRIVER_SALARY','Driver Salary Reimbursement','REIMBURSEMENT','NORMAL','FLAT_AMOUNT',null,null,false,'EXEMPT',null,false,false,true,'MONTHLY'],
    ['GADGETS_REIMBURSEMENT','Gadgets & Telephone Reimbursement','REIMBURSEMENT','NORMAL','FLAT_AMOUNT',null,null,false,'EXEMPT',null,false,false,true,'ANNUAL'],
    ['BOOKS_PERIODICALS','Books & Periodicals','REIMBURSEMENT','NORMAL','FLAT_AMOUNT',null,null,false,'EXEMPT',null,false,false,true,'ANNUAL'],
    ['BONUS','Performance Bonus / Variable Pay','EARNING','NORMAL','MANUAL_ENTRY',null,null,true,'FULLY_TAXABLE',null,true,true,true,'VARIABLE'],
    ['OVERTIME','Overtime','EARNING','NORMAL','MANUAL_ENTRY',null,null,true,'FULLY_TAXABLE',null,true,true,false,'VARIABLE'],
    ['EPF_EE','EPF — Employee Share (12%)','DEDUCTION','STATUTORY','FORMULA',12,'BASIC',true,'EXEMPT',null,false,true,false,'MONTHLY'],
    ['EPF_ER','EPF — Employer Share (12%)','EMPLOYER_CONTRIB','STATUTORY','FORMULA',12,'BASIC',false,null,null,false,false,true,'MONTHLY'],
    ['EPS','EPS — Pension Share (8.33%)','EMPLOYER_CONTRIB','STATUTORY','FORMULA',8.33,'BASIC',false,null,null,false,false,true,'MONTHLY'],
    ['EPF_ADMIN','EPF Admin Charges (0.5%)','EMPLOYER_CONTRIB','STATUTORY','FORMULA',0.5,'BASIC',false,null,null,false,false,true,'MONTHLY'],
    ['EDLI_ADMIN','EDLI Charges (0.5%)','EMPLOYER_CONTRIB','STATUTORY','FORMULA',0.5,'BASIC',false,null,null,false,false,true,'MONTHLY'],
    ['ESI_EE','ESI — Employee Share (0.75%)','DEDUCTION','STATUTORY','FORMULA',0.75,null,true,'EXEMPT',null,false,true,false,'MONTHLY'],
    ['ESI_ER','ESI — Employer Share (3.25%)','EMPLOYER_CONTRIB','STATUTORY','FORMULA',3.25,null,false,null,null,false,false,true,'MONTHLY'],
    ['PT','Professional Tax (State Slabs)','DEDUCTION','STATUTORY','SLAB_BASED',null,null,true,'EXEMPT',null,false,true,false,'MONTHLY'],
    ['LWF_EE','Labour Welfare Fund — Employee','DEDUCTION','STATUTORY','FLAT_AMOUNT',null,null,true,'EXEMPT',null,false,true,false,'SEMI_ANNUAL'],
    ['LWF_ER','Labour Welfare Fund — Employer','EMPLOYER_CONTRIB','STATUTORY','FLAT_AMOUNT',null,null,false,null,null,false,false,true,'SEMI_ANNUAL'],
    ['TDS','TDS on Salary — Sec 192','DEDUCTION','STATUTORY','SLAB_BASED',null,null,true,'FULLY_TAXABLE',null,false,true,false,'MONTHLY'],
    ['GRATUITY_PROVISION','Gratuity Provision (4.81%)','EMPLOYER_CONTRIB','NORMAL','FORMULA',4.81,'BASIC',false,null,null,false,false,true,'MONTHLY'],
  ];
  for (const [code, name, ctype, ccat, calcType, dv, pctBase, taxable, treatment, section, affG, affN, affC, freq] of comps) {
    await sql`INSERT INTO "PayrollComponent" ("id","code","name","componentType","componentCategory","countryCode","calculationType","defaultValue","percentageBase","isTaxable","taxTreatment","exemptionSection","affectsGross","affectsNet","affectsCTC","paymentFrequency","prorationApplicable","isActive","companyId","createdAt","updatedAt")
      VALUES (${id('pc')},${code},${name},${ctype},${ccat},'IND',${calcType},${dv},${pctBase},${taxable},${treatment},${section},${affG},${affN},${affC},${freq},true,true,NULL,NOW(),NOW())`;
  }
  log(`PayrollComponent: ${comps.length} India components seeded`);

  const compId = {};
  for (const r of await q(`SELECT "id","code" FROM "PayrollComponent" WHERE "countryCode"='IND' AND "code" IN (${inPh(compCodes.length)})`, compCodes)) compId[r.code] = r.id;

  // ── 2. StatutoryComponent ─────────────────────────────────────────────────
  await sql`DELETE FROM "StatutoryComponent" WHERE "countryCode" = 'IND' AND "componentCode" IN ('EPF','ESI','PT','LWF','TDS')`;
  const stat = [
    ['EPF','EPF — Provident Fund','EPFO (Employees Provident Fund Organisation)','EPFO','BOTH','SPECIFIC_COMPONENT','BASIC',12,15000,null,'MONTHLY','ECR',15,true],
    ['ESI','ESI — Employee (0.75%)','ESIC (Employees State Insurance Corporation)','ESIC','EMPLOYEE','GROSS_PAY',null,0.75,21000,null,'MONTHLY','ESI_RETURN',21,true],
    ['ESI','ESI — Employer (3.25%)','ESIC (Employees State Insurance Corporation)','ESIC','EMPLOYER','GROSS_PAY',null,3.25,21000,null,'MONTHLY','ESI_RETURN',21,true],
    ['PT','Professional Tax','State Commercial Tax Departments','PT-STATE','EMPLOYEE','SLAB_BASED',null,null,null,null,'MONTHLY','PT_RETURN',10,false],
    ['LWF','Labour Welfare Fund','State Labour Welfare Boards','LWF-STATE','BOTH','FLAT_RATE',null,null,null,null,'HALF_YEARLY','LWF_RETURN',20,false],
    ['TDS','TDS on Salaries — Sec 192','Income Tax Department (CBDT)','CBDT','EMPLOYEE','SLAB_BASED',null,null,null,null,'QUARTERLY','24Q',7,true],
  ];
  const statCompMap = { EPF: 'EPF_EE', ESI: 'ESI_EE', PT: 'PT', LWF: 'LWF_EE', TDS: 'TDS' };
  for (const [code, name, auth, authCode, party, basis, basisComp, rate, ceiling, , filingFreq, filingFmt, dueDay, challan] of stat) {
    await sql`INSERT INTO "StatutoryComponent" ("id","componentId","componentCode","componentName","countryCode","authorityName","authorityCode","partyType","calculationBasis","basisComponentId","ratePercentage","wageCeiling","maxContributionAmt","minContributionAmt","slabTableId","remittanceFrequency","remittanceDueDay","filingFrequency","filingFormat","penaltyRatePct","isChallanRequired","challanFormat","effectiveFrom","effectiveTo","createdAt","updatedAt")
      VALUES (${id('sc')},${compId[statCompMap[code]] || compId['EPF_EE']},${code},${name},'IND',${auth},${authCode},${party},${basis},${basisComp ? compId[basisComp] : null},${rate},${ceiling},null,null,null,'MONTHLY',${dueDay},${filingFreq || 'MONTHLY'},${filingFmt},18,${challan},'CHALLAN_281',NOW(),null,NOW(),NOW())`;
  }
  log(`StatutoryComponent: ${stat.length} statutory registrations seeded`);

  // ── 3. Tax slab tables (FY 2025-26 both regimes) ──────────────────────────
  await sql`DELETE FROM "TaxSlabRateLine" WHERE "slabTableId" IN (SELECT "id" FROM "TaxSlabTable" WHERE "countryCode"='IND' AND "name" IN ('India — New Regime FY 2025-26','India — Old Regime FY 2025-26'))`;
  await sql`DELETE FROM "TaxSlabTable" WHERE "countryCode"='IND' AND "name" IN ('India — New Regime FY 2025-26','India — Old Regime FY 2025-26')`;
  const newT = id('tst'); const oldT = id('tst');
  await sql`INSERT INTO "TaxSlabTable" ("id","name","countryCode","taxYear","filingStatus","regimeType","effectiveFrom","companyId","createdAt","updatedAt") VALUES (${newT},'India — New Regime FY 2025-26','IND','FY 2025-26','SINGLE','NEW',NOW(),NULL,NOW(),NOW())`;
  await sql`INSERT INTO "TaxSlabTable" ("id","name","countryCode","taxYear","filingStatus","regimeType","effectiveFrom","companyId","createdAt","updatedAt") VALUES (${oldT},'India — Old Regime FY 2025-26','IND','FY 2025-26','SINGLE','OLD',NOW(),NULL,NOW(),NOW())`;
  const newSlabs = [[1,0,400000,0],[2,400000,800000,5],[3,800000,1200000,10],[4,1200000,1600000,15],[5,1600000,2000000,20],[6,2000000,2400000,25],[7,2400000,null,30]];
  for (const [seq, from, to, rate] of newSlabs) await sql`INSERT INTO "TaxSlabRateLine" ("id","slabTableId","sequence","incomeFrom","incomeTo","ratePercentage","fixedAmount","surchargeRate","cessRate","componentId","createdAt","updatedAt") VALUES (${id('tsl')},${newT},${seq},${from},${to},${rate},null,null,4,null,NOW(),NOW())`;
  const oldSlabs = [[1,0,250000,0],[2,250000,500000,5],[3,500000,1000000,20],[4,1000000,null,30]];
  for (const [seq, from, to, rate] of oldSlabs) await sql`INSERT INTO "TaxSlabRateLine" ("id","slabTableId","sequence","incomeFrom","incomeTo","ratePercentage","fixedAmount","surchargeRate","cessRate","componentId","createdAt","updatedAt") VALUES (${id('tsl')},${oldT},${seq},${from},${to},${rate},null,null,4,null,NOW(),NOW())`;
  log('TaxSlabTable: NEW + OLD regime FY 2025-26 slabs seeded');

  // ── 4. CTC Template (ACTIVE + default) with 13 mappings ──────────────────
  await sql`DELETE FROM "CTCComponentMapping" WHERE "ctcTemplateId" IN (SELECT "id" FROM "CTCTemplate" WHERE "name" = ${CTC_TEMPLATE_NAME})`;
  await sql`DELETE FROM "CTCTemplate" WHERE "name" = ${CTC_TEMPLATE_NAME}`;
  const tplId = id('ctc');
  await sql`INSERT INTO "CTCTemplate" ("id","name","countryCode","legalEntityId","currencyCode","ctcType","version","status","isDefault","basePayPct","createdBy","companyId","createdAt","updatedAt")
    VALUES (${tplId},${CTC_TEMPLATE_NAME},'IND',NULL,'INR','ANNUAL',1,'ACTIVE',true,40,${admin ? admin.id : 'seed'},NULL,NOW(),NOW())`;
  const mappings = [
    ['BASIC','EARNING','PERCENTAGE_OF_CTC',40,null,1,true],
    ['HRA','EARNING','PERCENTAGE_OF_COMPONENT',50,'BASIC',2,true],
    ['DA','EARNING','PERCENTAGE_OF_COMPONENT',0,'BASIC',3,true],
    ['CONVEYANCE','EARNING','FIXED_AMOUNT',1600,null,4,true],
    ['MEDICAL','EARNING','FIXED_AMOUNT',1250,null,5,true],
    ['LTA','REIMBURSEMENT','FIXED_AMOUNT',15000,null,6,false],
    ['FUEL_REIMBURSEMENT','REIMBURSEMENT','FIXED_AMOUNT',0,null,7,false],
    ['DRIVER_SALARY','REIMBURSEMENT','FIXED_AMOUNT',0,null,8,false],
    ['GADGETS_REIMBURSEMENT','REIMBURSEMENT','FIXED_AMOUNT',0,null,9,false],
    ['BOOKS_PERIODICALS','REIMBURSEMENT','FIXED_AMOUNT',0,null,10,false],
    ['EPF_ER','EMPLOYER_CONTRIBUTION','PERCENTAGE_OF_COMPONENT',12,'BASIC',11,true],
    ['ESI_ER','EMPLOYER_CONTRIBUTION','PERCENTAGE_OF_CTC',3.25,null,12,true],
    ['GRATUITY_PROVISION','EMPLOYER_CONTRIBUTION','PERCENTAGE_OF_COMPONENT',4.81,'BASIC',13,true],
  ];
  for (const [nm, cat, method, val, base, seq, taxable] of mappings) {
    await sql`INSERT INTO "CTCComponentMapping" ("id","ctcTemplateId","componentId","componentName","componentCategory","allocationMethod","allocationValue","baseComponentId","formulaExpression","calculationSequence","isStatutory","isTaxable","taxExemptionLimit","frequency","prorationRule","minAmount","maxAmount","roundingRule","createdAt","updatedAt")
      VALUES (${id('ccm')},${tplId},${compId[nm] || null},${nm},${cat},${method},${val},${base},null,${seq},${cat === 'EMPLOYER_CONTRIBUTION'},${taxable},0,${nm === 'LTA' || nm === 'GADGETS_REIMBURSEMENT' || nm === 'BOOKS_PERIODICALS' ? 'ANNUAL' : 'MONTHLY'},'CALENDAR_DAYS',null,null,null,NOW(),NOW())`;
  }
  log(`CTCTemplate: ACTIVE default template + ${mappings.length} mappings seeded`);

  // ── 5. Salary structures (3 bands per company) + employee assignment ─────
  const oldStructs = await sql`SELECT "id" FROM "SalaryStructure" WHERE "name" LIKE 'Demo India Band %'`;
  if (oldStructs.length) {
    const ids = oldStructs.map(s => s.id);
    await q(`DELETE FROM "SalaryComponent" WHERE "salaryStructureId" IN (${inPh(ids.length)})`, ids);
    await q(`DELETE FROM "SalaryStructure" WHERE "id" IN (${inPh(ids.length)})`, ids);
  }
  const bands = [
    ['A', 'Leadership', 'L5', 'L6'],
    ['B', 'Management', 'L3', 'L4'],
    ['C', 'Executive', 'L1', 'L2'],
  ];
  const structByLevel = {};
  for (const c of companies) {
    for (const [band, label, ,] of bands) {
      const sid = id('ss');
      await sql`INSERT INTO "SalaryStructure" ("id","name","companyId","country","currency","description","status","createdAt","updatedAt")
        VALUES (${sid},${'Demo India Band ' + band + ' — ' + label},${c.id},'IN','INR',${'Indian CTC structure: Basic 40% of CTC, HRA 50% of Basic, statutory EPF/PT/TDS deductions (INR)'},'active',NOW(),NOW())`;
      structByLevel[`${c.code}:${band}`] = sid;
      const scs = [
        ['Basic', 'earning', 'basic', 'percentage', 40, 'CTC', true, false, 1],
        ['HRA', 'earning', 'hra', 'percentage', 50, 'BASIC', true, false, 2],
        ['Conveyance', 'earning', 'allowance', 'fixed', 1600, null, true, false, 3],
        ['Medical', 'earning', 'allowance', 'fixed', 1250, null, true, false, 4],
        ['Special Allowance', 'earning', 'allowance', 'fixed', 0, null, true, false, 5],
        ['LTA (Annual)', 'earning', 'allowance', 'fixed', 15000, null, false, false, 6],
        ['EPF (Employee 12%)', 'deduction', 'pf', 'percentage', 12, 'BASIC', true, true, 7],
        ['Professional Tax', 'deduction', 'other', 'fixed', 200, null, true, true, 8],
        ['TDS on Salary', 'deduction', 'tax', 'formula', 0, null, true, true, 9],
      ];
      for (const [nm, type, cat, calc, val, pctOf, taxable, isStat, order] of scs) {
        await sql`INSERT INTO "SalaryComponent" ("id","salaryStructureId","name","type","category","calculationType","value","percentageOf","formula","isTaxable","isStatutory","maxLimit","sortOrder","status","createdAt","updatedAt")
          VALUES (${id('ssc')},${sid},${nm},${type},${cat},${calc},${val},${pctOf},null,${taxable},${isStat},null,${order},'active',NOW(),NOW())`;
      }
    }
  }
  // Assign structures by designation level
  const emps = (await sql`
    SELECT e."id", e."employeeId", e."firstName", e."lastName", e."salary", e."companyId", e."state", e."status",
           d."level" AS "desigLevel", c."code" AS "companyCode"
    FROM "Employee" e
    JOIN "Designation" d ON d."id" = e."designationId"
    JOIN "Company" c ON c."id" = e."companyId"
    WHERE c."code" IN ('TNS','ISY','GDC','ASG','PHL','STE') AND e."status" = 'active' AND e."salary" IS NOT NULL`);
  const bandFor = (lvl) => (lvl >= 5 ? 'A' : lvl >= 3 ? 'B' : 'C');
  for (const e of emps) {
    const sid = structByLevel[`${e.companyCode}:${bandFor(e.desigLevel || 1)}`];
    if (sid) await sql`UPDATE "Employee" SET "salaryStructureId" = ${sid} WHERE "id" = ${e.id}`;
  }
  log(`SalaryStructure: ${companies.length * 3} band structures; assigned to ${emps.length} active salaried employees`);

  // One low-earner for ESI demo (gross <= ₹21,000/month)
  const low = emps.find(e => e.companyCode === 'TNS' && (e.desigLevel || 1) <= 2);
  if (low) { await sql`UPDATE "Employee" SET "salary" = 240000 WHERE "id" = ${low.id}`; log(`ESI demo: ${low.employeeId} salary set to ₹2,40,000/yr (₹20,000/mo → ESI applicable)`); }

  // ── 6. PayrollStatutoryConfig per company (state-correct) ────────────────
  const cfgState = { TNS: ['TG','TG',true], ISY: ['KA','KA',false], GDC: ['MH','MH',false], ASG: ['DL','DL',false], PHL: ['TN','TN',false], STE: ['MH','MH',false] };
  for (const c of companies) {
    const [pt, lwf, pfActual] = cfgState[c.code] || ['MH','MH',false];
    const existing = await sql`SELECT "id" FROM "PayrollStatutoryConfig" WHERE "companyId" = ${c.id} LIMIT 1`;
    if (existing.length) {
      await sql`UPDATE "PayrollStatutoryConfig" SET "ptState"=${pt}, "lwfState"=${lwf}, "pfOnActualBasic"=${pfActual}, "pfWageCeiling"=15000, "pfAdminCharges"=true, "esiEnabled"=true, "esiWageLimit"=21000, "tdsRegimeDefault"='NEW', "varianceThresholdPct"=5, "notes"=${'Demo India config — ' + c.name + ' (' + (c.state || '') + ')'}, "updatedAt"=NOW() WHERE "id"=${existing[0].id}`;
    } else {
      await sql`INSERT INTO "PayrollStatutoryConfig" ("id","companyId","countryCode","ptState","lwfState","pfOnActualBasic","pfWageCeiling","pfAdminCharges","esiEnabled","esiWageLimit","tdsRegimeDefault","declarationWindowMonth","proofWindowMonth","proofDeadlineMonth","tdsAdjustFromMonth","varianceThresholdPct","notes","updatedAt")
        VALUES (${id('psc')},${c.id},'IN',${pt},${lwf},${pfActual},15000,true,true,21000,'NEW',4,1,1,2,5,${'Demo India config — ' + c.name + ' (' + (c.state || '') + ')'},NOW())`;
    }
  }
  log('PayrollStatutoryConfig: 6 companies configured (TG/KA/MH/DL/TN/MH) — TNS uses PF-on-actual-Basic');

  // ── 7. EmployeePaymentMethod ──────────────────────────────────────────────
  for (const e of emps) {
    await sql`DELETE FROM "EmployeePaymentMethod" WHERE "employeeId" = ${e.id}`;
    await sql`INSERT INTO "EmployeePaymentMethod" ("id","employeeId","paymentType","bankName","bankAccountNo","bankIfscCode","bankBranch","accountType","currencyCode","splitType","splitValue","isPrimary","priority","status","effectiveFrom","createdAt","updatedAt")
      VALUES (${id('epm')},${e.id},'DIRECT_DEPOSIT',${'HDFC Bank'},${'XXXXXXXX' + Math.floor(1000 + Math.random() * 8999)},${'HDFC000' + Math.floor(1000 + Math.random() * 8999)},${'City Branch'},'SALARY','INR',null,null,true,1,'active',NOW(),NOW(),NOW())`;
  }
  log(`EmployeePaymentMethod: ${emps.length} salary bank accounts seeded`);

  // ── 8. Loans ──────────────────────────────────────────────────────────────
  await sql`DELETE FROM "Loan" WHERE "remarks" = ${MARKER}`;
  const tnsEmps = emps.filter(e => e.companyCode === 'TNS');
  const loans = [
    ['PERSONAL', 200000, 9.5, 24, 9206, 200000],
    ['VEHICLE', 600000, 8.7, 48, 14903, 600000],
    ['EMERGENCY', 50000, 0, 10, 5000, 40000],
  ];
  for (let i = 0; i < loans.length && i < tnsEmps.length; i++) {
    const [type, amt, rate, tenure, emi, outstanding] = loans[i];
    const e = tnsEmps[i];
    await sql`INSERT INTO "Loan" ("id","employeeId","loanType","loanAmount","interestRate","tenureMonths","emiAmount","outstandingBalance","disbursedAmount","disbursedDate","startDate","recoveredAmount","remainingEmis","status","recoverySchedule","remarks","createdAt","updatedAt")
      VALUES (${id('ln')},${e.id},${type},${amt},${rate},${tenure},${emi},${outstanding},${amt},'2026-07-01','2026-07-01',0,${tenure},'active',${JSON.stringify({ mode: 'MONTHLY_EMI', deductionCode: 'LOAN_EMI' })},${MARKER},NOW(),NOW())`;
  }
  log(`Loan: ${Math.min(loans.length, tnsEmps.length)} active EMI loans seeded (TNS)`);

  // ── 9. Income-tax declarations FY 2026-27 ────────────────────────────────
  await sql`DELETE FROM "IncomeTaxDeclaration" WHERE "financialYear" = ${FY} AND "createdBy" = ${MARKER}`;
  const isyEmps = emps.filter(e => e.companyCode === 'ISY');
  const declPlan = [
    [tnsEmps[0], 'NEW', 'NOT_SUBMITTED', {}],
    [tnsEmps[1], 'OLD', 'VERIFIED', { c80C: 150000, d80D: 25000, hraRent: 240000, hraMetro: false, hraExempt: 120000 }],
    [tnsEmps[2], 'OLD', 'PENDING_REVIEW', { c80C: 150000, d80D: 30000, hraRent: 300000, hraMetro: false, hraExempt: 150000 }],
    [tnsEmps[3], 'NEW', 'NOT_SUBMITTED', {}],
    [isyEmps[0], 'OLD', 'VERIFIED', { c80C: 150000, d80D: 25000, hraRent: 360000, hraMetro: true, hraExempt: 180000 }],
    [isyEmps[1], 'NEW', 'NOT_SUBMITTED', {}],
    [isyEmps[2], 'OLD', 'PENDING_REVIEW', { c80C: 60000, d80D: 20000, hraRent: 150000, hraMetro: false, hraExempt: 75000 }],
  ];
  for (const [e, regime, proof, d] of declPlan) {
    if (!e) continue;
    const c80C = d.c80C || 0, d80D = d.d80D || 0;
    const total = c80C + d80D + (d.hraExempt || 0);
    await sql`INSERT INTO "IncomeTaxDeclaration" ("id","employeeId","financialYear","regimeType","section80C_PPF","section80C_ELSS","section80C_LIC","section80C_HomeLoanPrincipal","section80C_Other","section80C_Total","section80D_Self","section80D_Parents","section80D_Total","section80CCD_NPS","section24b_HomeLoanInterest","hra_ActualHRA","hra_RentPaid","hra_IsMetro","hra_ExemptionCalc","section80E_EducationLoan","section80G_Donations","section80TTA_SavingsInterest","otherDeductions","totalDeductions","taxableIncome","estimatedTax","proofStatus","proofSubmittedAt","proofDocs","sectionProofStatus","regimeElectionLocked","status","submittedAt","createdBy","createdAt","updatedAt")
      VALUES (${id('itd')},${e.id},${FY},${regime},${d.c80C ? 60000 : 0},${d.c80C ? 50000 : 0},${d.c80C ? 40000 : 0},0,0,${c80C},${d80D},0,${d80D},0,0,${d.hraRent ? d.hraRent : 0},${d.hraRent || 0},${!!d.hraMetro},${d.hraExempt || 0},0,0,0,0,${total},0,0,${proof},${proof === 'NOT_SUBMITTED' ? null : new Date().toISOString()},null,${JSON.stringify({ '80C': proof === 'VERIFIED' ? 'VERIFIED' : 'PENDING', '80D': proof === 'VERIFIED' ? 'VERIFIED' : 'PENDING', HRA: proof === 'VERIFIED' ? 'VERIFIED' : 'PENDING' })},${proof === 'VERIFIED'},'SUBMITTED',NOW(),${MARKER},NOW(),NOW())`;
  }
  log(`IncomeTaxDeclaration: ${declPlan.filter(p => p[0]).length} FY ${FY} declarations (dual-regime mix, proof workflow)`);

  // ── 10. PayrollRun 2026-10 per company + APPROVED inputs ─────────────────
  const runs = {};
  for (const c of companies) {
    const existing = await sql`SELECT "id","runStatus" FROM "PayrollRun" WHERE "legalEntityId" = ${c.id} AND "payrollPeriod" = ${PERIOD} AND "runType" = 'REGULAR' LIMIT 1`;
    let rid;
    if (existing.length) {
      rid = existing[0].id;
      await sql`UPDATE "PayrollRun" SET "runStatus"='OPEN', "companyId"=${c.id}, "currencyCode"='INR', "payDate"='2026-11-01', "periodStartDate"='2026-10-01', "periodEndDate"='2026-10-31', "updatedAt"=NOW() WHERE "id"=${rid}`;
    } else {
      rid = id('pr');
      await sql`INSERT INTO "PayrollRun" ("id","legalEntityId","payrollPeriod","periodStartDate","periodEndDate","payDate","runType","runStatus","currencyCode","taxProjectionMethod","includeStatutory","processingMode","initiatedBy","companyId","totalEmployees","totalGrossPay","totalDeductions","totalNetPay","totalEmployerContrib","createdAt","updatedAt")
        VALUES (${rid},${c.id},${PERIOD},'2026-10-01','2026-10-31','2026-11-01','REGULAR','OPEN','INR','CUMULATIVE',true,'FULL',${admin ? admin.id : 'seed'},${c.id},0,0,0,0,0,NOW(),NOW())`;
    }
    runs[c.code] = rid;
  }
  // Inputs on TNS run (calculate only consumes APPROVED)
  await sql`DELETE FROM "PayrollInput" WHERE "payrollRunId" = ${runs.TNS}`;
  const inputPlan = [
    [tnsEmps[0], 'VARIABLE_PAY', 'BONUS', 50000, 'AMOUNT', 'Q3 performance bonus'],
    [tnsEmps[1], 'OVERTIME', 'OVERTIME', 10, 'HOURS', 'Release-week overtime'],
    [tnsEmps[2], 'REIMBURSEMENT', 'FUEL_REIMBURSEMENT', 3500, 'AMOUNT', 'Fuel reimbursement — bills attached'],
    [tnsEmps[3], 'LOAN', 'LOAN_EMI', 9206, 'AMOUNT', 'Personal loan EMI'],
  ];
  for (const [e, type, code, val, unit, rem] of inputPlan) {
    if (!e) continue;
    await sql`INSERT INTO "PayrollInput" ("id","payrollRunId","employeeId","inputType","componentCode","inputValueNumeric","unitType","inputDateFrom","inputDateTo","currencyCode","approvalStatus","approvedBy","approvalDate","source","referenceDocument","remarks","createdBy","createdAt","updatedAt")
      VALUES (${id('pi')},${runs.TNS},${e.id},${type},${code},${val},${unit},'2026-10-01','2026-10-31','INR','APPROVED',${admin ? admin.id : 'seed'},NOW(),'MANUAL',null,${rem},${MARKER},NOW(),NOW())`;
  }
  log(`PayrollRun: 6 × ${PERIOD} runs created/reused (OPEN) + ${inputPlan.filter(i => i[0]).length} APPROVED inputs on TNS`);

  return { companies, admin, runs, emps };
}

// ── HTTP phase: real engine calculation via API ───────────────────────────
// Uses raw http.request so we can set Host = demo domain — the Next.js
// middleware derives x-tenant-slug from Host (and overwrites our header),
// so a plain 127.0.0.1 Host would resolve to the wrong tenant ("127").
const http = require('http');

function apiFetch(base, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(base.replace(/\/$/, '') + path);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search, method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers, Host: 'nexus-hrms-mu.vercel.app',
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: (() => { try { return JSON.parse(data); } catch { return data; } })() }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function mintToken() {
  const { SignJWT } = await import('jose');
  const secret = new TextEncoder().encode(process.env.JWT_SECRET || '3boxes-hrms-fallback-secret');
  const user = (await sql`SELECT "id","email","tenantId","role" FROM "User" WHERE "email" = 'admin@3boxeshrms.com' LIMIT 1`)[0];
  if (!user) throw new Error('Demo admin user not found');
  return new SignJWT({ userId: user.id, email: user.email, role: user.role || 'admin', tenantId: user.tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);
}

async function httpPhase({ companies, runs }) {
  const base = API_BASE.replace(/\/$/, '');
  const token = await mintToken();
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-tenant-slug': TENANT_SLUG };
  log('Minted admin JWT (bypasses login endpoint) — tenant slug: ' + TENANT_SLUG);

  const calc = async (runId) => {
    const res = await apiFetch(base, `/api/payroll/runs/${runId}/calculate`, { method: 'POST', headers: H, body: {} });
    if (res.status < 200 || res.status >= 300) throw new Error(`calculate ${runId}: ${res.status} ${JSON.stringify(res.json).slice(0, 300)}`);
    return res.json.data;
  };
  const patch = async (runId, runStatus) => {
    const res = await apiFetch(base, `/api/payroll/runs/${runId}`, { method: 'PATCH', headers: H, body: { runStatus } });
    if (res.status < 200 || res.status >= 300) throw new Error(`PATCH ${runId} → ${runStatus}: ${res.status} ${JSON.stringify(res.json).slice(0, 200)}`);
  };

  // Baseline: TNS 2026-09 run (temporarily reopen → recalc → restore DISBURSED)
  const baseline = await sql`SELECT "id" FROM "PayrollRun" WHERE "legalEntityId" = ${companies.find(c => c.code === 'TNS').id} AND "payrollPeriod" = '2026-09' AND "runType" = 'REGULAR' LIMIT 1`;
  if (baseline.length) {
    await sql`UPDATE "PayrollRun" SET "runStatus"='OPEN', "companyId"=${companies.find(c => c.code === 'TNS').id}, "payDate"='2026-10-01' WHERE "id"=${baseline[0].id}`;
    const s = await calc(baseline[0].id);
    await sql`UPDATE "PayrollRun" SET "runStatus"='DISBURSED', "updatedAt"=NOW() WHERE "id"=${baseline[0].id}`;
    log(`Baseline 2026-09 recalculated: ${s.summary.totalEmployees} employees, net ₹${Math.round(s.summary.totalNetPay).toLocaleString('en-IN')}`);
  }

  // Advance TNS 2026-10 through the full governance chain
  const tnsSummary = await calc(runs.TNS);
  log(`TNS calculated: ${tnsSummary.summary.totalEmployees} emp | gross ₹${Math.round(tnsSummary.summary.totalGrossPay).toLocaleString('en-IN')} | ded ₹${Math.round(tnsSummary.summary.totalDeductions).toLocaleString('en-IN')} | net ₹${Math.round(tnsSummary.summary.totalNetPay).toLocaleString('en-IN')} | employer ₹${Math.round(tnsSummary.summary.totalEmployerContrib).toLocaleString('en-IN')} | engine ${tnsSummary.summary.engine}`);
  for (const st of ['REVIEW', 'APPROVED', 'ACCOUNTING', 'DISBURSED']) await patch(runs.TNS, st);
  log('TNS run advanced: REVIEW → APPROVED → ACCOUNTING → DISBURSED');

  const isySummary = await calc(runs.ISY);
  await patch(runs.ISY, 'REVIEW'); await patch(runs.ISY, 'APPROVED');
  log(`ISY calculated + APPROVED: ${isySummary.summary.totalEmployees} emp, net ₹${Math.round(isySummary.summary.totalNetPay).toLocaleString('en-IN')}`);

  const gdcSummary = await calc(runs.GDC);
  await patch(runs.GDC, 'REVIEW');
  log(`GDC calculated + in REVIEW (variance governance): ${gdcSummary.summary.totalEmployees} emp`);

  const phl = await calc(runs.PHL); const ste = await calc(runs.STE);
  log(`PHL + STE calculated (left in PROCESSING for demo of mid-cycle state)`);
  // ASG stays OPEN — pre-payroll input-collection stage demo

  // Variance report vs baseline
  const vres = await apiFetch(base, `/api/payroll/reports/variance?runId=${runs.TNS}`, { headers: H });
  const vj = vres.json || {};
  const vrows = vj?.data?.rows || vj?.rows || [];
  log(`Variance report (TNS vs 2026-09): ${vrows.length} rows, ${vrows.filter(r => r.flagged || r.isFlagged).length} flagged > threshold`);
}

// ── Post-calc: legacy payslips + compliance filings ───────────────────────
async function finalize({ companies, runs, emps = [] }) {
  // Legacy Payroll rows for month 10/2026 from run lines (drives /payroll/payslips)
  await sql`DELETE FROM "Payroll" WHERE "month" = 10 AND "year" = 2026`;
  const statusByCompany = { TNS: 'paid', ISY: 'processed', GDC: 'processed', PHL: 'draft', STE: 'draft' };
  const runIds = Object.entries(runs).filter(([c]) => statusByCompany[c]).map(([, r]) => r);
  const lines = await q(`SELECT "payrollRunId","employeeId","componentCode","componentType","finalAmount" FROM "PayrollTransactionLine" WHERE "payrollRunId" IN (${inPh(runIds.length)}) AND "isReversal" = false`, runIds);
  const byEmp = {};
  for (const l of lines) {
    const k = `${l.payrollRunId}:${l.employeeId}`;
    byEmp[k] = byEmp[k] || { run: l.payrollRunId, basic: 0, hra: 0, da: 0, conv: 0, med: 0, other: 0, pf: 0, esi: 0, tax: 0, pt: 0, otherDed: 0 };
    const a = Number(l.finalAmount) || 0; const o = byEmp[k];
    switch (l.componentCode) {
      case 'BASIC': o.basic += a; break; case 'HRA': o.hra += a; break; case 'DA': o.da += a; break;
      case 'CONVEYANCE': o.conv += a; break; case 'MEDICAL': o.med += a; break;
      case 'EPF_EE': o.pf += a; break; case 'ESI_EE': o.esi += a; break; case 'TDS': o.tax += a; break; case 'PT': o.pt += a; break;
      default:
        if (l.componentType === 'EARNING' || l.componentType === 'REIMBURSEMENT') o.other += a;
        else if (l.componentType === 'DEDUCTION') o.otherDed += a;
    }
  }
  const runCompany = {}; for (const [code, rid] of Object.entries(runs)) runCompany[rid] = code;
  let n = 0;
  for (const [k, o] of Object.entries(byEmp)) {
    const companyCode = runCompany[o.run];
    const gross = o.basic + o.hra + o.da + o.conv + o.med + o.other;
    const ded = o.pf + o.esi + o.tax + o.pt + o.otherDed;
    if (gross <= 0) continue;
    await sql`INSERT INTO "Payroll" ("id","employeeId","month","year","basicSalary","hra","da","conveyance","medical","otherAllowances","grossSalary","pf","esi","tax","professionalTax","otherDeductions","totalDeductions","netSalary","currency","status","paidDate","createdAt","updatedAt")
      VALUES (${id('pay')},${k.split(':')[1]},10,2026,${Math.round(o.basic)},${Math.round(o.hra)},${Math.round(o.da)},${Math.round(o.conv)},${Math.round(o.med)},${Math.round(o.other)},${Math.round(gross)},${Math.round(o.pf)},${Math.round(o.esi)},${Math.round(o.tax)},${Math.round(o.pt)},${Math.round(o.otherDed)},${Math.round(ded)},${Math.round(gross - ded)},'INR',${statusByCompany[companyCode]},${statusByCompany[companyCode] === 'paid' ? '2026-11-01' : null},NOW(),NOW())`;
    n++;
  }
  log(`Legacy Payroll: ${n} INR payslip rows for Oct 2026 (drives /payroll/payslips)`);

  // Compliance obligation + filings
  await sql`DELETE FROM "ComplianceFiling" WHERE "filePath" = ${MARKER}`;
  await sql`DELETE FROM "ComplianceObligation" WHERE "name" IN ('EPF Monthly ECR — Demo','Form 24Q Quarterly TDS — Demo')`;
  const tns = companies.find(c => c.code === 'TNS');
  const tnsEmps = emps.filter(e => e.companyCode === 'TNS');
  const ob1 = id('co'); const ob2 = id('co');
  await sql`INSERT INTO "ComplianceObligation" ("id","name","countryCode","authorityName","filingType","frequency","dueDateRule","graceDays","responsibleRole","reminderDaysBefore","autoGenerate","filingFormat","isActive","companyId","createdAt","updatedAt")
    VALUES (${ob1},'EPF Monthly ECR — Demo','IND','EPFO','RETURN','MONTHLY','D+15',5,'PAYROLL_ADMIN','7,3,1',true,'ECR',true,${tns.id},NOW(),NOW())`;
  await sql`INSERT INTO "ComplianceObligation" ("id","name","countryCode","authorityName","filingType","frequency","dueDateRule","graceDays","responsibleRole","reminderDaysBefore","autoGenerate","filingFormat","isActive","companyId","createdAt","updatedAt")
    VALUES (${ob2},'Form 24Q Quarterly TDS — Demo','IND','Income Tax Department (CBDT)','RETURN','QUARTERLY','D+31',7,'PAYROLL_ADMIN','14,7,1',true,'24Q',true,${tns.id},NOW(),NOW())`;
  await sql`INSERT INTO "ComplianceFiling" ("id","complianceId","payrollRunId","filingPeriod","filingStatus","generatedDate","filingAmount","filePath","createdAt","updatedAt")
    VALUES (${id('cf')},${ob1},${runs.TNS},'2026-10','GENERATED',NOW(),${Math.round(tnsEmps.length * 1800)},${MARKER},NOW(),NOW())`;
  await sql`INSERT INTO "ComplianceFiling" ("id","complianceId","payrollRunId","filingPeriod","filingStatus","generatedDate","filePath","createdAt","updatedAt")
    VALUES (${id('cf')},${ob2},${runs.TNS},'2026-10','UNDER_REVIEW',NOW(),${MARKER},NOW(),NOW())`;
  log('ComplianceObligation + 2 filings (EPF ECR GENERATED, 24Q UNDER_REVIEW) seeded for TNS');
}

(async () => {
  const ctx = await main();
  if (process.argv.includes('--db-only')) { log('DB-only mode — skipping HTTP engine phase'); return; }
  try {
    await httpPhase(ctx);
  } catch (e) {
    console.error('[pay-seed] HTTP phase failed (DB seeds are still in place):', e.message);
    process.exitCode = 2;
  }
  await finalize(ctx);
  log('DONE — Indian payroll sample data (INR) seeded in DEMO tenant only');
})();
